"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { cellKey } from "@/components/schedule/cell-key";
import { CELL_VIEWS } from "@/components/schedule/cell-view";
import { ScheduleGrid, type GridView } from "@/components/schedule/schedule-grid";
import { useChangedCells } from "@/components/schedule/use-changed-cells";
import type { ActionResult } from "@/lib/actions";
import { cancelReservation, createReservations, updateReservation } from "@/lib/schedule/actions";
import { closureEndOptions } from "@/lib/schedule/closure";
import { isOwnerLevel } from "@/lib/schedule/constants";
import type { Grid } from "@/lib/schedule/grid";
import type { StaffReservation, StaffSchedule } from "@/lib/schedule/queries";
import { withRetry } from "@/lib/schedule/retry";
import { cn } from "@/lib/utils";
import {
  EMPTY_SELECTION,
  isSelectable,
  pruneSelection,
  selectionRuns,
  summarizeRuns,
  describeSummary,
  toggleSelection,
  toReservationRuns,
  type Selection,
} from "@/lib/schedule/selection";

import { BookSheet, type SubmitOutcome } from "./book-sheet";
import { CloseSheet } from "./close-sheet";
import { ConfirmDialog } from "./confirm-dialog";
import { DetailsSheet } from "./details-sheet";
import { EditSheet, type EditOutcome, type EditPatch } from "./edit-sheet";
import { formatRange } from "./format";
import { toCustomerFields, toCustomerPatch } from "./forms";
import { SelectionBar } from "./selection-bar";
import { useStaffBoard } from "./staff-schedule-context";

/**
 * The staff board. Spec 0005.
 *
 * A client layer over the grid spec 0003 built. Cells toggle in and out of a
 * selection, the bar turns the selection into one Book or Close court call,
 * and a tap on a taken cell opens its row. Every write refetches the whole day
 * on return, and the selection is pruned against reality on every refetch,
 * so the board never acts on a picture it has not just checked.
 */

/** How long a changed cell glows, matching `--dur-slow`. */
const CHANGED_HOLD_MS = 1_200;

/** How long Change refused stays on a cell before it reads plainly again. */
const FAILED_HOLD_MS = 4_000;

const REFUSED_MESSAGE =
  "Somebody got there first. The taken hours were cleared from your selection.";

type SheetState =
  | { kind: "none" }
  | { kind: "book" }
  | { kind: "close" }
  | { kind: "details"; id: number }
  /**
   * `version` is the row as the editor saw it when the sheet opened, on
   * purpose: the live schedule keeps moving under the sheet, and saving
   * against the newest version would silently overwrite somebody else's edit
   * instead of surfacing it (AC-8).
   */
  | { kind: "edit"; id: number; version: number };

