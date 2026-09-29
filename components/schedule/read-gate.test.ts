import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReadGate } from "./read-gate";

/**
 * Spec 0006, AC-5 and AC-9: bursts coalesce into one read, two reads never
 * start closer than the floor, a `429` wait holds every trigger and releases
 * exactly one read, and a second wait replaces the first rather than adding to it.
 */

const WINDOW = 300;
const FLOOR = 2_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ReadGate", () => {
  it("turns six triggers inside the window into one read (AC-5)", () => {
    const read = vi.fn();
    const gate = new ReadGate(read, { windowMs: WINDOW, floorMs: FLOOR });

    for (let i = 0; i < 6; i += 1) {
      gate.request();
      vi.advanceTimersByTime(15);
    }
    expect(read).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WINDOW);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("never starts two reads closer than the floor (AC-5)", () => {
    const read = vi.fn();
    const gate = new ReadGate(read, { windowMs: WINDOW, floorMs: FLOOR });

    gate.request();
    vi.advanceTimersByTime(WINDOW);
    expect(read).toHaveBeenCalledTimes(1);

    // A trigger 500 ms after the first read: it must wait for the floor.
    vi.advanceTimersByTime(500);
    gate.request();
    vi.advanceTimersByTime(WINDOW);
    expect(read).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(FLOOR - 500 - WINDOW);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("holds triggers during a wait and releases exactly one read after it (AC-9)", () => {
    const read = vi.fn();
    const gate = new ReadGate(read, { windowMs: WINDOW, floorMs: FLOOR });

    gate.wait(7_000);
    expect(gate.waiting).toBe(true);

    // Three broadcasts and a poll tick inside the seven seconds.
    gate.request();
    vi.advanceTimersByTime(1_000);
    gate.request();
    vi.advanceTimersByTime(1_000);
    gate.request();
    vi.advanceTimersByTime(1_000);
    gate.request();

    vi.advanceTimersByTime(3_999);
    expect(read).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(gate.waiting).toBe(false);
  });

  it("does not read when the wait ends with nothing wanted (AC-9)", () => {
    const read = vi.fn();
    const gate = new ReadGate(read, { windowMs: WINDOW, floorMs: FLOOR });

    gate.wait(2_000);
    vi.advanceTimersByTime(5_000);
    expect(read).not.toHaveBeenCalled();
  });

  it("replaces a wait with a later one rather than compounding (AC-9)", () => {
    const read = vi.fn();
    const gate = new ReadGate(read, { windowMs: WINDOW, floorMs: FLOOR });

    gate.request();
    gate.wait(7_000);
    vi.advanceTimersByTime(4_000);
    // A second 429 with Retry-After: 3 during the first wait: three seconds
    // from now, which is exactly when the first would have ended anyway.
    gate.wait(3_000);
    expect(gate.waitEndsAt).toBe(Date.now() + 3_000);

    vi.advanceTimersByTime(3_000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("a wait set while the window timer runs postpones the read to the wait's end (AC-9)", () => {
    const read = vi.fn();
    const gate = new ReadGate(read, { windowMs: WINDOW, floorMs: FLOOR });

    gate.request();
    vi.advanceTimersByTime(100);
    gate.wait(5_000);

    vi.advanceTimersByTime(WINDOW);
    expect(read).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("stops reading once disposed", () => {
    const read = vi.fn();
    const gate = new ReadGate(read, { windowMs: WINDOW, floorMs: FLOOR });

    gate.request();
    gate.dispose();
    vi.advanceTimersByTime(WINDOW * 2);
    gate.request();
    vi.advanceTimersByTime(WINDOW * 2);
    expect(read).not.toHaveBeenCalled();
  });

  it("holds every trigger while paused, then reads once on resume (spec 0014, AC-8)", () => {
    const read = vi.fn();
    const gate = new ReadGate(read, { windowMs: WINDOW, floorMs: FLOOR });

    gate.pause();
    gate.request();
    vi.advanceTimersByTime(10_000);
    gate.request();
    vi.advanceTimersByTime(10_000);
    expect(read).not.toHaveBeenCalled();

    gate.resume();
    vi.advanceTimersByTime(WINDOW);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("drops a timer already running when paused, and reads nothing on an idle resume", () => {
    const read = vi.fn();
    const gate = new ReadGate(read, { windowMs: WINDOW, floorMs: FLOOR });

    gate.request();
    gate.pause();
    vi.advanceTimersByTime(WINDOW * 2);
    expect(read).not.toHaveBeenCalled();

    gate.resume();
    vi.advanceTimersByTime(WINDOW);
    expect(read).toHaveBeenCalledTimes(1);

    gate.pause();
    gate.resume();
    vi.advanceTimersByTime(10_000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("counts a read started outside the gate for the floor (spec 0014, AC-8)", () => {
    const read = vi.fn();
    const gate = new ReadGate(read, { windowMs: WINDOW, floorMs: FLOOR });

    gate.pause();
    gate.markRead();
    gate.request();
    vi.advanceTimersByTime(500);
    gate.resume();

    vi.advanceTimersByTime(FLOOR - 500 - 1);
    expect(read).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
