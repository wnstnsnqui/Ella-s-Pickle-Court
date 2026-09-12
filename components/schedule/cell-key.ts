/**
 * How a cell is named outside the grid, by the court it sits on and the instant
 * its row starts. Both come straight from the grid `lib/schedule/grid.ts` built,
 * so a key never needs an index and never shifts when a row is inserted.
 */
export function cellKey(courtId: number, rowStartsAt: string): string {
  return `${courtId}@${rowStartsAt}`;
}
