/**
 * The one gate every re read of the day goes through. Spec 0006, AC-5 and AC-9.
 *
 * A trigger (a broadcast, a poll tick, the tab coming back, the channel
 * recovering, the venue day rolling over) never calls the transport itself. It
 * calls `request()`, which only marks a read as wanted. The gate then starts
 * one read at the earliest moment all three rules allow:
 *
 * - the coalescing window has passed since the first pending trigger, so a
 *   burst of broadcasts costs one read, not one each;
 * - the floor has passed since the last read started, so one tab never reads
 *   more often than that however busy the desk is;
 * - no wait is active. A `429` sets a wait from its `Retry-After`; a further
 *   `429` sets a fresh wait from its own header, never a compounding one.
 *
 * Pure and timer based, so it is tested with fake timers and no React.
 */
export type ReadGateOptions = {
  /** How long to gather triggers before reading. */
  windowMs: number;
  /** The least time between two reads starting. */
  floorMs: number;
};

export class ReadGate {
  private wanted = false;
  private waitUntil = 0;
  private lastReadAt = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly read: () => void,
    private readonly options: ReadGateOptions,
  ) {}

  /** A trigger fired. The read happens when the rules allow, once. */
  request(): void {
    if (this.disposed) return;
    this.wanted = true;
    this.schedule();
  }

  /** Hold every read until `ms` from now. Triggers during the wait still count. */
  wait(ms: number): void {
    if (this.disposed) return;
    this.waitUntil = Math.max(this.waitUntil, Date.now() + Math.max(ms, 0));
    if (this.wanted) this.schedule();
  }

  /** Whether a wait is holding reads right now. */
  get waiting(): boolean {
    return this.waitUntil > Date.now();
  }

  /** When the wait ends, or null when none is active. */
  get waitEndsAt(): number | null {
    return this.waiting ? this.waitUntil : null;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const now = Date.now();
    const due = Math.max(
      now + this.options.windowMs,
      this.lastReadAt + this.options.floorMs,
      this.waitUntil,
    );
    // A pending timer is kept unless the wait pushed the due time later; the
    // window is measured from the first trigger, never restarted by the next.
    if (this.timer !== null) {
      if (due <= this.dueAt) return;
      clearTimeout(this.timer);
    }
    this.dueAt = due;
    this.timer = setTimeout(() => this.fire(), Math.max(due - now, 0));
  }

  private dueAt = 0;

  private fire(): void {
    this.timer = null;
    if (this.disposed || !this.wanted) return;
    if (this.waitUntil > Date.now()) {
      // A wait landed while the timer was running. Try again when it ends.
      this.schedule();
      return;
    }
    this.wanted = false;
    this.lastReadAt = Date.now();
    this.read();
  }
}
