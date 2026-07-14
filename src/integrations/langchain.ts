// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
// Carve-out from repo-wide Apache-2.0; see LICENSE-MIT-INTEGRATIONS for full terms.
/**
 * MCOP ↔ LangChain integration shim.
 *
 * This module is **upstream-PR-ready**: it implements the LangChain
 * `BaseChatMessageHistory` shape (the modern replacement for
 * `BaseMemory`) without taking a runtime dependency on `langchain` or
 * `@langchain/core`. Callers who *do* import LangChain can drop the
 * returned object straight into a chain, e.g.:
 *
 * ```ts
 * // Source checkout only; this integration is not a public npm subpath.
 * import { createMCOPLangChainMemory } from './src/integrations/langchain';
 * const memory = createMCOPLangChainMemory({ sessionId: 'agent-007' });
 * // …
 * await runnable.invoke({ input }, { configurable: { history: memory } });
 * ```
 *
 * Behind the shim, every `addMessages` call funnels through the MCOP
 * triad: encode → resonate → record → etch. So a LangChain agent's
 * conversational history becomes Merkle-rooted, replayable, and
 * resonance-queryable with zero behavioural change to the agent itself.
 *
 * The shim is intentionally framework-agnostic in its public surface — it
 * uses the same `BaseLangChainMessage` shape LangChain emits, but does
 * not import LangChain types. That is what makes it embeddable in either
 * a LangChain-aware codebase OR an upstream PR contribution.
 */

import {
  ensureTriad,
  recallFromTriad,
  recordIntoTriad,
  type MCOPProvenance,
  type MCOPTriad,
  type MCOPTriadOptions,
} from './triadHarness';

/** LangChain's modern message shape (subset; framework-agnostic). */
export interface BaseLangChainMessage {
  readonly type: 'human' | 'ai' | 'system' | 'tool' | 'function' | 'generic';
  readonly content: string;
  readonly name?: string;
  readonly additional_kwargs?: Record<string, unknown>;
}

export interface MCOPLangChainMemoryOptions extends MCOPTriadOptions {
  /** Session/agent identifier — surfaced into trace metadata. */
  readonly sessionId?: string;
  /**
   * When true (default), every recorded message is etched into the
   * Holographic Etch ledger. When false, the shim still records into
   * Stigmergy but skips the etch — useful for cheap session-only memory.
   */
  readonly etchEveryMessage?: boolean;
}

/** A single message + the MCOP provenance it produced when recorded. */
export interface MCOPLangChainMessage extends BaseLangChainMessage {
  readonly provenance?: MCOPProvenance;
}

/**
 * MCOP-backed LangChain `BaseChatMessageHistory` implementation.
 *
 * Public surface mirrors the LangChain interface so a callable can use
 * this in place of `InMemoryChatMessageHistory` without other code
 * changes.
 */
export class MCOPLangChainMemory {
  private readonly triad: MCOPTriad;
  private readonly history: MCOPLangChainMessage[] = [];
  public readonly sessionId: string;
  private readonly etchEvery: boolean;

  constructor(options: MCOPLangChainMemoryOptions = {}) {
    this.triad = ensureTriad(options);
    this.sessionId = options.sessionId ?? 'mcop-langchain-default';
    this.etchEvery = options.etchEveryMessage ?? true;
  }

  /** LangChain `BaseChatMessageHistory` — list current messages. */
  async getMessages(): Promise<MCOPLangChainMessage[]> {
    return this.history.slice();
  }

  /** LangChain `BaseChatMessageHistory.addMessages`. */
  async addMessages(messages: ReadonlyArray<BaseLangChainMessage>): Promise<void> {
    for (const message of messages) {
      this.history.push(this.recordMessage(message));
    }
  }

  /** Convenience: add a single message. */
  async addMessage(message: BaseLangChainMessage): Promise<void> {
    this.history.push(this.recordMessage(message));
  }

  /** LangChain `BaseChatMessageHistory.clear`. */
  async clear(): Promise<void> {
    this.history.length = 0;
  }

  /**
   * Resonance query against the recorded messages — returns the score
   * and the matching message (if any). Idiomatic for retrieval-augmented
   * LangChain chains where MCOP is the memory layer.
   */
  async recallByResonance(query: string): Promise<{
    score: number;
    message: MCOPLangChainMessage | null;
  }> {
    const { resonance } = recallFromTriad(this.triad, query);
    if (!resonance.trace) return { score: resonance.score, message: null };
    const traceId = resonance.trace.id;
    const message = this.history.find(
      (m) => m.provenance?.traceId !== undefined && m.additional_kwargs?.['mcop_stigmergy_trace_id'] === traceId,
    ) ?? null;
    return { score: resonance.score, message };
  }

  /** Expose the underlying triad for advanced callers. */
  get triadHandle(): MCOPTriad {
    return this.triad;
  }

  private recordMessage(message: BaseLangChainMessage): MCOPLangChainMessage {
    if (!this.etchEvery) {
      return { ...message };
    }
    const recorded = recordIntoTriad(
      this.triad,
      message.content,
      {
        ...(message.additional_kwargs ?? {}),
        mcop_session_id: this.sessionId,
        mcop_role: message.type,
      },
      `mcop-langchain:${this.sessionId}:${message.type}`,
    );
    return {
      ...message,
      provenance: recorded.provenance,
      additional_kwargs: {
        ...(message.additional_kwargs ?? {}),
        mcop_stigmergy_trace_id: recorded.trace.id,
        mcop_etch_hash: recorded.etch.hash,
      },
    };
  }
}

/** Factory: returns a fresh, deterministically-seeded MCOP LangChain memory. */
export function createMCOPLangChainMemory(
  options: MCOPLangChainMemoryOptions = {},
): MCOPLangChainMemory {
  return new MCOPLangChainMemory(options);
}
