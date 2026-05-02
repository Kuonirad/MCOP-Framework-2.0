"""MemoryPack + Direct Forcing reference implementation.

A self-contained, CPU-runnable scaffold of the architecture described in
arXiv 2510.01784 ("Pack and Force Your Memory: Long-form and Consistent
Video Generation"), used as the algorithmic core for MCOP Video Generator
4.0's long-form video pipeline.

This file uses Jupytext "percent" format. Convert to a notebook with::

    jupytext --to notebook examples/memorypack_direct_forcing.py

Run as a script for a CPU smoke test::

    python examples/memorypack_direct_forcing.py

The smoke test exercises the full forward pass and both training-stage
losses on random tensors and prints the resulting scalars. It is *not*
a trained model.
"""

# %% [markdown]
# ## Cell 1 — Imports

# %%
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from einops import rearrange

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# %% [markdown]
# ## Cell 2 — Configuration

# %%
@dataclass
class Config:
    # Video latent shape
    T: int = 8
    H: int = 16
    W: int = 16
    C: int = 4

    # MemoryPack
    n_heads: int = 4
    d_model: int = 128
    short_window: int = 4
    long_topk: int = 4
    memory_bank_size: int = 32

    # Direct Forcing
    sigma_min: float = 1e-3

    # Guidance
    text_dim: int = 64
    image_dim: int = 64


# %% [markdown]
# ## Cell 3 — FramePack (short-term memory)

# %%
class FramePack(nn.Module):
    """Compresses adjacent frames via temporal Conv3d into context tokens."""

    def __init__(self, in_channels: int, d_model: int, window: int = 4) -> None:
        super().__init__()
        self.window = window
        self.temp_conv = nn.Conv3d(
            in_channels,
            d_model,
            kernel_size=(window, 3, 3),
            padding=(0, 1, 1),
        )
        self.norm = nn.LayerNorm(d_model)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, C, T, H, W)
        if x.shape[2] < self.window:
            pad = self.window - x.shape[2]
            x = F.pad(x, (0, 0, 0, 0, pad, 0))
        feat = self.temp_conv(x)  # (B, D, T', H, W)
        feat = rearrange(feat, "b d t h w -> b (t h w) d")
        return self.norm(feat)


# %% [markdown]
# ## Cell 4 — SemanticPack (long-term retrieval)

# %%
class SemanticMemoryBank(nn.Module):
    """FIFO key/value bank retrieved by cosine similarity to a guidance query."""

    def __init__(self, d_model: int, max_size: int = 32) -> None:
        super().__init__()
        self.d_model = d_model
        self.max_size = max_size
        self.register_buffer("keys", torch.zeros(0, d_model))
        self.register_buffer("values", torch.zeros(0, d_model))

    @torch.no_grad()
    def update(self, new_keys: torch.Tensor, new_values: torch.Tensor) -> None:
        self.keys = torch.cat([self.keys, new_keys], dim=0)[-self.max_size:]
        self.values = torch.cat([self.values, new_values], dim=0)[-self.max_size:]

    def retrieve(self, query: torch.Tensor, topk: int) -> torch.Tensor:
        if self.keys.shape[0] == 0:
            return torch.zeros(topk, self.d_model, device=query.device)
        sim = F.cosine_similarity(query.unsqueeze(0), self.keys, dim=-1)
        k = min(topk, self.keys.shape[0])
        idx = sim.topk(k).indices
        vals = self.values[idx]
        if k < topk:
            pad = torch.zeros(topk - k, self.d_model, device=query.device)
            vals = torch.cat([vals, pad], dim=0)
        return vals


