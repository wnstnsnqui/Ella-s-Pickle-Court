"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ReportCourt } from "@/lib/report/queries";

const ALL_COURTS = "all";

/**
 * The court picker. Spec 0008, AC-6: all courts first, then live courts in
 * `sort_order`, then retired courts each tagged. The one client component on
 * the page: on change it pushes the same URL with `court` set and `day`
 * dropped, so the page itself stays a server component.
 */
export function CourtSelect({
  courts,
  selectedCourtId,
}: {
  courts: readonly ReportCourt[];
  selectedCourtId: number | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const live = [...courts]
    .filter((court) => !court.retiredAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const retired = [...courts]
    .filter((court) => court.retiredAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === ALL_COURTS) {
      params.delete("court");
    } else {
      params.set("court", value);
    }
    params.delete("day");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={selectedCourtId ? String(selectedCourtId) : ALL_COURTS} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-56" aria-label="Court">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_COURTS}>All courts</SelectItem>
        {live.map((court) => (
          <SelectItem key={court.id} value={String(court.id)}>
            {court.name}
          </SelectItem>
        ))}
        {retired.map((court) => (
          <SelectItem key={court.id} value={String(court.id)}>
            {court.name} (Retired)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
