export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(value: unknown, name: string): void {
  download(new Blob([JSON.stringify(value)], { type: 'application/json' }), name);
}

/** A filesystem-safe local timestamp, e.g. 2026-09-28-14-03-12. */
export function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}
