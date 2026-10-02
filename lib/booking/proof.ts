import { PROOF_ACCEPTED_TYPES, PROOF_MAX_CHOSEN_BYTES, PROOF_MAX_EDGE } from "./constants";

/**
 * The payment screenshot, in the browser. Spec 0015, AC-8 and AC-9.
 *
 * A phone screenshot is often several megabytes of mostly flat colour. The
 * browser shrinks it to at most 1600 pixels on the long edge and encodes it as
 * WebP (JPEG where the browser cannot encode WebP) before it leaves the device,
 * then uploads it straight to the private bucket with a plain `fetch` PUT to
 * the signed URL the hold returned. Not `browserSupabase()`: the browser client
 * only listens.
 */

/** Why a chosen file is refused on the field, before any upload, or null when it is fine. */
export function proofFileProblem(file: Pick<File, "type" | "size">): string | null {
  if (!(PROOF_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return "Choose a PNG, JPEG or WebP image of your transfer.";
  }
  if (file.size > PROOF_MAX_CHOSEN_BYTES) {
    return "That image is over 10 MB. Choose a smaller screenshot.";
  }
  return null;
}

/** The size to draw an image at so its long edge is at most `max`, never enlarging it. */
export function fitWithin(
  width: number,
  height: number,
  max: number = PROOF_MAX_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

const QUALITY = 0.85;

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * Shrink and re-encode a chosen screenshot. The canvas is filled white first,
 * so a transparent PNG does not turn black as a JPEG.
 */
export async function shrinkProof(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas to shrink the screenshot on");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);

    // A browser that cannot encode WebP quietly hands back a PNG instead.
    const webp = await toBlob(canvas, "image/webp");
    if (webp?.type === "image/webp") return webp;
    const jpeg = await toBlob(canvas, "image/jpeg");
    if (jpeg?.type === "image/jpeg") return jpeg;
    throw new Error("The browser could not encode the screenshot");
  } finally {
    bitmap.close();
  }
}

/**
 * Upload the shrunk screenshot to the booking's one proof path, overwriting
 * whatever was there (Replace and Retry go to the same path). Throws on any
 * refusal, so the step can offer Retry.
 */
export async function uploadProof(signedUrl: string, proof: Blob): Promise<void> {
  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": proof.type, "x-upsert": "true" },
    body: proof,
  });
  if (!response.ok) throw new Error(`The proof upload answered ${response.status}`);
}
