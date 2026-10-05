/**
 * A staff link in the glass header (spec 0018, AC-3): a round pill in the
 * ink colour at rest, the muted fill on hover, with press feedback. Ink, not
 * muted text, so it holds 4.5:1 over the darkest thing that can scroll under
 * the glass (AC-16). Pass it to a ghost `Button`.
 */
export const NAV_PILL = "text-label text-foreground h-10 rounded-full px-3 press";
