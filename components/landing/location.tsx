import {
  ArrowUpRightIcon,
  CarIcon,
  ChatsCircleIcon,
  ClockIcon,
  MapPinIcon,
  NavigationArrowIcon,
} from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { daysLabel, groupOpeningHours, hoursLabel } from "@/lib/schedule/hours";
import type { VenueHours } from "@/lib/schedule/queries";
import { cn } from "@/lib/utils";
import {
  VENUE_EMAIL,
  VENUE_MAPS_LABEL,
  VENUE_MAPS_URL,
  VENUE_NAME,
  VENUE_PHONE_DISPLAY,
  VENUE_STREET,
  VENUE_TOWN_LINE,
} from "@/lib/venue";

import { ChannelButtons } from "./channels";
import { VISIT_SECTION } from "./content";
import { PRESS } from "./press";
import { SectionHeading } from "./section-heading";

/**
 * Where the venue is, when it is open, and how to reach a person. Spec 0013,
 * AC-18.
 *
 * The hours are the real week from `venue_hours`, grouped the same way the
 * JSON-LD groups them, and simply point to a message when the read is
 * unavailable. Contact is the same two channels the rest of the page offers.
 * The map is drawn from tokens rather than embedded: no third party request
 * on a page load, and a single tap opens the real thing in the visitor's own
 * maps app.
 */
export function Location({ hours }: { hours: VenueHours | null }) {
  return (
    <section
      id="visit"
      aria-labelledby="visit-title"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 md:py-28"
    >
      <SectionHeading id="visit-title" eyebrow={VISIT_SECTION.eyebrow} title={VISIT_SECTION.title}>
        {VISIT_SECTION.lede}
      </SectionHeading>

      <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div data-reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <InfoCard icon={MapPinIcon} title="Address">
            <address className="not-italic">
              <span className="block">{VENUE_STREET}</span>
              <span className="block">{VENUE_TOWN_LINE}</span>
            </address>
            {/* The pin's own name on Google Maps, so a player can match it on arrival. */}
            <p className="text-caption text-muted-foreground mt-3 flex items-start gap-1.5">
              <NavigationArrowIcon aria-hidden="true" className="mt-px size-4 shrink-0" />
              <span>
                On maps as <span className="text-foreground font-medium">{VENUE_MAPS_LABEL}</span>
              </span>
            </p>
            <p className="text-caption text-muted-foreground mt-1.5 flex items-start gap-1.5">
              <CarIcon aria-hidden="true" className="mt-px size-4 shrink-0" />
              {VISIT_SECTION.parking}
            </p>
          </InfoCard>

          <InfoCard icon={ClockIcon} title="Opening hours">
            {hours ? (
              <dl className="flex flex-col gap-1.5">
                {groupOpeningHours(hours.days).map((group) => (
                  <div key={group.days.join()} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{daysLabel(group.days)}</dt>
                    <dd className="text-right tabular-nums">{hoursLabel(group)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground">Message us for today&apos;s hours.</p>
            )}
          </InfoCard>

          <InfoCard
            icon={ChatsCircleIcon}
            title="Book or ask"
            className="sm:col-span-2 lg:col-span-1"
          >
            <p className="text-muted-foreground mb-4">
              Message us on Messenger or send a text. We&apos;ll book the court for you.
            </p>
            <dl className="text-caption flex flex-col gap-1.5">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Mobile</dt>
                <dd className="tabular-nums select-all">{VENUE_PHONE_DISPLAY}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="min-w-0 break-all select-all">{VENUE_EMAIL}</dd>
              </div>
            </dl>
            <ChannelButtons className="mt-5" />
          </InfoCard>
        </div>

        <MapSketch />
      </div>
    </section>
  );
}

function InfoCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: typeof MapPinIcon;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card text-body ring-border rounded-3xl p-6 ring-1", className)}>
      <h3 className="text-label mb-3 flex items-center gap-2">
        <span className="bg-brand text-brand-foreground grid size-8 place-items-center rounded-xl">
          <Icon aria-hidden="true" weight="bold" className="size-4" />
        </span>
        {title}
      </h3>
      {children}
    </div>
  );
}

/** A stylised street map, drawn from tokens, with the venue pinned in the middle. */
function MapSketch() {
  return (
    <div
      data-reveal
      className="bg-muted ring-border relative min-h-80 overflow-hidden rounded-3xl ring-1"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:48px_48px]"
      />
      {/* Roads and a park, the shapes a map reader looks for first. */}
      <div aria-hidden="true" className="absolute inset-0">
        <div className="bg-background absolute top-[58%] -right-10 -left-10 h-5 -rotate-6 shadow-sm" />
        <div className="bg-background absolute -top-10 -bottom-10 left-[38%] w-4 rotate-12 shadow-sm" />
        <div className="bg-background absolute -top-10 -bottom-10 left-[78%] w-3 -rotate-3" />
        <div className="bg-state-available absolute top-[12%] left-[52%] h-24 w-32 rounded-[2rem]" />
        <div className="bg-state-available absolute bottom-[8%] left-[6%] h-16 w-24 rounded-[1.5rem]" />
      </div>

      <div className="absolute top-[46%] left-[44%] flex -translate-x-1/2 -translate-y-full flex-col items-center">
        <span className="bg-mark text-mark-foreground text-label mb-2 rounded-full px-3 py-1.5 whitespace-nowrap shadow-lg">
          {VENUE_NAME}
        </span>
        <span className="relative grid size-5 place-items-center">
          <span data-ping className="bg-brand absolute inset-0 rounded-full" />
          <span className="bg-mark ring-brand relative size-4 rounded-full ring-4" />
        </span>
      </div>

      <div className="absolute right-4 bottom-4 left-4 flex justify-end">
        <Button
          asChild
          className={cn(
            "bg-background/80 text-foreground hover:bg-background ring-border h-11 px-4 shadow-lg ring-1 backdrop-blur-xl",
            PRESS,
          )}
          data-glass
        >
          <a href={VENUE_MAPS_URL} target="_blank" rel="noopener noreferrer">
            Open in Maps
            <ArrowUpRightIcon aria-hidden="true" weight="bold" data-icon="inline-end" />
          </a>
        </Button>
      </div>
    </div>
  );
}
