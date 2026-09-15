"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/staff/confirm-dialog";
import type { ActionError } from "@/lib/actions";
import {
  refreshOwnerSettings,
  reorderCourts,
  retireCourt,
  saveCourt,
  saveVenueSettings,
} from "@/lib/schedule/actions";
import type { OwnerCourt, OwnerSettings } from "@/lib/schedule/queries";
import { withRetry } from "@/lib/schedule/retry";

import { CourtList } from "./court-list";
import { CourtSheet, type CourtSheetOutcome } from "./court-sheet";
import { toHoursInput, type CourtFormValues, type HoursFormValues } from "./forms";
import { HoursForm, type HoursOutcome } from "./hours-form";
import { RetiredCourts } from "./retired-courts";

/**
 * The settings page's state and every write it makes. Spec 0007, AC-3 to
 * AC-9 and AC-13.
 *
 * It holds the courts and the settings row the page last read, with their
 * versions, and sends those versions with every write. There is no live
 * subscription here: after a write it refetches, and a `version_stale` answer
 * replaces everything with the fresh rows and says so. A `forbidden` answer
 * (a role changed under an open tab) is shown, never swallowed.
 */

const STALE_MESSAGE = "Somebody else changed the settings. Showing the fresh values.";
const DROPPED_MESSAGE = "The change did not go through. Check the connection.";

type SheetState = { kind: "none" } | { kind: "add" } | { kind: "edit"; id: number };

