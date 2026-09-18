import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { LiveIndicator } from "@/components/live-indicator";
import { DayNav } from "@/components/day-nav";
import { StateLegend } from "@/components/schedule/state-legend";
import { CELL_VIEWS } from "@/components/schedule/cell-view";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { addDays, calendarDateToLocalDate, todayInZone } from "@/lib/time";
import { VENUE_NAME } from "@/lib/venue";

import { CellStateGallery, GridPreview, LiveIndicatorPreview } from "./board-preview";
import { ComponentGallery } from "./component-gallery";
import { ContrastAudit } from "./contrast-audit";
import { ColorTokens, SpaceAndRadius, TypeScale } from "./token-gallery";
import { SAMPLE_HORIZON_DAYS, SAMPLE_TIMEZONE } from "./sample";
import { ThemePane } from "./theme-pane";

/**
 * The proof surface for spec 0003, AC-3.
 *
 * Everything the design system is, on one page, open to anybody and closed to
 * search engines. It exists so a contrast failure or a state that stops being
 * distinguishable is something you can look at, rather than something
 * everybody hopes is still true.
 */
export const metadata: Metadata = {
  title: "Design system",
  description: `Every token, component and cell state ${VENUE_NAME} is built from.`,
  robots: { index: false, follow: false },
};

/** The page is about what is true right now, so nothing here is cached. */
export const dynamic = "force-dynamic";

export default function DesignPage() {
  const date = todayInZone(SAMPLE_TIMEZONE);
  const dateLocal = calendarDateToLocalDate(date);
  const lastBookableDayLocal = calendarDateToLocalDate(addDays(date, SAMPLE_HORIZON_DAYS));
  // The shell's own indicator, as a real board would hand it: the moment this
  // render happened, which is exactly what the age counts from. Reading the clock
  // is impure and the rule is right to say so on the client, but this is a server
  // component on a `force-dynamic` route, so the render *is* the request.
  // eslint-disable-next-line react-hooks/purity -- server render, once per request
  const renderedAt = Date.now();

  return (
    <AppShell
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DayNav date={date} timezone={SAMPLE_TIMEZONE} horizonDays={SAMPLE_HORIZON_DAYS} />
          <LiveIndicator channelStatus="SUBSCRIBED" lastUpdatedAt={renderedAt} />
        </div>
      }
      staff={
        <Button size="sm" variant="outline">
          Staff control
        </Button>
      }
    >
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-2">
          <p className="text-caption text-muted-foreground uppercase">Spec 0003</p>
          <h1 className="text-display">The design system</h1>
          <p className="text-body text-muted-foreground max-w-prose">
            Sunset Club: a soft cream canvas, a golden header band, deep teal as the brand ink, and
            the cell states in teal and tangerine. Inter throughout. Every value on this page comes
            from a token in <code>app/globals.css</code>, which is the source of truth. Nothing here
            is written twice.
          </p>
        </header>

        <Section
          id="contrast"
          title="Contrast, measured"
          blurb="Read out of the browser at load. These are the numbers a reader actually gets, not numbers written down at design time."
        >
          <ContrastAudit />
        </Section>

        <Section
          id="color"
          title="Colour"
          blurb="Ten surface tokens, eight accent tokens (primary, the brand band, the mark, destructive), and five state roles that each carry a fill, a text colour and a boundary."
        >
          <ThemePane>
            <ColorTokens />
          </ThemePane>
        </Section>

        <Section
          id="type"
          title="Type"
          blurb="Inter, self hosted at build time, in six steps. Nothing in this project sets a font size any other way."
        >
          <ThemePane>
            <TypeScale />
          </ThemePane>
        </Section>

        <Section
          id="space"
          title="Space, radius and geometry"
          blurb="Ordinary spacing is restricted to seven steps. The grid's own measurements are tokens, because two of them are load bearing for touch and for the pinned column."
        >
          <ThemePane>
            <SpaceAndRadius />
          </ThemePane>
        </Section>

        <Section
          id="cells"
          title="The cell states"
          blurb="Seven views, each with its own icon, its own colour pair and its own name. Turn colour off and every one of them still reads, which is the point of the icon."
        >
          <CellStateGallery />
        </Section>

        <Section
          id="legend"
          title="The legend"
          blurb="Present on both boards, never behind a tap, one compact row so it does not eat the hours."
        >
          <ThemePane>
            <StateLegend views={CELL_VIEWS} />
          </ThemePane>
        </Section>

        <Section
          id="grid"
          title="The grid"
          blurb="One tab stop, arrow keys inside it, the time column pinned while the courts scroll sideways. Narrow your window to a phone width to see it work."
        >
          <GridPreview date={date} />
        </Section>

        <Section
          id="live"
          title="The live indicator"
          blurb="Whether the board is still telling the truth, and how old it is when it is not."
        >
          <LiveIndicatorPreview />
        </Section>

        <Section
          id="calendar"
          title="Pick a date"
          blurb="The calendar behind the toolbar's `Pick a date` button above (spec 0011), shown bare here since a sheet would portal outside this swatch. Days before today and past the booking horizon are disabled."
        >
          <ThemePane>
            <Calendar
              mode="single"
              required
              selected={dateLocal}
              today={dateLocal}
              month={dateLocal}
              startMonth={dateLocal}
              endMonth={lastBookableDayLocal}
              disabled={[{ before: dateLocal }, { after: lastBookableDayLocal }]}
            />
          </ThemePane>
        </Section>

        <Section
          id="components"
          title="The base components"
          blurb="From shadcn/ui, restyled by nothing: they read our tokens directly, so they inherited the system rather than being made to match it."
        >
          <ComponentGallery />
        </Section>

        <Separator />

        <p className="text-caption text-muted-foreground">
          Tokens live in <code>app/globals.css</code>. The written version of this page, for people
          rather than browsers, is <code>docs/design.md</code>.
        </p>
      </div>
    </AppShell>
  );
}

function Section({
  id,
  title,
  blurb,
  children,
}: {
  id: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-title">
          {title}
        </h2>
        <p className="text-body text-muted-foreground max-w-prose">{blurb}</p>
      </div>
      {children}
    </section>
  );
}
