import { formatBookingCode } from "@/lib/booking/code";
import type { BookingReceipt } from "@/lib/booking/types";
import { formatAtVenue } from "@/lib/time";
import { formatPeso, VENUE_ADDRESS, VENUE_NAME, VENUE_PHONE_DISPLAY } from "@/lib/venue";

import { hoursChip, runHours, runLabel, sortRuns } from "./booking";

/** A court as the receipt names it. */
type CourtName = { id: number; name: string };

/** One row of a facts group: a term on the left, its value on the right. */
export type ImageFact = { term: string; value: string };

/** Everything the saved image prints, worked out before a pixel is drawn. */
export type ReceiptImageModel = {
  venue: string;
  code: string;
  runs: { court: string; when: string; chip: string }[];
  customer: ImageFact[];
  payment: ImageFact[];
  total: string;
  footer: string[];
  fileName: string;
};

/**
 * The receipt as the saved image reads it (spec 0015, AC-14): the same facts
 * as the receipt step, in the same order, and nothing the step does not show.
 */
export function receiptImageModel(
  receipt: BookingReceipt,
  heading: string,
  courts: readonly CourtName[],
): ReceiptImageModel {
  const code = formatBookingCode(receipt.code);
  const runs = sortRuns(
    receipt.runs,
    courts.map((court) => court.id),
  ).map((run) => ({
    court: courts.find((court) => court.id === run.courtId)?.name ?? `Court ${run.courtId}`,
    when: `${heading} · ${runLabel(run)}`,
    chip: hoursChip(runHours([run])),
  }));
  const customer: ImageFact[] = [{ term: "Name", value: receipt.customer.name }];
  if (receipt.customer.phone) customer.push({ term: "Mobile", value: receipt.customer.phone });
  if (receipt.customer.email) customer.push({ term: "Email", value: receipt.customer.email });
  return {
    venue: VENUE_NAME,
    code,
    runs,
    customer,
    payment: [
      { term: "Method", value: "QR transfer" },
      { term: "Reference", value: `•••• ${receipt.payment.referenceLast4}` },
      { term: "Proof", value: "Screenshot received" },
      {
        term: "Submitted",
        value: formatAtVenue(receipt.payment.submittedAt, {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        }),
      },
    ],
    total: formatPeso(receipt.amount),
    footer: [
      "Staff check every payment. If yours doesn't match, we'll message you.",
      `${VENUE_ADDRESS} · ${VENUE_PHONE_DISPLAY}`,
    ],
    fileName: `booking-${code}.png`,
  };
}

/** The image's width in CSS pixels; drawn at `SCALE` so it stays sharp on any phone. */
const WIDTH = 420;
const SCALE = 3;
const PAD = 24;

/** The colors and font the page already uses, read from its tokens so the two never drift. */
function readTheme() {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string) => root.getPropertyValue(name).trim();
  return {
    font: getComputedStyle(document.body).fontFamily,
    background: token("--background"),
    foreground: token("--foreground"),
    muted: token("--muted"),
    mutedForeground: token("--muted-foreground"),
    border: token("--border"),
    brand: token("--brand"),
    brandForeground: token("--brand-foreground"),
    booked: token("--state-booked"),
    bookedForeground: token("--state-booked-fg"),
    available: token("--state-available"),
    availableForeground: token("--state-available-fg"),
    availableBorder: token("--state-available-border"),
  };
}

type Theme = ReturnType<typeof readTheme>;

