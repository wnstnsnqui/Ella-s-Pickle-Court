import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { StateLegend } from "@/components/schedule/state-legend";
import { CELL_VIEWS } from "@/components/schedule/cell-view";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { addDays, calendarDateToLocalDate, todayInZone } from "@/lib/time";
import { VENUE_NAME } from "@/lib/venue";

import { CellStateGallery, GridPreview, LiveIndicatorPreview, SheetPreview } from "./board-preview";
import { ComponentGallery } from "./component-gallery";
import { ContrastAudit } from "./contrast-audit";
import { DayNavPreview } from "./day-nav-preview";
import { PagePartsPreview, RecipeGallery } from "./look-gallery";
import { ColorTokens, SpaceAndRadius, TypeScale } from "./token-gallery";
import { SAMPLE_HORIZON_DAYS, SAMPLE_TIMEZONE } from "./sample";
import { ThemePane } from "./theme-pane";

/**
 * The proof surface for spec 0003, AC-3, and for the landing look every
 * working screen wears since spec 0018, AC-18.
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
  return (
    <AppShell
      staff={
        <Button size="sm" variant="outline">
          Staff control
        </Button>
      }
    >
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-2">
          <p className="text-label text-link tracking-wide uppercase">Specs 0003 and 0018</p>
          <h1 className="text-display">The design system</h1>
          <p className="text-body text-muted-foreground max-w-prose">
            The landing page&apos;s look at a working tempo: white cards with a hairline ring on a
            stone grey page, a glass header, the ink colour for the one main action, yellow only for
            what you picked or the next step, and the cell states in teal and tangerine. Outfit
            throughout, light only. Every value on this page comes from a token or a recipe in{" "}
            <code>app/globals.css</code>, which is the source of truth. Nothing here is written
            twice.
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
          id="recipes"
          title="The recipes"
          blurb="The landing's materials, each named once as a utility, and the ink button. A screen composes these; it never copies their classes."
        >
          <RecipeGallery />
        </Section>

        <Section
          id="color"
          title="Colour"
          blurb="Ten surface tokens, eight accent tokens (primary, the brand yellow, the mark and the ink button, destructive), and five state roles that each carry a fill, a text colour and an edge."
        >
          <ThemePane>
            <ColorTokens />
          </ThemePane>
        </Section>

        <Section
          id="type"
          title="Type"
          blurb="Outfit, self hosted at build time, in six steps. Nothing on a working screen sets a font size any other way; the two fluid steps above them belong to the landing page."
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
          title="The tiles"
          blurb="Seven views in the landing's tile look, each with its own bold icon, its own colour pair and its own word, and again with a name in its place. Turn colour off and every one of them still reads, which is the point of the icon and the word."
        >
          <CellStateGallery />
        </Section>

        <Section
          id="legend"
          title="The legend"
          blurb="Present on both boards, never behind a tap: the tiles' own icons beside their words, no swatches. One row that scrolls sideways on a phone, so it never eats the hours."
        >
          <ThemePane>
            <StateLegend views={CELL_VIEWS} />
          </ThemePane>
        </Section>

        <Section
          id="grid"
          title="The board card"
          blurb="Both boards in one white card: the day, the strip with the calendar at its end, the legend and the grid. One tab stop, arrow keys inside it, the time column pinned while the courts scroll sideways. Narrow your window to a phone width to see the strip become one row."
        >
          <GridPreview date={date} />
        </Section>

        <Section
          id="live"
          title="The live pill"
          blurb="Whether a board is still telling the truth, and how old it is when it is not. Only the live reading moves. No board shows it today."
        >
          <LiveIndicatorPreview />
        </Section>

        <Section
          id="sheet"
          title="The floating sheet"
          blurb="Every board sheet floats 8px in from the edges over the checkout card's soft dim, with the checkout card's header and full height footer buttons."
        >
          <SheetPreview />
        </Section>

        <Section
          id="page"
          title="Page heading and section card"
          blurb="How settings, reports, staff accounts and your account open, and how their sections read. Nothing on them reveals on scroll."
        >
          <PagePartsPreview />
        </Section>

        <Section
          id="calendar"
          title="Pick a date"
          blurb="The calendar behind the round button at the end of the day strip (spec 0011), shown bare here since a sheet would portal outside this swatch. Days before today and past the booking horizon are disabled."
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
          id="day-nav"
          title="The day arrows"
          blurb="Retired from both boards by the day strip (spec 0018, AC-8), and kept for any screen that steps one day at a time."
        >
          <ThemePane>
            <DayNavPreview
              date={date}
              timezone={SAMPLE_TIMEZONE}
              horizonDays={SAMPLE_HORIZON_DAYS}
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
