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
export function stamp(date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    two(date.getMonth() + 1),
    two(date.getDate()),
    two(date.getHours()),
    two(date.getMinutes()),
    two(date.getSeconds()),
  ].join('-');
}