class SemanticPack(nn.Module):
    """Cross-attention from current clip tokens to top-k retrieved memories."""

    def __init__(
        self,
        d_model: int,
        n_heads: int,
        text_dim: int,
        image_dim: int,
        topk: int = 4,
    ) -> None:
        super().__init__()
        self.topk = topk
        self.n_heads = n_heads
        self.d_head = d_model // n_heads

        self.text_proj = nn.Linear(text_dim, d_model)
        self.image_proj = nn.Linear(image_dim, d_model)
        self.guide_norm = nn.LayerNorm(d_model)

        self.q_proj = nn.Linear(d_model, d_model)
        self.k_proj = nn.Linear(d_model, d_model)
        self.v_proj = nn.Linear(d_model, d_model)
        self.out_proj = nn.Linear(d_model, d_model)
        self.norm = nn.LayerNorm(d_model)

    def forward(
        self,
        x: torch.Tensor,
        memory_bank: SemanticMemoryBank,
        text_emb: torch.Tensor,
        image_emb: torch.Tensor,
    ) -> torch.Tensor:
        B, _, _ = x.shape
        guide = self.guide_norm(self.text_proj(text_emb) + self.image_proj(image_emb))

        mem_list = [memory_bank.retrieve(guide[b], self.topk) for b in range(B)]
        mem_tokens = torch.stack(mem_list, dim=0)  # (B, topk, D)

        def split_heads(t: torch.Tensor) -> torch.Tensor:
            return rearrange(t, "b s (h d) -> b h s d", h=self.n_heads)

        Q = split_heads(self.q_proj(x))
        K = split_heads(self.k_proj(mem_tokens))
        V = split_heads(self.v_proj(mem_tokens))

        scale = math.sqrt(self.d_head)
        attn = torch.softmax((Q @ K.transpose(-2, -1)) / scale, dim=-1)
        out = rearrange(attn @ V, "b h s d -> b s (h d)")
        out = self.out_proj(out)
        return self.norm(x + out)


# %% [markdown]
# ## Cell 5 — MemoryPack (combined)

# %%
class MemoryPack(nn.Module):
    def __init__(self, cfg: Config) -> None:
        super().__init__()
        self.framepack = FramePack(cfg.C, cfg.d_model, cfg.short_window)
        self.semanticpack = SemanticPack(
            cfg.d_model,
            cfg.n_heads,
            cfg.text_dim,
            cfg.image_dim,
            cfg.long_topk,
        )
        self.fuse = nn.Sequential(
            nn.Linear(cfg.d_model * 2, cfg.d_model),
            nn.SiLU(),
            nn.LayerNorm(cfg.d_model),
        )

    def forward(
        self,
        x_latent: torch.Tensor,
        memory_bank: SemanticMemoryBank,
        text_emb: torch.Tensor,
        image_emb: torch.Tensor,
    ) -> torch.Tensor:
        short_ctx = self.framepack(x_latent)
        long_ctx = self.semanticpack(short_ctx, memory_bank, text_emb, image_emb)
        return self.fuse(torch.cat([short_ctx, long_ctx], dim=-1))


# %% [markdown]
# ## Cell 6 — Minimal video DiT backbone

