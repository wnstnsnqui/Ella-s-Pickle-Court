/**
 * How a cell is named outside the grid, by the court it sits on and the instant
 * its row starts. Both come straight from the grid `lib/schedule/grid.ts` built,
 * so a key never needs an index and never shifts when a row is inserted.
 */
export function cellKey(courtId: number, rowStartsAt: string): string {
  return `${courtId}@${rowStartsAt}`;
}

/** The two halves of a key, back out. The instant is an ISO string, so it holds no `@`. */
export function parseCellKey(key: string): { courtId: number; rowStartsAt: string } {
  const at = key.indexOf("@");
  return { courtId: Number(key.slice(0, at)), rowStartsAt: key.slice(at + 1) };
}
