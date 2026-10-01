// The drawing as an SVG, in the glowing look (ADR 0012). The shapes are exactly the
// ones on screen (outline.ts); the light is approximated:
// - light brushes are drawn crisp and three times blurred, blended with `screen`, which
//   stands in for additive light and bloom (screen, like adding light, ignores order);
// - neon is a colored body with a warm-white core, the ribbon a body with bright rims;
// - depth brightness is averaged per stroke, since an SVG fill can't vary along a path;
// - spark particles are left out; their core line is kept.
// Like the PNG, it's a long exposure: no fade, and no camera image.

import { type Rect, type Stroke, type StrokePoint, type Vec2 } from '@afterglow/core';
import { clampDepth, nibDab, nibSections, stripSections, type Section } from './outline';

const NIGHT = '#141A33';
/** The shader's warm white core, (1, 0.95, 0.88) in linear light. */
const CORE_WHITE = '#FFF9F1';
const NEON_CORE = 0.25;
// Bloom, as three blurs: a wide halo, a mid glow, and a tight one. Blurring spreads a
// thin line's light thin, so each blur is strengthened (`gain` scales its alpha), as the
// bloom's strength does.
const GLOW = [
  { id: 'glow-far', blur: 64, gain: 6, opacity: 0.45 },
  { id: 'glow-mid', blur: 12, gain: 2, opacity: 0.6 },
  { id: 'glow-near', blur: 3, gain: 1.5, opacity: 0.5 },
];

