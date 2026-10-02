// The picture Refine sends (ADR 0016): the strokes alone, dark on white like a pencil
// sketch, in the square box the model's viewBox maps to. Never the camera image.

import type { RefineBox, Stroke } from '@afterglow/core';

export const REFINE_IMAGE_SIZE = 1024;

export async function refineImage(strokes: readonly Stroke[], box: RefineBox): Promise<Blob> {
  const canvas = new OffscreenCanvas(REFINE_IMAGE_SIZE, REFINE_IMAGE_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas for the refine image');
  const scale = REFINE_IMAGE_SIZE / box.size;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, REFINE_IMAGE_SIZE, REFINE_IMAGE_SIZE);
  ctx.strokeStyle = '#141414';
  ctx.fillStyle = '#141414';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    const width = Math.max(3, s.size * 0.8 * scale);
    const pts = s.points.map((p) => ({ x: (p.x - box.x) * scale, y: (p.y - box.y) * scale }));
    const first = pts[0];
    if (!first) continue;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(first.x, first.y, width / 2, 0, 2 * Math.PI);
      ctx.fill();
      continue;
    }
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  return canvas.convertToBlob({ type: 'image/png' });
}