export function SettingsPanel({ initial }: { initial: OwnerSettings }) {
  const [courts, setCourts] = useState(initial.courts);
  const [settings, setSettings] = useState(initial.settings);
  const [busy, setBusy] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetState>({ kind: "none" });
  const [sheetStale, setSheetStale] = useState(false);
  const [retiring, setRetiring] = useState<OwnerCourt | null>(null);
  const [retireError, setRetireError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const openerRef = useRef<HTMLElement | null>(null);

  const live = courts
    .filter((court) => court.retiredAt === null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const retired = courts
    .filter((court) => court.retiredAt !== null)
    .sort((a, b) => (b.retiredAt ?? "").localeCompare(a.retiredAt ?? ""));

  const editing = sheet.kind === "edit" ? (courts.find((c) => c.id === sheet.id) ?? null) : null;

  /** Replace everything with what the database holds now. */
  const refetch = useCallback(async () => {
    const result = await refreshOwnerSettings();
    if (!result.ok) {
      toast.error(result.error.message);
      return null;
    }
    setCourts(result.data.courts);
    setSettings(result.data.settings);
    return result.data;
  }, []);

  /** The answers every write can give that are not about a particular field. */
  const explain = useCallback(
    async (error: ActionError) => {
      if (error.kind === "conflict" && error.reason === "version_stale") {
        await refetch();
        toast.info(STALE_MESSAGE);
        return "stale" as const;
      }
      toast.error(error.message);
      return "shown" as const;
    },
    [refetch],
  );

  const openAdd = (opener: HTMLElement) => {
    openerRef.current = opener;
    setSheetStale(false);
    setSheet({ kind: "add" });
  };

  const openEdit = (court: OwnerCourt, opener: HTMLElement) => {
    openerRef.current = opener;
    setSheetStale(false);
    setSheet({ kind: "edit", id: court.id });
  };

  const submitCourt = async (values: CourtFormValues): Promise<CourtSheetOutcome> => {
    const input =
      sheet.kind === "edit" && editing
        ? {
            id: editing.id,
            version: editing.version,
            sortOrder: editing.sortOrder,
            name: values.name,
            note: values.note === "" ? null : values.note,
          }
        : { name: values.name, note: values.note === "" ? null : values.note };

    setBusy(true);
    let result: Awaited<ReturnType<typeof saveCourt>>;
    try {
      result = await withRetry(() => saveCourt(input));
    } catch {
      setBusy(false);
      toast.error(DROPPED_MESSAGE);
      return;
    }
    await refetch();
    setBusy(false);

    if (result.ok) {
      setSheet({ kind: "none" });
      toast.success(sheet.kind === "edit" ? "Court saved" : `Added ${result.data.name}`);
      return;
    }
    const { error } = result;
    if (error.kind === "invalid") return { issues: error.issues };
    if (error.kind === "conflict" && error.reason === "name_taken") {
      return { issues: { name: [error.message] } };
    }
    if (error.kind === "conflict" && error.reason === "version_stale") {
      // The refetch above already loaded the fresh row; the sheet is keyed on
      // its version, so the boxes now hold the current values.
      setSheetStale(true);
      return;
    }
    toast.error(error.message);
  };

  const move = async (court: OwnerCourt, direction: "up" | "down") => {
    const index = live.findIndex((c) => c.id === court.id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= live.length) return;

    const ordered = [...live];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const before = courts;
    // Optimistic: the row moves at once and every arrow locks until the answer.
    setCourts((current) =>
      current.map((c) => {
        const position = ordered.findIndex((o) => o.id === c.id);
        return position === -1 ? c : { ...c, sortOrder: position };
      }),
    );
    setReordering(true);
    setAnnouncement(`${court.name} moved to position ${target + 1} of ${ordered.length}`);

    let result: Awaited<ReturnType<typeof reorderCourts>>;
    try {
      result = await withRetry(() =>
        reorderCourts({ courts: ordered.map(({ id, version }) => ({ id, version })) }),
      );
    } catch {
      setCourts(before);
      setReordering(false);
      toast.error(DROPPED_MESSAGE);
      return;
    }

    if (result.ok) {
      const fresh = new Map(result.data.map((c) => [c.id, c]));
      setCourts((current) => current.map((c) => fresh.get(c.id) ?? c));
      setReordering(false);
      return;
    }
    setCourts(before);
    setReordering(false);
    setAnnouncement("");
    await explain(result.error);
    if (!(result.error.kind === "conflict" && result.error.reason === "version_stale")) {
      await refetch();
    }
  };

  const openRetire = (court: OwnerCourt, opener: HTMLElement) => {
    openerRef.current = opener;
    setRetireError(null);
    setRetiring(court);
  };

  const confirmRetire = async () => {
    if (!retiring) return;
    setBusy(true);
    let result: Awaited<ReturnType<typeof retireCourt>>;
    try {
      result = await withRetry(() => retireCourt({ id: retiring.id, version: retiring.version }));
    } catch {
      setBusy(false);
      setRetiring(null);
      toast.error(DROPPED_MESSAGE);
      return;
    }
    if (result.ok) {
      await refetch();
      setBusy(false);
      setRetiring(null);
      toast.success(`${result.data.name} retired. It is off both boards.`);
      return;
    }
    setBusy(false);
    const { error } = result;
    if (error.kind === "conflict" && error.reason === "court_has_bookings") {
      // The count stays in the dialog, so the choice is made with it in view.
      setRetireError(error.message);
      return;
    }
    setRetiring(null);
    await explain(error);
  };

  const restore = async (court: OwnerCourt) => {
    setRestoringId(court.id);
    let result: Awaited<ReturnType<typeof saveCourt>>;
    try {
      result = await withRetry(() =>
        saveCourt({
          id: court.id,
          version: court.version,
          name: court.name,
          note: court.note,
          sortOrder: court.sortOrder,
          restore: true,
        }),
      );
    } catch {
      setRestoringId(null);
      toast.error(DROPPED_MESSAGE);
      return;
    }
    await refetch();
    setRestoringId(null);
    if (result.ok) {
      toast.success(`${result.data.name} is back on the boards.`);
      return;
    }
    // The refetch already replaced the rows, so a stale answer only needs saying.
    if (result.error.kind === "conflict" && result.error.reason === "version_stale") {
      toast.info(STALE_MESSAGE);
      return;
    }
    toast.error(result.error.message);
  };

  const submitHours = async (
    values: HoursFormValues,
    acknowledge: boolean,
  ): Promise<HoursOutcome> => {
    setBusy(true);
    let result: Awaited<ReturnType<typeof saveVenueSettings>>;
    try {
      result = await withRetry(() =>
        saveVenueSettings(toHoursInput(values, settings.version, acknowledge)),
      );
    } catch {
      setBusy(false);
      toast.error(DROPPED_MESSAGE);
      return;
    }
    if (result.ok) {
      await refetch();
      setBusy(false);
      toast.success("Hours saved. Both boards show them now.");
      return;
    }
    setBusy(false);
    const { error } = result;
    if (error.kind === "invalid") return { issues: error.issues };
    if (error.kind === "conflict" && error.reason === "bookings_outside_hours") {
      return { outsideCount: error.count ?? 0 };
    }
    await explain(error);
  };

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <CourtList
        courts={live}
        locked={reordering || busy}
        onAdd={openAdd}
        onEdit={openEdit}
        onMove={(court, direction) => void move(court, direction)}
        onRetire={openRetire}
      />

      {/* Keyed on the version, so a stale save reloads the boxes with the fresh row. */}
      <HoursForm key={settings.version} settings={settings} pending={busy} onSubmit={submitHours} />

      {retired.length > 0 ? (
        <RetiredCourts
          courts={retired}
          pendingId={restoringId}
          onRestore={(court) => void restore(court)}
        />
      ) : null}

      <CourtSheet
        open={sheet.kind !== "none"}
        onOpenChange={(open) => {
          if (!open) setSheet({ kind: "none" });
        }}
        court={editing}
        stale={sheetStale}
        pending={busy}
        onSubmit={submitCourt}
        returnFocusTo={openerRef}
      />

      <ConfirmDialog
        open={retiring !== null}
        onOpenChange={(open) => {
          if (!open) setRetiring(null);
        }}
        title={retiring ? `Retire ${retiring.name}?` : "Retire this court?"}
        description="It leaves both boards at once. Its bookings and history are kept, and you can restore it later."
        confirmLabel="Retire"
        error={retireError}
        pending={busy}
        onConfirm={() => void confirmRetire()}
      />
    </div>
  );
}
