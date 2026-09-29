/**
 * The press feedback every landing page button wears: a small scale on pointer
 * down, instant and short, so the page feels like it heard the tap. Tailwind 4
 * writes `scale-*` and `translate-*` to their own properties, so those are what
 * the transition names, never `transform` or `all`.
 */
export const PRESS =
  "transition-[scale,translate,background-color,color] duration-150 ease-out-strong active:scale-[0.97]";
