"use client";

import { useEffect, useMemo, useState } from "react";

import type { Grid } from "@/lib/schedule/grid";

import { cellKey } from "./cell-key";

/**
 * Which cells just changed under the reader. Spec 0003, AC-11.
 *
 * The grid arrives whole on every render, so the only way to know what moved is
 * to keep the last one and compare. That comparison lives here, in the browser,
 * and nothing on the server knows or cares: a highlight is about what *this*
 * reader saw a moment ago, which is not a fact the database could ever hold.
 *
 * The comparison runs during render rather than in an effect, because it is
 * derived from the props and React would otherwise paint the new grid once
 * without the highlight and then again with it.
 *
 * The first grid a reader sees is not a change, so nothing highlights on load.
 */
type Batch = { id: number; keys: readonly string[] };

export function useChangedCells(grid: Grid | null, holdMs: number): ReadonlySet<string> {
  const [seen, setSeen] = useState<Grid | null>(grid);
  // Changed cells arrive in batches, one per grid that came in different from the
  // last. Batches rather than one flat set, so a change to one cell never cuts
  // short the highlight already running on another.
  const [state, setState] = useState<{ batches: readonly Batch[]; seq: number }>({
    batches: [],
    seq: 0,
  });

  if (seen !== grid) {
    const moved = changedCells(seen, grid);
    setSeen(grid);
    if (moved.length > 0) {
      setState((held) => ({
        batches: [...held.batches, { id: held.seq, keys: moved }],
        seq: held.seq + 1,
      }));
    }
  }

  // One timer, always on the oldest batch. When it fires the next batch becomes
  // the oldest and the effect runs again, so batches retire in the order they
  // arrived. A batch that queues up behind another therefore holds a little
  // longer than `holdMs`, which is the right way round for a highlight: the
  // reader gets more time to notice, never less.
  const oldest = state.batches[0]?.id;
  useEffect(() => {
    if (oldest === undefined) return;
    const timer = setTimeout(
      () =>
        setState((held) => ({
          ...held,
          batches: held.batches.filter((batch) => batch.id !== oldest),
        })),
      holdMs,
    );
    return () => clearTimeout(timer);
  }, [oldest, holdMs]);

  return useMemo(() => new Set(state.batches.flatMap((batch) => [...batch.keys])), [state.batches]);
}

/** The keys whose state differs between two grids. A new cell is not a change. */
function changedCells(before: Grid | null, after: Grid | null): string[] {
  if (!before || !after) return [];

  const wasByKey = new Map<string, string>();
  for (const row of before.rows) {
    for (const cell of row.cells) wasByKey.set(cellKey(cell.courtId, row.startsAt), cell.state);
  }

  const moved: string[] = [];
  for (const row of after.rows) {
    for (const cell of row.cells) {
      const key = cellKey(cell.courtId, row.startsAt);
      const was = wasByKey.get(key);
      if (was !== undefined && was !== cell.state) moved.push(key);
    }
  }
  return moved;
}