const num = (n: number) => String(Math.round(n * 10) / 10);
const pt = (p: Vec2) => `${num(p.x)} ${num(p.y)}`;
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const hexColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : '#FFFFFF');

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** Scales a color in linear light, as the shaders do, and returns it as hex. */
function scaleColor(hex: string, k: number): string {
  const channels = [1, 3, 5].map((i) => {
    const v = toSrgb(Math.min(1, toLinear(parseInt(hex.slice(i, i + 2), 16) / 255) * k));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('')}`.toUpperCase();
}

/** Mixes a color toward white in linear light. */
function towardWhite(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((i) => {
    const lin = toLinear(parseInt(hex.slice(i, i + 2), 16) / 255);
    return Math.round(toSrgb(lin + (1 - lin) * amount) * 255)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('')}`.toUpperCase();
}

/** The renderer's depth brightness, averaged over the stroke. */
function brightness(points: readonly StrokePoint[]): number {
  if (points.length === 0) return 1;
  return points.reduce((sum, p) => sum + 0.55 + 0.45 * clampDepth(p.depth), 0) / points.length;
}

const left = (s: Section): Vec2 => ({ x: s.point.x + s.nx * s.half, y: s.point.y + s.ny * s.half });
const right = (s: Section): Vec2 => ({ x: s.point.x - s.nx * s.half, y: s.point.y - s.ny * s.half });

/** A strip with round caps, as one closed path. */
function stripPath(sections: readonly Section[]): string {
  const first = sections[0];
  const last = sections[sections.length - 1];
  if (!first || !last) return '';
  if (sections.length === 1) {
    const { x, y } = first.point;
    const r = num(first.half);
    return `M${num(x - first.half)} ${num(y)}A${r} ${r} 0 1 0 ${num(x + first.half)} ${num(y)}A${r} ${r} 0 1 0 ${num(x - first.half)} ${num(y)}Z`;
  }
  const lefts = sections.map((s) => pt(left(s)));
  const rights = sections.map((s) => pt(right(s))).reverse();
  const capEnd = `A${num(last.half)} ${num(last.half)} 0 0 0 `;
  const capStart = `A${num(first.half)} ${num(first.half)} 0 0 0 `;
  return `M${lefts.join('L')}${capEnd}${rights.join('L')}${capStart}${lefts[0]!}Z`;
}

function ribbonPath(stroke: Stroke, sections: readonly Section[]): string {
  const first = sections[0];
  if (!first) return '';
  if (sections.length === 1) return `M${nibDab(stroke, first.point).map(pt).join('L')}Z`;
  return `M${[...sections.map((s) => pt(left(s))), ...sections.map((s) => pt(right(s))).reverse()].join('L')}Z`;
}

const blend = 'style="mix-blend-mode:screen"';

/**
 * A light stroke in two parts: its colored body, which also makes the glow, and its
 * highlight (neon's white core, the ribbon's rims), drawn once on top. Blurring the
 * highlights too would wash every glow out to white.
 */
function lightStroke(s: Stroke): { body: string; highlight: string } {
  const color = hexColor(s.color);
  const id = `data-stroke="${attr(s.id)}" data-brush="${s.brush}"`;
  const b = brightness(s.points);
  const opacity = (k: number) => String(Math.round(Math.min(1, b * k) * 100) / 100);
  if (s.brush === 'ribbon') {
    const sections = nibSections(s);
    const rim = Math.min(6, Math.max(0.5, (sections.reduce((sum, x) => sum + x.half, 0) / sections.length) * 0.35));
    const edges =
      sections.length > 1
        ? [sections.map(left), sections.map(right)].map((side) => `M${side.map(pt).join('L')}`).join('')
        : '';
    return {
      body: `<path ${id} d="${ribbonPath(s, sections)}" fill="${color}" fill-opacity="${opacity(0.75)}" ${blend}/>`,
      highlight: edges
        ? `<path d="${edges}" fill="none" stroke="${towardWhite(color, 0.35)}" stroke-width="${num(rim)}" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="${opacity(0.8)}" ${blend}/>`
        : '',
    };
  }
  // Neon and the sparks core, which is thinner and hotter (brushes.ts).
  const [scale, intensity] = s.brush === 'sparks' ? [0.35, 1.4] : [1, 1];
  const body = stripPath(stripSections(s, scale * 0.9));
  const core = stripPath(stripSections(s, scale * NEON_CORE));
  return {
    body: `<path ${id} d="${body}" fill="${color}" fill-opacity="${opacity(0.9 * intensity)}" ${blend}/>`,
    highlight: `<path d="${core}" fill="${CORE_WHITE}" fill-opacity="${opacity(0.7 * intensity)}" ${blend}/>`,
  };
}

function inkStroke(s: Stroke): string {
  const id = `data-stroke="${attr(s.id)}" data-brush="ink"`;
  return `<path ${id} d="${stripPath(stripSections(s, 1))}" fill="${scaleColor(hexColor(s.color), 0.7)}"/>`;
}

/**
 * Renders strokes as a standalone SVG document, cropped to `view` (canvas units, the
 * part of the canvas on screen).
 */
export function strokesToSvg(strokes: readonly Stroke[], view: Rect): string {
  const x = num(view.left);
  const y = num(view.top);
  const w = view.right - view.left;
  const h = view.bottom - view.top;
  const box = `x="${x}" y="${y}" width="${num(w)}" height="${num(h)}"`;
  const cx = num(view.left + w / 2);
  const cy = num(view.top + h / 2);
  const shown = strokes.filter((s) => s.points.length > 0);
  const light = shown.filter((s) => s.brush !== 'ink').map(lightStroke);
  const ink = shown.filter((s) => s.brush === 'ink').map(inkStroke);

  // The composite's vignette: night at the center, 0.4 of it (in linear light) at
  // 1.1 frame heights out, easing from 0.3.
  const stops = [
    [0, 1],
    [0.3 / 1.1, 1],
    [0.7 / 1.1, 0.7],
    [1, 0.4],
  ]
    .map(([o, k]) => `<stop offset="${o!.toFixed(3)}" stop-color="${scaleColor(NIGHT, k!)}"/>`)
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${x} ${y} ${num(w)} ${num(h)}" width="${num(w)}" height="${num(h)}">`,
    '<title>Afterglow drawing</title>',
    '<defs>',
    `<radialGradient id="night" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${num(h * 1.1)}">${stops}</radialGradient>`,
    ...GLOW.map(
      (g) =>
        `<filter id="${g.id}" filterUnits="userSpaceOnUse" ${box}><feGaussianBlur stdDeviation="${String(g.blur)}"/>` +
        `<feComponentTransfer><feFuncA type="linear" slope="${String(g.gain)}"/></feComponentTransfer></filter>`,
    ),
    `<g id="light">${light.map((l) => l.body).join('')}</g>`,
    '</defs>',
    `<rect ${box} fill="url(#night)"/>`,
    ...(light.length
      ? [
          ...GLOW.map(
            (g) =>
              `<use href="#light" xlink:href="#light" filter="url(#${g.id})" opacity="${String(g.opacity)}" ${blend}/>`,
          ),
          `<use href="#light" xlink:href="#light" ${blend}/>`,
          `<g id="highlights">${light.map((l) => l.highlight).join('')}</g>`,
        ]
      : []),
    ...(ink.length ? [`<g id="ink">${ink.join('')}</g>`] : []),
    '</svg>',
  ].join('\n');
}
