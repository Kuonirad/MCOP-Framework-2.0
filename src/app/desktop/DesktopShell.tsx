"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ProductView = "home" | "dialectical" | "showcase";

type NativeWindow = {
  close(): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
};

declare global {
  interface Window {
    __TAURI__?: {
      window?: {
        getCurrentWindow(): NativeWindow;
      };
    };
  }
}

const VIEW_PATHS: Record<ProductView, string> = {
  home: "/homepage/index.html",
  dialectical: "/dialectical",
  showcase: "/showcase/index.html",
};

const VIEW_LABELS: Record<ProductView, string> = {
  home: "Field",
  dialectical: "Dialectical Studio",
  showcase: "Showcase",
};

const ONBOARDING_KEY = "mcop.desktop.onboarding.v1";

function queryView(): ProductView {
  if (typeof window === "undefined") return "home";
  const candidate = new URLSearchParams(window.location.search).get("view");
  return candidate === "dialectical" || candidate === "showcase" ? candidate : "home";
}

function nativeWindow(): NativeWindow | null {
  return window.__TAURI__?.window?.getCurrentWindow() ?? null;
}

export function DesktopShell() {
  const [view, setViewState] = useState<ProductView>("home");
  const [onboarding, setOnboarding] = useState(false);
  const [devDrawer, setDevDrawer] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [nativeRuntime, setNativeRuntime] = useState(false);

  useEffect(() => {
    setViewState(queryView());
    setOnboarding(window.localStorage.getItem(ONBOARDING_KEY) !== "complete");
    setNativeRuntime(Boolean(window.__TAURI__?.window));
  }, []);

  const setView = useCallback((next: ProductView) => {
    setFrameReady(false);
    setViewState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState({}, "", url);
  }, []);

  const finishOnboarding = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_KEY, "complete");
    setOnboarding(false);
    setView("dialectical");
  }, [setView]);

  const runtimeLabel = useMemo(() => {
    return nativeRuntime ? "Bundled native runtime" : "Browser preview";
  }, [nativeRuntime]);

  return (
    <main className="relative flex h-screen min-h-[680px] w-screen min-w-[1080px] flex-col overflow-hidden bg-[#02040b] text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.12),transparent_34rem),radial-gradient(circle_at_90%_10%,rgba(139,92,246,0.12),transparent_30rem)]"
      />

      <header className="relative z-30 flex h-14 shrink-0 items-center border-b border-cyan-200/10 bg-slate-950/75 px-3 shadow-[0_16px_50px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
        <div className="flex items-center gap-3 px-2">
          <span className="grid size-7 place-items-center rounded-full border border-cyan-300/50 bg-cyan-300/10 text-xs text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,.25)]">
            ◈
          </span>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-cyan-200/80">MCOP Desktop</p>
            <p className="text-[9px] tracking-[0.12em] text-slate-500">Stigmergic trust substrate</p>
          </div>
        </div>

        <nav aria-label="Product surfaces" className="ml-7 flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] p-1">
          {(Object.keys(VIEW_PATHS) as ProductView[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium tracking-wide transition ${
                view === item
                  ? "bg-cyan-300/15 text-cyan-100 ring-1 ring-cyan-200/30"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              }`}
            >
              {VIEW_LABELS[item]}
            </button>
          ))}
        </nav>

        <div data-tauri-drag-region className="h-full min-w-10 flex-1" />

        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-emerald-200/70 xl:inline-flex">
            {runtimeLabel}
          </span>
          <button
            type="button"
            onClick={() => setDevDrawer((open) => !open)}
            className="rounded-md px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
            aria-expanded={devDrawer}
          >
            Pro / Dev
          </button>
          <div className="ml-1 flex items-center">
            <button aria-label="Minimize" type="button" onClick={() => nativeWindow()?.minimize()} className="grid size-9 place-items-center text-slate-400 hover:bg-white/5 hover:text-white">—</button>
            <button aria-label="Toggle maximize" type="button" onClick={() => nativeWindow()?.toggleMaximize()} className="grid size-9 place-items-center text-xs text-slate-400 hover:bg-white/5 hover:text-white">◇</button>
            <button aria-label="Close" type="button" onClick={() => nativeWindow()?.close()} className="grid size-9 place-items-center text-slate-400 hover:bg-rose-500/70 hover:text-white">×</button>
          </div>
        </div>
      </header>

      <section className="relative z-10 flex min-h-0 flex-1 p-2">
        {!frameReady && (
          <div className="absolute inset-2 z-10 grid place-items-center rounded-xl border border-white/10 bg-[#030712]">
            <div className="grid justify-items-center gap-3">
              <span className="size-10 animate-pulse rounded-full border border-cyan-300/40 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,.25)]" />
              <p className="text-[10px] uppercase tracking-[0.34em] text-cyan-100/60">Tuning the field</p>
            </div>
          </div>
        )}
        <iframe
          key={view}
          src={VIEW_PATHS[view]}
          title={VIEW_LABELS[view]}
          onLoad={() => setFrameReady(true)}
          allow="clipboard-read; clipboard-write"
          className="h-full w-full rounded-xl border border-white/10 bg-slate-950 shadow-[0_24px_90px_rgba(0,0,0,.45)]"
        />
      </section>

      {devDrawer && (
        <aside className="absolute right-3 top-16 z-40 w-[360px] rounded-2xl border border-cyan-200/15 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-2xl">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/70">Advanced surface</p>
          <h2 className="mt-2 text-lg font-medium">Runtime inspector</h2>
          <dl className="mt-4 grid gap-3 text-xs">
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <dt className="text-slate-500">Next server</dt>
              <dd className="mt-1 font-mono text-emerald-200">{runtimeLabel}</dd>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <dt className="text-slate-500">Data directory</dt>
              <dd className="mt-1 break-all font-mono text-slate-300">OS-managed application data</dd>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <dt className="text-slate-500">Cloud connectors</dt>
              <dd className="mt-1 text-slate-300">Off by default. No API key is required for the local triad.</dd>
            </div>
          </dl>
        </aside>
      )}

      {onboarding && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[#01030a]/80 p-8 backdrop-blur-xl">
          <section aria-labelledby="first-run-title" className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-cyan-200/20 bg-slate-950/95 p-8 shadow-[0_35px_140px_rgba(8,145,178,.22)]">
            <div aria-hidden="true" className="absolute -right-24 -top-24 size-72 rounded-full bg-cyan-400/10 blur-3xl" />
            <p className="relative text-[10px] uppercase tracking-[0.42em] text-cyan-200/70">First resonance</p>
            <h1 id="first-run-title" className="relative mt-3 text-3xl font-medium tracking-tight">Your local field is ready.</h1>
            <p className="relative mt-3 max-w-xl text-sm leading-6 text-slate-300/80">
              MCOP owns its runtime and keeps the deterministic triad available offline. Cloud API keys are optional and intentionally remain unconfigured until a secure connector vault is enabled.
            </p>

            <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/70">Runtime</p>
                <p className="mt-2 text-sm font-medium">Bundled + verified</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">No system Node, pnpm, Python, or terminal required.</p>
              </article>
              <article className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.04] p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-violet-200/70">Data</p>
                <p className="mt-2 text-sm font-medium">Local application space</p>
                <p className="mt-1 break-all text-xs leading-5 text-slate-400">OS-managed application data; no repository writes.</p>
              </article>
              <article className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">Connectors</p>
                <p className="mt-2 text-sm font-medium">Keys optional</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Start offline now; attach providers later from Pro / Dev.</p>
              </article>
            </div>

            <div className="relative mt-7 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => { window.localStorage.setItem(ONBOARDING_KEY, "complete"); setOnboarding(false); }} className="rounded-full px-4 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white">
                Explore motion field
              </button>
              <button type="button" onClick={finishOnboarding} className="rounded-full border border-cyan-200/35 bg-cyan-300/15 px-5 py-2.5 text-xs font-semibold tracking-wide text-cyan-50 shadow-[0_0_30px_rgba(34,211,238,.16)] transition hover:bg-cyan-300/25">
                Run offline triad demo →
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
