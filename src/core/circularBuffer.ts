/**
 * High-Performance Trace Buffer — an O(1) circular buffer used as the
 * backing store for Stigmergy pheromone traces and any other append-only
 * ring of bounded retention.
 *
 * Replaces the previous `Array.prototype.shift()` pattern which was O(n)
 * on every overflow. Memory is pre-allocated so steady-state operation
 * performs zero allocations for push.
 */
export class CircularBuffer<T> {
  private readonly buf: Array<T | undefined>;
  private readonly cap: number;
  private head = 0; // next write position
  private count = 0;
  private totalSeen = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('CircularBuffer capacity must be a positive integer');
    }
    this.cap = capacity;
    this.buf = new Array<T | undefined>(capacity);
  }

  /** Current number of stored items. */
  get size(): number {
    return this.count;
  }

  /** Maximum capacity. */
  get capacity(): number {
    return this.cap;
  }

  /** Total items pushed over the lifetime of the buffer (including evicted). */
  get lifetimePushes(): number {
    return this.totalSeen;
  }

  /**
   * Append an item. Returns the evicted item when the buffer was full,
   * otherwise `undefined`. Strictly O(1).
   */
  push(item: T): T | undefined {
    const evicted = this.count === this.cap ? this.buf[this.head] : undefined;
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.cap;
    if (this.count < this.cap) {
      this.count++;
    }
    this.totalSeen++;
    return evicted;
  }

  /** Returns the most recently pushed item without removing it. */
  last(): T | undefined {
    if (this.count === 0) return undefined;
    const idx = (this.head - 1 + this.cap) % this.cap;
    return this.buf[idx];
  }

  /**
   * Return up to `limit` most recent items, newest first. Walks at most
   * `min(limit, size)` entries.
   */
  recent(limit: number): T[] {
    const take = Math.min(limit, this.count);
    const out: T[] = new Array(take);
    let idx = (this.head - 1 + this.cap) % this.cap;
    for (let i = 0; i < take; i++) {
      out[i] = this.buf[idx] as T;
      idx = (idx - 1 + this.cap) % this.cap;
    }
    return out;
  }

  /** Iterate all stored items in insertion order (oldest first). */
  *values(): IterableIterator<T> {
    if (this.count === 0) return;
    const start = (this.head - this.count + this.cap) % this.cap;
    for (let i = 0; i < this.count; i++) {
      yield this.buf[(start + i) % this.cap] as T;
    }
  }

  /** Execute a callback for each stored item in insertion order (oldest first). */
  forEach(callback: (item: T, index: number) => void): void {
    if (this.count === 0) return;
    const start = (this.head - this.count + this.cap) % this.cap;
    for (let i = 0; i < this.count; i++) {
      callback(this.buf[(start + i) % this.cap] as T, i);
    }
  }

  /** Snapshot as a plain array (oldest first). O(n). */
  toArray(): T[] {
    if (this.count === 0) return [];
    const out = new Array<T>(this.count);
    const start = (this.head - this.count + this.cap) % this.cap;
    for (let i = 0; i < this.count; i++) {
      out[i] = this.buf[(start + i) % this.cap] as T;
    }
    return out;
  }

  /** Drop all items. O(capacity) to release references for GC. */
  clear(): void {
    for (let i = 0; i < this.cap; i++) this.buf[i] = undefined;
    this.head = 0;
    this.count = 0;
  }
}
