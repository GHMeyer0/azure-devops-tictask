/** Saves text as a file; falls back to the clipboard when the iframe sandbox blocks downloads. */
export async function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8"): Promise<"downloaded" | "copied"> {
  try {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  } catch {
    await navigator.clipboard.writeText(content.replace(/^﻿/, ""));
    return "copied";
  }
}