/** Cuts a value to fit its width with an ellipsis, so a long email never runs off the card. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Breaks a line of prose into lines no wider than `width`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws the receipt top to bottom and answers how tall it came out. */
function draw(ctx: CanvasRenderingContext2D, model: ReceiptImageModel, theme: Theme): number {
  const font = (weight: number, size: number) => `${weight} ${size}px ${theme.font}`;
  const inner = WIDTH - PAD * 2;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, WIDTH, ctx.canvas.height);

  // The venue's band.
  ctx.fillStyle = theme.brand;
  ctx.fillRect(0, 0, WIDTH, 56);
  ctx.fillStyle = theme.brandForeground;
  ctx.font = font(600, 18);
  ctx.textAlign = "center";
  ctx.fillText(model.venue, WIDTH / 2, 35);

  // The check badge and title.
  let y = 84;
  ctx.fillStyle = theme.available;
  ctx.beginPath();
  ctx.arc(WIDTH / 2, y + 24, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme.availableForeground;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 10, y + 24);
  ctx.lineTo(WIDTH / 2 - 3, y + 31);
  ctx.lineTo(WIDTH / 2 + 11, y + 17);
  ctx.stroke();
  y += 84;
  ctx.fillStyle = theme.foreground;
  ctx.font = font(600, 24);
  ctx.fillText("Booking confirmed", WIDTH / 2, y);

  // The code.
  y += 20;
  ctx.fillStyle = theme.muted;
  roundRect(ctx, PAD, y, inner, 92, 16);
  ctx.fill();
  ctx.fillStyle = theme.mutedForeground;
  ctx.font = font(400, 13);
  ctx.fillText("Your booking code", WIDTH / 2, y + 30);
  ctx.fillStyle = theme.foreground;
  ctx.font = font(600, 32);
  ctx.letterSpacing = "3px";
  ctx.fillText(model.code, WIDTH / 2, y + 70);
  ctx.letterSpacing = "0px";
  y += 92 + 28;

  const label = (text: string) => {
    ctx.textAlign = "left";
    ctx.fillStyle = theme.mutedForeground;
    ctx.font = font(500, 12);
    ctx.letterSpacing = "1.2px";
    ctx.fillText(text.toUpperCase(), PAD, y);
    ctx.letterSpacing = "0px";
    y += 12;
  };

  const facts = (rows: ImageFact[]) => {
    const rowHeight = 28;
    const height = rows.length * rowHeight + 16;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    roundRect(ctx, PAD + 0.5, y + 0.5, inner - 1, height - 1, 16);
    ctx.stroke();
    rows.forEach((row, index) => {
      const base = y + 8 + rowHeight * index + 19;
      ctx.font = font(400, 15);
      ctx.textAlign = "left";
      ctx.fillStyle = theme.mutedForeground;
      ctx.fillText(row.term, PAD + 16, base);
      const termWidth = ctx.measureText(row.term).width;
      ctx.textAlign = "right";
      ctx.fillStyle = theme.foreground;
      ctx.fillText(fit(ctx, row.value, inner - 32 - termWidth - 16), WIDTH - PAD - 16, base);
    });
    y += height + 24;
  };

  // Selected courts and slots.
  label("Selected courts and slots");
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  const runHeight = 58;
  roundRect(ctx, PAD + 0.5, y + 0.5, inner - 1, model.runs.length * runHeight - 1, 16);
  ctx.stroke();
  model.runs.forEach((run, index) => {
    const top = y + runHeight * index;
    if (index > 0) {
      ctx.beginPath();
      ctx.moveTo(PAD + 16, top + 0.5);
      ctx.lineTo(WIDTH - PAD - 16, top + 0.5);
      ctx.stroke();
    }
    ctx.font = font(500, 12);
    const chipWidth = ctx.measureText(run.chip).width + 20;
    ctx.fillStyle = theme.muted;
    roundRect(ctx, WIDTH - PAD - 16 - chipWidth, top + 17, chipWidth, 24, 12);
    ctx.fill();
    ctx.fillStyle = theme.foreground;
    ctx.textAlign = "center";
    ctx.fillText(run.chip, WIDTH - PAD - 16 - chipWidth / 2, top + 33);
    const textWidth = inner - 32 - chipWidth - 12;
    ctx.textAlign = "left";
    ctx.font = font(500, 15);
    ctx.fillText(fit(ctx, run.court, textWidth), PAD + 16, top + 25);
    ctx.fillStyle = theme.mutedForeground;
    ctx.font = font(400, 13);
    ctx.fillText(fit(ctx, run.when, textWidth), PAD + 16, top + 44);
  });
  y += model.runs.length * runHeight + 24;

  label("Customer");
  facts(model.customer);
  label("Payment");
  facts(model.payment);

  // Total paid and the Confirmed chip.
  ctx.strokeStyle = theme.border;
  roundRect(ctx, PAD + 0.5, y + 0.5, inner - 1, 71, 16);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = theme.mutedForeground;
  ctx.font = font(400, 13);
  ctx.fillText("Total paid", PAD + 16, y + 28);
  ctx.fillStyle = theme.foreground;
  ctx.font = font(600, 22);
  ctx.fillText(model.total, PAD + 16, y + 54);
  ctx.font = font(500, 14);
  const chip = "Confirmed";
  const chipWidth = ctx.measureText(chip).width + 44;
  const chipX = WIDTH - PAD - 16 - chipWidth;
  ctx.fillStyle = theme.available;
  roundRect(ctx, chipX, y + 21, chipWidth, 30, 15);
  ctx.fill();
  ctx.strokeStyle = theme.availableBorder;
  ctx.stroke();
  ctx.strokeStyle = theme.availableForeground;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(chipX + 13, y + 36);
  ctx.lineTo(chipX + 17, y + 40);
  ctx.lineTo(chipX + 25, y + 32);
  ctx.stroke();
  ctx.fillStyle = theme.availableForeground;
  ctx.fillText(chip, chipX + 31, y + 41);
  y += 72 + 24;

  // The footer.
  ctx.textAlign = "center";
  ctx.fillStyle = theme.mutedForeground;
  ctx.font = font(400, 12);
  for (const text of model.footer) {
    for (const line of wrap(ctx, text, inner)) {
      ctx.fillText(line, WIDTH / 2, y);
      y += 18;
    }
  }
  return y + PAD - 6;
}

/** Draws the receipt as a PNG. Waits for the page's font, so the image never falls back to a system face. */
export async function renderReceiptImage(model: ReceiptImageModel): Promise<File> {
  await document.fonts.ready;
  const theme = readTheme();
  // A dry run on a one pixel canvas measures the height; iOS caps a canvas's
  // area, so the real one is never bigger than the receipt.
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("no 2d canvas");
  const height = Math.ceil(draw(probe, model, theme));

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  ctx.scale(SCALE, SCALE);
  draw(ctx, model, theme);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("the receipt could not be encoded");
  return new File([blob], model.fileName, { type: "image/png" });
}

/**
 * Hands the image to the player. On a phone the share sheet, whose "Save
 * Image" puts it in Photos; anywhere else a download. Answers false when the
 * player dismissed the share sheet, which is not a failure.
 */
export async function saveReceiptImage(file: File): Promise<boolean> {
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      // Fall through to the download: some browsers refuse a share they offered.
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
