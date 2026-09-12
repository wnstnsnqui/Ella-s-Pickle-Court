/**
 * The venue's own name and voice, in one place.
 *
 * Spec 0003, Value sourcing: `venue_settings` has no name column, so the name is
 * a constant rather than a database read. Renaming the venue without a deploy is
 * on the Deferred list and is a change to spec 0002, not to this file.
 */
export const VENUE_NAME = "Ella's Picklecourt";

/** The short line under the wordmark and in the page description. */
export const VENUE_TAGLINE = "See which courts are free before you drive over.";

/** The letter the generated favicon and the wordmark mark are set from. */
export const VENUE_INITIAL = "E";
