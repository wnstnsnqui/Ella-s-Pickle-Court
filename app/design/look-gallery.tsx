import {
  ArrowRightIcon,
  CourtBasketballIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react/ssr";

import { PageHeading } from "@/components/page-heading";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";

import { ThemePane } from "./theme-pane";

/**
 * The landing look's recipes (spec 0018, AC-2 and AC-18), each shown as the
 * one class it is. A component names the recipe; nothing copies its classes.
 */
export function RecipeGallery() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Recipe name="press" use="Every button and pressable tile. Press and hold to feel it.">
        <div className="flex flex-wrap gap-2">
          <Button variant="ink" className="press h-12 px-5">
            Book
            <ArrowRightIcon aria-hidden="true" weight="bold" data-icon="inline-end" />
          </Button>
          <Button variant="outline" className="press h-12 rounded-full px-5">
            Close hours
          </Button>
        </div>
      </Recipe>
      <Recipe name="ink (Button variant)" use="The one main action on a page surface.">
        <Button variant="ink" className="press h-12 w-full">
          Save hours
        </Button>
      </Recipe>
      <Recipe
        name="surface-card"
        use="The board card, the summary, every section, the sign in card."
      >
        <div className="surface-card text-label p-5">A white card with a hairline ring</div>
      </Recipe>
      <Recipe name="surface-glass" use="The header, and the summary card floating on a phone.">
        {/* The darkest thing that can scroll under the header, so the worst case shows. */}
        <div className="bg-mark relative overflow-hidden rounded-3xl p-3">
          <span aria-hidden="true" className="text-mark-foreground text-display block">
            Ella
          </span>
          <div className="surface-glass text-label absolute inset-x-3 bottom-3 rounded-2xl px-3 py-2">
            Glass over ink, solid with less transparency
          </div>
        </div>
      </Recipe>
      <Recipe name="elevation-float" use="Floating sheets and the phone summary card.">
        <div className="bg-popover elevation-float text-label rounded-3xl p-5">
          The hero board&apos;s lift
        </div>
      </Recipe>
      <Recipe name="chip-icon" use="Sheet headers and section headers, a duotone icon at size-6.">
        <span aria-hidden="true" className="chip-icon">
          <CourtBasketballIcon weight="duotone" className="size-6" />
        </span>
      </Recipe>
    </div>
  );
}

function Recipe({ name, use, children }: { name: string; use: string; children: React.ReactNode }) {
  return (
    <ThemePane className="justify-between">
      <div className="flex flex-col gap-0.5">
        <code className="text-label">{name}</code>
        <p className="text-caption text-muted-foreground">{use}</p>
      </div>
      {children}
    </ThemePane>
  );
}

/** How a working page opens and how its sections read (spec 0018, AC-12). */
export function PagePartsPreview() {
  return (
    <div className="bg-muted flex flex-col gap-6 rounded-3xl p-4 sm:p-6">
      <PageHeading
        eyebrow="Venue"
        title="Settings"
        lede="The courts and the hours the venue is open."
        back={false}
        as="h3"
      />
      <SectionCard
        id="design-section"
        icon={SlidersHorizontalIcon}
        title="A section"
        description="A duotone icon in the chip, a title, and what the section is for."
        action={
          <Button variant="outline" className="press h-10 rounded-full px-4">
            Its action
          </Button>
        }
      >
        <ul className="divide-border text-body divide-y">
          <li className="py-3 first:pt-0">Rows are divided by hairlines,</li>
          <li className="py-3 last:pb-0">never boxed.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