# %%
class DiTBlock(nn.Module):
    def __init__(self, d_model: int, n_heads: int, mlp_ratio: float = 4.0) -> None:
        super().__init__()
        self.norm1 = nn.LayerNorm(d_model)
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        self.norm2 = nn.LayerNorm(d_model)
        dim_ff = int(d_model * mlp_ratio)
        self.ff = nn.Sequential(
            nn.Linear(d_model, dim_ff), nn.GELU(), nn.Linear(dim_ff, d_model)
        )
        self.adaLN_mod = nn.Sequential(nn.SiLU(), nn.Linear(d_model, 6 * d_model))

    def forward(
        self,
        x: torch.Tensor,
        cond: torch.Tensor,
        context: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        gate = self.adaLN_mod(cond).unsqueeze(1).chunk(6, dim=-1)
        s1, b1, s2, b2 = gate[0], gate[1], gate[2], gate[3]

        h = self.norm1(x) * (1 + s1) + b1
        h, _ = self.attn(h, h, h)
        x = x + h

        if context is not None:
            h2 = self.norm1(x) * (1 + s2) + b2
            h2, _ = self.attn(h2, context, context)
            x = x + h2

        x = x + self.ff(self.norm2(x))
        return x


class VideoDiT(nn.Module):
    def __init__(self, cfg: Config, n_layers: int = 2) -> None:
        super().__init__()
        d = cfg.d_model
        self.cfg = cfg
        self.patch_embed = nn.Conv3d(
            cfg.C, d, kernel_size=(1, 2, 2), stride=(1, 2, 2)
        )
        self.t_embed = nn.Sequential(nn.Linear(1, d), nn.SiLU(), nn.Linear(d, d))
        self.blocks = nn.ModuleList([DiTBlock(d, cfg.n_heads) for _ in range(n_layers)])
        self.out_head = nn.Sequential(nn.LayerNorm(d), nn.Linear(d, cfg.C * 4))

    def patchify(self, x: torch.Tensor) -> torch.Tensor:
        feat = self.patch_embed(x)
        return rearrange(feat, "b d t h w -> b (t h w) d")

    def unpatchify(self, tokens: torch.Tensor, T: int, H: int, W: int) -> torch.Tensor:
        h, w = H // 2, W // 2
        return rearrange(
            tokens,
            "b (t h w) (c p1 p2) -> b c t (h p1) (w p2)",
            t=T, h=h, w=w, p1=2, p2=2,
        )

    def forward(
        self,
        x_noisy: torch.Tensor,
        t: torch.Tensor,
        context: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        _, _, T, H, W = x_noisy.shape
        tokens = self.patchify(x_noisy)
        t_emb = self.t_embed(t.float().unsqueeze(-1))
        for blk in self.blocks:
            tokens = blk(tokens, t_emb, context)
        return self.unpatchify(self.out_head(tokens), T, H, W)


# %% [markdown]
# ## Cell 7 — Rectified-flow loss (stage 1: teacher forcing)

# %%
def rectified_flow_loss(
    model: VideoDiT,
    x0: torch.Tensor,
    context: Optional[torch.Tensor],
    sigma_min: float = 1e-3,
) -> torch.Tensor:
    B = x0.shape[0]
    t = torch.rand(B, device=x0.device).clamp(min=sigma_min, max=1.0 - sigma_min)
    eps = torch.randn_like(x0)
    t_view = t.view(B, 1, 1, 1, 1)
    x_t = (1 - t_view) * x0 + t_view * eps
    target = eps - x0
    pred = model(x_t, t, context)
    return F.mse_loss(pred, target)


# %% [markdown]
# ## Cell 8 — Direct Forcing loss (stage 2)
#
# Replaces ground-truth conditioning with a single-step Euler-backward
# approximation of the model's own inference output, closing the
# train/inference distribution gap without distillation.

# %%
def direct_forcing_loss(
    model: VideoDiT,
    x0: torch.Tensor,
    context: Optional[torch.Tensor],
    sigma_min: float = 1e-3,
) -> torch.Tensor:
    B = x0.shape[0]
    t = torch.rand(B, device=x0.device).clamp(min=sigma_min, max=1.0 - sigma_min)
    eps = torch.randn_like(x0)
    t_view = t.view(B, 1, 1, 1, 1)
    x_t = (1 - t_view) * x0 + t_view * eps

    # Single-step backward Euler approximation of x_0 from the current model.
    with torch.no_grad():
        v_hat = model(x_t, t, context)
        x0_hat = x_t - t_view * v_hat

    # Re-noise from x0_hat instead of ground-truth x0 and recompute target.
    x_t2 = (1 - t_view) * x0_hat + t_view * eps
    target = eps - x0_hat
    pred = model(x_t2, t, context)
    return F.mse_loss(pred, target)


# %% [markdown]
# ## Cell 9 — Smoke test

# %%
def _smoke_test() -> None:
    torch.manual_seed(0)
    cfg = Config()
    B = 2

    memory = MemoryPack(cfg).to(DEVICE)
    bank = SemanticMemoryBank(cfg.d_model, cfg.memory_bank_size).to(DEVICE)
    dit = VideoDiT(cfg).to(DEVICE)

    x0 = torch.randn(B, cfg.C, cfg.T, cfg.H, cfg.W, device=DEVICE)
    text_emb = torch.randn(B, cfg.text_dim, device=DEVICE)
    image_emb = torch.randn(B, cfg.image_dim, device=DEVICE)

    # Seed bank with a few synthetic memory entries so retrieval is non-trivial.
    bank.update(
        torch.randn(8, cfg.d_model, device=DEVICE),
        torch.randn(8, cfg.d_model, device=DEVICE),
    )

    ctx = memory(x0, bank, text_emb, image_emb)
    print(f"MemoryPack context shape: {tuple(ctx.shape)}")

    l1 = rectified_flow_loss(dit, x0, ctx, cfg.sigma_min)
    l2 = direct_forcing_loss(dit, x0, ctx, cfg.sigma_min)
    print(f"stage-1 rectified-flow loss : {l1.item():.4f}")
    print(f"stage-2 direct-forcing loss : {l2.item():.4f}")
    assert torch.isfinite(l1) and torch.isfinite(l2), "non-finite loss"


if __name__ == "__main__":
    _smoke_test()