export function StaffBoard() {
  const { schedule, refetch, refetchError, subscribe, viewer, dayNavPending } = useStaffBoard();
  const { grid } = schedule;

  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [sheet, setSheet] = useState<SheetState>({ kind: "none" });
  const [confirming, setConfirming] = useState(false);
  const [pendingCells, setPendingCells] = useState<ReadonlySet<string>>(EMPTY_SELECTION);
  const [failedCells, setFailedCells] = useState<ReadonlySet<string>>(EMPTY_SELECTION);
  const [busy, setBusy] = useState(false);
  const changedCells = useChangedCells(grid, CHANGED_HOLD_MS);

  // Mirrors `pendingCells` for the listener below, which runs outside a render.
  const pendingRef = useRef<ReadonlySet<string>>(EMPTY_SELECTION);
  const setPending = useCallback((keys: ReadonlySet<string>) => {
    pendingRef.current = keys;
    setPendingCells(keys);
  }, []);

  // Whatever opened the current sheet, so closing it gives focus back (AC-15).
  const openerRef = useRef<HTMLElement | null>(null);
  const remember = (event: { currentTarget: HTMLElement }) => {
    openerRef.current = event.currentTarget;
  };

  // The latest writers, reachable from a Retry toast fired by an earlier render.
  const writersRef = useRef<{
    submitSet: (kind: "booking" | "closed", fields: Record<string, unknown>) => void;
    submitEdit: (patch: EditPatch, row: StaffReservation, version: number) => void;
    confirmCancel: (row: StaffReservation) => void;
  } | null>(null);

  // The minute clock behind the lock. The database decides with `now()`; this
  // only avoids offering a tap that would be refused.
  const [now, setNow] = useState(() => Date.now());

  const lockedCells = useMemo(
    () => (isOwnerLevel(viewer.role) ? EMPTY_SELECTION : endedCells(grid, now)),
    [grid, now, viewer.role],
  );

  const activeReservations = useMemo(
    () => schedule.reservations.filter((row) => row.status === "active"),
    [schedule.reservations],
  );

  const cellCaptions = useMemo(
    () => captionsFor(grid, activeReservations),
    [grid, activeReservations],
  );

  const runs = useMemo(() => selectionRuns(selection, grid), [selection, grid]);

  const openRow = useMemo(() => {
    if (sheet.kind !== "details" && sheet.kind !== "edit") return null;
    return schedule.reservations.find((row) => row.id === sheet.id) ?? null;
  }, [sheet, schedule.reservations]);

  const courtName = (courtId: number) =>
    grid.courts.find((court) => court.id === courtId)?.name ?? "Court";

  /**
   * Bring the browser state in line with a day that just changed (invariant 5):
   * prune the selection, say so, and drop a sheet whose row is gone. Runs after
   * every refetch and every minute tick, never while a write is in flight: our
   * own broadcast can land before the action answers, and the answer decides
   * what the cells became.
   */
  const reconcile = useCallback(
    (fresh: StaffSchedule, at: number) => {
      const locked = isOwnerLevel(viewer.role) ? EMPTY_SELECTION : endedCells(fresh.grid, at);
      const { kept, removed } = pruneSelection(selection, fresh.grid, locked);
      if (removed.length > 0) {
        setSelection(kept);
        setFailedCells((held) => new Set([...held, ...removed]));
        toast.warning(REFUSED_MESSAGE);
        if ((sheet.kind === "book" || sheet.kind === "close") && kept.size === 0) {
          setSheet({ kind: "none" });
        }
      }
      if (sheet.kind === "details" || sheet.kind === "edit") {
        const row = fresh.reservations.find((candidate) => candidate.id === sheet.id);
        if (!row || row.status === "cancelled") {
          setSheet({ kind: "none" });
          toast.info("That booking was changed by somebody else and is no longer on the board.");
        }
      }
    },
    [selection, sheet, viewer.role],
  );
  const reconcileRef = useRef(reconcile);
  useEffect(() => {
    reconcileRef.current = reconcile;
  }, [reconcile]);

  useEffect(
    () =>
      subscribe((fresh) => {
        if (pendingRef.current.size === 0) reconcileRef.current(fresh, Date.now());
      }),
    [subscribe],
  );

  const scheduleRef = useRef(schedule);
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  useEffect(() => {
    const timer = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (pendingRef.current.size === 0) reconcileRef.current(scheduleRef.current, at);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Change refused is a moment, not a state. It clears itself.
  useEffect(() => {
    if (failedCells.size === 0) return;
    const timer = setTimeout(() => setFailedCells(EMPTY_SELECTION), FAILED_HOLD_MS);
    return () => clearTimeout(timer);
  }, [failedCells]);

  // Escape empties the selection when no sheet is up to take it first (AC-3).
  // The Escape that closes a sheet still reaches the window after the sheet
  // state has flipped, so the first beat after a close is the sheet's, not ours.
  const sheetClosedAt = useRef(0);
  useEffect(() => {
    if (sheet.kind !== "none" || confirming) {
      return () => {
        sheetClosedAt.current = Date.now();
      };
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || selection.size === 0) return;
      if (Date.now() - sheetClosedAt.current < 300) return;
      setSelection(EMPTY_SELECTION);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet.kind, confirming, selection.size]);

  const onSelectCell = useCallback(
    (courtId: number, rowStartsAt: string) => {
      const key = cellKey(courtId, rowStartsAt);
      if (document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement;
      if (failedCells.size > 0) setFailedCells(EMPTY_SELECTION);
      const row = grid.rows.find((candidate) => candidate.startsAt === rowStartsAt);
      const cell = row?.cells.find((candidate) => candidate.courtId === courtId);
      if (!row || !cell) return;

      if (cell.state === "available" && !row.outOfHours) {
        if (isSelectable(grid, key, lockedCells))
          setSelection((held) => toggleSelection(held, key));
        return;
      }
      // Booked, or Unavailable because of a closure: open the row. An
      // Unavailable cell with nothing on it is the venue being shut, and there
      // is nothing to show for that.
      const found = reservationAt(activeReservations, courtId, row.startsAt, row.endsAt);
      if (found) setSheet({ kind: "details", id: found.id });
    },
    [grid, lockedCells, failedCells.size, activeReservations],
  );

  /** One Book or Close court press: every selected run, in one statement. */
  const submitSet = useCallback(
    async (kind: "booking" | "closed", fields: Record<string, unknown>): Promise<SubmitOutcome> => {
      const keys = runs.flatMap((run) => run.keys);
      if (keys.length === 0) return;
      const summary = describeSummary(summarizeRuns(runs));
      const input = { runs: toReservationRuns(runs), kind, ...fields };
      setBusy(true);
      setPending(new Set(keys));

      // How many times the action was sent: the "our own earlier attempt
      // landed" reading below is only honest when there was an earlier attempt.
      let attempts = 0;
      let result: ActionResult<unknown>;
      try {
        result = await withRetry(() => {
          attempts += 1;
          return createReservations(input);
        });
      } catch {
        setPending(EMPTY_SELECTION);
        setFailedCells(new Set(keys));
        setBusy(false);
        // A modal sheet swallows every tap outside it, the toast included, so
        // the sheet closes and Retry carries what was typed (AC-13). The
        // selection stays, so the person can also just press Book again.
        setSheet({ kind: "none" });
        toast.error("The change did not go through. Check the connection.", {
          action: { label: "Retry", onClick: () => writersRef.current?.submitSet(kind, fields) },
        });
        return;
      }

      if (result.ok) {
        setSelection(EMPTY_SELECTION);
        setSheet({ kind: "none" });
        await refetch();
        setPending(EMPTY_SELECTION);
        setBusy(false);
        toast.success(`${kind === "booking" ? "Booked" : "Closed"} ${summary}`);
        return;
      }

      const { error } = result;
      if (error.kind === "invalid") {
        setPending(EMPTY_SELECTION);
        setBusy(false);
        if (error.issues.runs) toast.error(error.issues.runs[0]);
        return { issues: error.issues };
      }

      // Anything else is answered by the day as it is now. A `slot_taken` on a
      // retry, where the first attempt actually landed (AC-13), reads as
      // success. On a first attempt it is always somebody else, even when that
      // somebody is this same account on another device.
      const fresh = await refetch();
      setPending(EMPTY_SELECTION);
      setBusy(false);
      if (
        attempts > 1 &&
        error.kind === "conflict" &&
        error.reason === "slot_taken" &&
        fresh &&
        keys.every((key) => ownRowAt(fresh, key, viewer.clerkUserId, kind))
      ) {
        setSelection(EMPTY_SELECTION);
        setSheet({ kind: "none" });
        toast.success(`${kind === "booking" ? "Booked" : "Closed"} ${summary}`);
        return;
      }
      // The taken cells leave the selection with Change refused and the toast;
      // the survivors stay selected with the sheet still open (AC-6).
      if (fresh) reconcileRef.current(fresh, Date.now());
      if (error.kind !== "conflict" || error.reason !== "slot_taken") {
        toast.error(error.message);
      }
    },
    [runs, refetch, setPending, viewer.clerkUserId],
  );

  /** An edit against the version of the row the board holds right now. */
  const submitEdit = useCallback(
    async (
      patch: EditPatch,
      row: StaffReservation | null = openRow,
      version: number | null = sheet.kind === "edit" ? sheet.version : null,
    ): Promise<EditOutcome> => {
      if (!row || version === null) return;
      const input =
        patch.kind === "booking"
          ? { id: row.id, version, ...toCustomerPatch(patch.values) }
          : {
              id: row.id,
              version,
              note: patch.values.note === "" ? null : patch.values.note,
              endTime: patch.values.endTime,
            };
      setBusy(true);
      let result: ActionResult<unknown>;
      try {
        result = await withRetry(() => updateReservation(input));
      } catch {
        setBusy(false);
        setSheet({ kind: "none" });
        toast.error("The change did not go through. Check the connection.", {
          action: {
            label: "Retry",
            onClick: () => writersRef.current?.submitEdit(patch, row, version),
          },
        });
        return;
      }
      const fresh = await refetch();
      setBusy(false);
      if (result.ok) {
        setSheet({ kind: "details", id: row.id });
        toast.success("Saved");
        return;
      }
      const { error } = result;
      if (error.kind === "invalid") return { issues: error.issues };
      if (error.kind === "conflict" && error.reason === "version_stale") {
        // The next save goes against the version the row has now.
        const current = fresh?.reservations.find((candidate) => candidate.id === row.id);
        if (current) setSheet({ kind: "edit", id: row.id, version: current.version });
        return { stale: true };
      }
      toast.error(error.message);
    },
    [openRow, sheet, refetch],
  );

  /** Cancel a booking, or reopen a closed court: the same one way transition. */
  const confirmCancel = useCallback(
    async (row: StaffReservation | null = openRow) => {
      if (!row) return;
      const booking = row.kind === "booking";
      setBusy(true);
      let result: ActionResult<unknown>;
      try {
        result = await withRetry(() => cancelReservation({ id: row.id, version: row.version }));
      } catch {
        setBusy(false);
        setConfirming(false);
        setSheet({ kind: "none" });
        toast.error("The change did not go through. Check the connection.", {
          action: { label: "Retry", onClick: () => writersRef.current?.confirmCancel(row) },
        });
        return;
      }
      setConfirming(false);
      setSheet({ kind: "none" });
      await refetch();
      setBusy(false);
      if (result.ok) {
        toast.success(booking ? "Booking cancelled. The hours are free again." : "Court reopened.");
        return;
      }
      toast.error(result.error.message);
    },
    [openRow, refetch],
  );

  useEffect(() => {
    writersRef.current = {
      submitSet: (kind, fields) => void submitSet(kind, fields),
      submitEdit: (patch, row, version) => void submitEdit(patch, row, version),
      confirmCancel: (row) => void confirmCancel(row),
    };
  }, [submitSet, submitEdit, confirmCancel]);

  const view: GridView =
    grid.courts.length === 0
      ? { kind: "empty", reason: "no-courts" }
      : grid.rows.length === 0
        ? { kind: "empty", reason: "closed" }
        : { kind: "ready", grid };

  const canChangeOpenRow =
    openRow !== null && (isOwnerLevel(viewer.role) || Date.parse(openRow.endsAt) > now);

  const endOptions = useMemo(
    () =>
      openRow && openRow.kind === "closed"
        ? closureEndOptions(grid, schedule.reservations, openRow)
        : [],
    [grid, schedule.reservations, openRow],
  );

  return (
    <div className="flex flex-col">
      {refetchError ? (
        <p role="alert" className="text-caption text-destructive mb-3">
          The last reload failed: {refetchError}. The board shows the day as it was before.
        </p>
      ) : null}

      <ScheduleGrid
        view={view}
        legendViews={CELL_VIEWS}
        onSelectCell={onSelectCell}
        selectedCells={selection}
        pendingCells={pendingCells}
        failedCells={failedCells}
        changedCells={changedCells}
        lockedCells={lockedCells}
        cellCaptions={cellCaptions}
        className={cn(
          dayNavPending &&
            "pointer-events-none opacity-50 transition-opacity motion-reduce:transition-none",
        )}
        busy={dayNavPending}
      />

      {runs.length > 0 ? (
        <SelectionBar
          runs={runs}
          onBook={(event) => {
            remember(event);
            setSheet({ kind: "book" });
          }}
          onClose={(event) => {
            remember(event);
            setSheet({ kind: "close" });
          }}
          onClear={() => setSelection(EMPTY_SELECTION)}
        />
      ) : null}

      <BookSheet
        open={sheet.kind === "book"}
        onOpenChange={(open) => !open && !busy && setSheet({ kind: "none" })}
        runs={runs}
        pending={busy}
        onSubmit={(values) => submitSet("booking", toCustomerFields(values))}
        returnFocusTo={openerRef}
      />
      <CloseSheet
        open={sheet.kind === "close"}
        onOpenChange={(open) => !open && !busy && setSheet({ kind: "none" })}
        runs={runs}
        pending={busy}
        onSubmit={(values) => submitSet("closed", values.note === "" ? {} : { note: values.note })}
      />
      <DetailsSheet
        open={sheet.kind === "details"}
        onOpenChange={(open) => !open && setSheet({ kind: "none" })}
        reservation={sheet.kind === "details" ? openRow : null}
        courtName={openRow ? courtName(openRow.courtId) : "Court"}
        timeZone={grid.timezone}
        staff={schedule.staff}
        canChange={canChangeOpenRow}
        onEdit={() =>
          openRow && setSheet({ kind: "edit", id: openRow.id, version: openRow.version })
        }
        onCancel={() => setConfirming(true)}
        returnFocusTo={openerRef}
      />
      <EditSheet
        open={sheet.kind === "edit"}
        onOpenChange={(open) =>
          !open && !busy && openRow && setSheet({ kind: "details", id: openRow.id })
        }
        reservation={sheet.kind === "edit" ? openRow : null}
        timeZone={grid.timezone}
        endOptions={endOptions}
        pending={busy}
        onSubmit={(patch) => submitEdit(patch)}
        returnFocusTo={openerRef}
      />
      <ConfirmDialog
        open={confirming && openRow !== null}
        onOpenChange={(open) => !open && !busy && setConfirming(false)}
        title={openRow?.kind === "booking" ? "Cancel this booking?" : "Reopen this court?"}
        description={
          openRow
            ? openRow.kind === "booking"
              ? `${openRow.customerName ?? "This booking"}, ${courtName(openRow.courtId)}, ${formatRange(openRow.startsAt, openRow.endsAt, grid.timezone)}. The hours become free for anyone.`
              : `${courtName(openRow.courtId)}, ${formatRange(openRow.startsAt, openRow.endsAt, grid.timezone)}. The hours become bookable again.`
            : ""
        }
        confirmLabel={openRow?.kind === "booking" ? "Cancel booking" : "Reopen court"}
        pending={busy}
        onConfirm={() => void confirmCancel()}
      />
    </div>
  );
}

/** Every cell on a row that has already ended, keyed the way the grid keys them. */
function endedCells(grid: Grid, now: number): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const row of grid.rows) {
    if (Date.parse(row.endsAt) > now) continue;
    for (const cell of row.cells) keys.add(cellKey(cell.courtId, row.startsAt));
  }
  return keys;
}

/** The customer's name on every cell a booking covers (AC-2). */
function captionsFor(
  grid: Grid,
  reservations: readonly StaffReservation[],
): ReadonlyMap<string, string> {
  const captions = new Map<string, string>();
  for (const row of grid.rows) {
    for (const cell of row.cells) {
      if (cell.state !== "booked") continue;
      const found = reservationAt(reservations, cell.courtId, row.startsAt, row.endsAt);
      if (found?.customerName)
        captions.set(cellKey(cell.courtId, row.startsAt), found.customerName);
    }
  }
  return captions;
}

/**
 * The row a cell shows. A closure wins over a booking, the same precedence the
 * grid used to label the cell, so the sheet always explains what is on screen.
 */
function reservationAt(
  reservations: readonly StaffReservation[],
  courtId: number,
  rowStartsAt: string,
  rowEndsAt: string,
): StaffReservation | null {
  const start = Date.parse(rowStartsAt);
  const end = Date.parse(rowEndsAt);
  const hits = reservations.filter(
    (row) =>
      row.courtId === courtId && Date.parse(row.startsAt) < end && start < Date.parse(row.endsAt),
  );
  return hits.find((row) => row.kind === "closed") ?? hits[0] ?? null;
}

/** Whether a cell is now held by a row this person wrote, of the kind they just tried. */
function ownRowAt(
  schedule: StaffSchedule,
  key: string,
  clerkUserId: string,
  kind: string,
): boolean {
  const at = key.indexOf("@");
  const courtId = Number(key.slice(0, at));
  const rowStartsAt = key.slice(at + 1);
  const row = schedule.grid.rows.find((candidate) => candidate.startsAt === rowStartsAt);
  if (!row) return false;
  const found = reservationAt(
    schedule.reservations.filter((r) => r.status === "active"),
    courtId,
    row.startsAt,
    row.endsAt,
  );
  return found !== null && found.createdBy === clerkUserId && found.kind === kind;
}
