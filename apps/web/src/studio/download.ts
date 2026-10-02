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

/** A name made safe for a file name: "smiley face" becomes "smiley-face". */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** afterglow[-kind][-name]-<stamp>.<ext>, e.g. afterglow-cat-2026-10-01-20-45-00.png. */
export function fileName(ext: string, name: string | null = null, kind: string | null = null): string {
  const parts = ['afterglow', kind, name ? slug(name) : null, stamp()].filter((p): p is string => !!p);
  return `${parts.join('-')}.${ext}`;
}
