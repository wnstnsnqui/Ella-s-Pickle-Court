import { hoursChip, runHours, runLabel, sortRuns } from "@/components/landing/booking";
import { VENUE_ADDRESS, VENUE_NAME, VENUE_PHONE_DISPLAY } from "@/lib/venue";

import type { ReceiptFact, ReceiptView } from "./receipt-view";

/** Everything the saved image prints, worked out before a pixel is drawn. */
export type ReceiptImageModel = {
  venue: string;
  status: ReceiptView["status"];
  /** The badge's word, on the chip beside the total. */
  word: string;
  title: string;
  /** Under the title: the lookup's status, reason and refund lines. The checkout's line is in the footer. */
  notes: string[];
  code: string;
  runs: { court: string; when: string; chip: string }[];
  customer: ReceiptFact[];
  payment: ReceiptFact[];
  totalLabel: string;
  total: string;
  footer: string[];
  fileName: string;
};

/**
 * The receipt as the saved image reads it (spec 0015, AC-14; spec 0017,
 * AC-15): the same `ReceiptView` the screen and the print read, in the same
 * order, and nothing the screen does not show.
 */
export function receiptImageModel(view: ReceiptView): ReceiptImageModel {
  const runs = sortRuns(
    view.runs,
    view.courts.map((court) => court.id),
  ).map((run) => ({
    court: view.courts.find((court) => court.id === run.courtId)?.name ?? `Court ${run.courtId}`,
    when: `${view.heading} · ${runLabel(run)}`,
    chip: hoursChip(runHours([run])),
  }));
  const venue = `${VENUE_ADDRESS} · ${VENUE_PHONE_DISPLAY}`;
  return {
    venue: VENUE_NAME,
    status: view.status,
    word: view.word,
    title: view.title,
    notes: view.source === "lookup" ? view.lines : [],
    code: view.code,
    runs,
    customer: view.customer,
    payment: view.payment,
    totalLabel: view.totalLabel,
    total: view.total,
    footer: view.source === "checkout" ? [...view.lines, venue] : [venue],
    fileName: `booking-${view.code}.png`,
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
    unavailable: token("--state-unavailable"),
    unavailableForeground: token("--state-unavailable-fg"),
    unavailableBorder: token("--state-unavailable-border"),
  };
}

type Theme = ReturnType<typeof readTheme>;

/** The badge's colours: teal with a check while the booking stands, quiet grey with an X once it does not. */
function badgeColors(theme: Theme, status: ReceiptView["status"]) {
  return status === "confirmed"
    ? { fill: theme.available, ink: theme.availableForeground, edge: theme.availableBorder }
    : { fill: theme.unavailable, ink: theme.unavailableForeground, edge: theme.unavailableBorder };
}

/** A check, or an X, centred on (x, y) and `size` across. */
function mark(
  ctx: CanvasRenderingContext2D,
  status: ReceiptView["status"],
  x: number,
  y: number,
  size: number,
) {
  const h = size / 2;
  ctx.beginPath();
  if (status === "confirmed") {
    ctx.moveTo(x - h, y);
    ctx.lineTo(x - h * 0.3, y + h * 0.7);
    ctx.lineTo(x + h, y - h * 0.7);
  } else {
    ctx.moveTo(x - h * 0.75, y - h * 0.75);
    ctx.lineTo(x + h * 0.75, y + h * 0.75);
    ctx.moveTo(x + h * 0.75, y - h * 0.75);
    ctx.lineTo(x - h * 0.75, y + h * 0.75);
  }
  ctx.stroke();
}

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

  // The status badge, the title, and the lookup's lines under it.
  const badge = badgeColors(theme, model.status);
  let y = 84;
  ctx.fillStyle = badge.fill;
  ctx.beginPath();
  ctx.arc(WIDTH / 2, y + 24, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = badge.ink;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  mark(ctx, model.status, WIDTH / 2, y + 24, 21);
  y += 84;
  ctx.fillStyle = theme.foreground;
  ctx.font = font(600, 24);
  ctx.fillText(model.title, WIDTH / 2, y);
  if (model.notes.length > 0) {
    y += 8;
    ctx.fillStyle = theme.mutedForeground;
    ctx.font = font(400, 14);
    for (const note of model.notes) {
      for (const line of wrap(ctx, note, inner)) {
        y += 21;
        ctx.fillText(line, WIDTH / 2, y);
      }
    }
  }

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

  const facts = (rows: ReceiptFact[]) => {
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

  // The total, and the badge's word on a chip beside it.
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  roundRect(ctx, PAD + 0.5, y + 0.5, inner - 1, 71, 16);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = theme.mutedForeground;
  ctx.font = font(400, 13);
  ctx.fillText(model.totalLabel, PAD + 16, y + 28);
  ctx.fillStyle = theme.foreground;
  ctx.font = font(600, 22);
  ctx.fillText(model.total, PAD + 16, y + 54);
  ctx.font = font(500, 14);
  const chipWidth = ctx.measureText(model.word).width + 44;
  const chipX = WIDTH - PAD - 16 - chipWidth;
  ctx.fillStyle = badge.fill;
  roundRect(ctx, chipX, y + 21, chipWidth, 30, 15);
  ctx.fill();
  ctx.strokeStyle = badge.edge;
  ctx.stroke();
  ctx.strokeStyle = badge.ink;
  ctx.lineWidth = 2;
  mark(ctx, model.status, chipX + 19, y + 36, 10);
  ctx.fillStyle = badge.ink;
  ctx.fillText(model.word, chipX + 31, y + 41);
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
