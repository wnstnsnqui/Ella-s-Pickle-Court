import {
  CarIcon,
  CheckIcon,
  CourtBasketballIcon,
  SunHorizonIcon,
  ToiletIcon,
  WifiHighIcon,
} from "@phosphor-icons/react/ssr";

import { formatPeso } from "@/lib/venue";

import { AMENITIES, OFFERS_SECTION, offersLede, RENTAL, type Amenity } from "./content";
import { SectionHeading } from "./section-heading";

/** Typed on the id union, so an amenity added without an icon fails the typecheck. */
const AMENITY_ICONS: Record<Amenity["id"], typeof WifiHighIcon> = {
  wifi: WifiHighIcon,
  parking: CarIcon,
  "comfort-rooms": ToiletIcon,
  outdoor: SunHorizonIcon,
};

/**
 * What the venue sells and what comes with it (spec 0013, AC-17, AC-27). The
 * one priced offer, court rental, is set in the dark mark colour so the eye
 * lands there first; the amenities beside it stay quiet. Nothing here is
 * clickable, so nothing moves on hover; each card only reveals on scroll, the
 * tiles one after another (`[data-reveal="step"]` in `app/globals.css`).
 *
 * The price is `hourly_rate` from today's read (spec 0015, AC-17). When that
 * read is unavailable it is left out, never guessed, as the hero does.
 */
export function Offers({ hourlyRate }: { hourlyRate: number | null }) {
  return (
    <section
      id="offers"
      aria-labelledby="offers-title"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 md:py-28"
    >
      <SectionHeading
        id="offers-title"
        eyebrow={OFFERS_SECTION.eyebrow}
        title={OFFERS_SECTION.title}
      >
        {offersLede(hourlyRate)}
      </SectionHeading>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <RentalCard hourlyRate={hourlyRate} />

        <ul aria-label="Amenities" className="grid auto-rows-fr grid-cols-2 gap-4">
          {AMENITIES.map((amenity, i) => {
            const Icon = AMENITY_ICONS[amenity.id];
            return (
              <li
                key={amenity.id}
                data-reveal="step"
                style={{ "--i": i } as React.CSSProperties}
                className="bg-card text-card-foreground ring-border relative flex flex-col gap-4 rounded-3xl p-5 ring-1"
              >
                <span className="bg-muted text-foreground grid size-11 place-items-center rounded-2xl">
                  <Icon aria-hidden="true" weight="duotone" className="size-6" />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-body font-semibold">{amenity.name}</h3>
                  {amenity.badge ? (
                    <span className="text-caption bg-secondary text-secondary-foreground ring-border w-fit rounded-full px-2.5 py-1 font-medium ring-1 sm:absolute sm:top-5 sm:right-5">
                      {amenity.badge}
                    </span>
                  ) : null}
                  <p className="text-label text-muted-foreground text-pretty">{amenity.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function RentalCard({ hourlyRate }: { hourlyRate: number | null }) {
  return (
    <div
      data-reveal
      className="bg-mark text-mark-foreground flex flex-col gap-6 rounded-3xl p-6 md:p-8"
    >
      <span className="bg-mark-foreground text-mark grid size-11 place-items-center rounded-2xl">
        <CourtBasketballIcon aria-hidden="true" weight="duotone" className="size-6" />
      </span>

      <div className="flex flex-col gap-2">
        <h3 className="text-title">{RENTAL.name}</h3>
        <p className="text-body text-pretty opacity-85">{RENTAL.blurb}</p>
      </div>

      {hourlyRate === null ? null : (
        <p className="flex items-baseline gap-1.5">
          <span className="text-display tabular-nums">{formatPeso(hourlyRate)}</span>
          <span className="text-caption opacity-80">{RENTAL.unit}</span>
        </p>
      )}

      <ul className="mt-auto flex flex-col gap-2">
        {RENTAL.perks.map((perk) => (
          <li key={perk} className="text-label flex items-start gap-2">
            <CheckIcon
              aria-hidden="true"
              weight="bold"
              className="text-mark-foreground mt-0.5 size-4 shrink-0"
            />
            {perk}
          </li>
        ))}
      </ul>
    </div>
  );
}
