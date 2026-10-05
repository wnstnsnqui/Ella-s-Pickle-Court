import { SettingsShell } from "@/components/settings/settings-shell";
import { SectionCardSkeleton } from "@/components/section-card";

/** The three sections' shape while the read streams. Spec 0007, AC-2. */
export default function Loading() {
  return (
    <SettingsShell>
      <p role="status" className="sr-only">
        Loading the settings
      </p>
      <SectionCardSkeleton rows={3} />
      <SectionCardSkeleton rows={2} tall />
      <SectionCardSkeleton rows={1} />
    </SettingsShell>
  );
}
