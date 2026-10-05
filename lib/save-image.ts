/**
 * Hands an image to the player. On a phone the share sheet, whose "Save
 * Image" puts it in Photos; anywhere else a download. Answers false when the
 * player dismissed the share sheet, which is not a failure.
 */
export async function saveImage(file: File): Promise<boolean> {
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
