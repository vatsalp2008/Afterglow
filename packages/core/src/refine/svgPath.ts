// SVG path data to polylines, for Refine (ADR 0016): the model answers with path data,
// and each subpath becomes a stroke. The whole grammar is read (M L H V C S Q T A Z,
// absolute and relative, implicit repeats, packed numbers and arc flags), and curves are
// sampled densely, so the renderer's Catmull-Rom smoothing can't bend straight lines.

import type { Vec2 } from '../types.ts';

const MAX_LENGTH = 8000;
const MAX_POINTS = 20_000;

type Token = { kind: 'command'; value: string } | { kind: 'number'; value: number; raw: string };

const COMMANDS = 'MmLlHhVvCcSsQqTtAaZz';
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

function tokenize(d: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < d.length) {
    const c = d[i]!;
    if (c === ' ' || c === ',' || c === '\n' || c === '\t' || c === '\r') {
      i++;
    } else if (COMMANDS.includes(c)) {
      tokens.push({ kind: 'command', value: c });
      i++;
    } else {
      const m = NUMBER.exec(d.slice(i));
      if (!m) return null;
      tokens.push({ kind: 'number', value: Number(m[0]), raw: m[0] });
      i += m[0].length;
    }
  }
  return tokens;
}

/**
 * An arc's two flags are single characters, and may be packed against each other and the
 * next number ("a5 5 0 1110 10" is flags 1 and 1, then 10): at a flag's place, one
 * character is the flag and the rest is the next token.
 */
function splitFlags(tokens: Token[]): Token[] {
  const out: Token[] = [];
  let command = '';
  let argIndex = 0;
  const queue = [...tokens];
  while (queue.length > 0) {
    const t = queue.shift()!;
    if (t.kind === 'command') {
      command = t.value.toLowerCase();
      argIndex = 0;
      out.push(t);
      continue;
    }
    const slot = argIndex % 7;
    if (command === 'a' && (slot === 3 || slot === 4) && t.raw.length > 1) {
      const flag = t.raw[0]!;
      const rest = t.raw.slice(1);
      out.push({ kind: 'number', value: Number(flag), raw: flag });
      argIndex++;
      const m = NUMBER.exec(rest);
      if (m?.[0] !== rest) return [{ kind: 'command', value: 'invalid' }];
      queue.unshift({ kind: 'number', value: Number(rest), raw: rest });
      continue;
    }
    out.push(t);
    argIndex++;
  }
  return out;
}

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

class TooManyPoints extends Error {}

/** How many points a piece of path needs: checked before any are made, so huge input can't exhaust memory. */
function stepCount(length: number, spacing: number, min: number): number {
  const steps = Math.max(min, Math.ceil(length / spacing));
  if (!Number.isFinite(steps) || steps > MAX_POINTS) throw new TooManyPoints();
  return steps;
}

const lerp = (a: Vec2, b: Vec2, u: number): Vec2 => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
const dist = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);

function cubicAt(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Points along an SVG arc, per the spec's endpoint-to-center conversion (SVG 1.1, F.6.5). */
function arcPoints(
  from: Vec2,
  rxIn: number,
  ryIn: number,
  rotation: number,
  large: boolean,
  sweep: boolean,
  to: Vec2,
  spacing: number,
): Vec2[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (from.x === to.x && from.y === to.y)) return [to];
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = stepCount(Math.abs(delta) * Math.max(rx, ry), spacing, 2);
  const out: Vec2[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = theta1 + (delta * s) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push({ x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy });
  }
  out[out.length - 1] = to;
  return out;
}

/** Points every `spacing` along a straight segment, ending at `to`. */
function linePoints(from: Vec2, to: Vec2, spacing: number): Vec2[] {
  const steps = stepCount(dist(from, to), spacing, 1);
  return Array.from({ length: steps }, (_, s) => (s === steps - 1 ? to : lerp(from, to, (s + 1) / steps)));
}

function cubicPoints(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, spacing: number): Vec2[] {
  // The control polygon's length bounds the curve's.
  const steps = stepCount(dist(p0, p1) + dist(p1, p2) + dist(p2, p3), spacing, 2);
  return Array.from({ length: steps }, (_, s) => (s === steps - 1 ? p3 : cubicAt(p0, p1, p2, p3, (s + 1) / steps)));
}

/**
 * The polylines an SVG path draws, one per subpath, sampled every `spacing` units or
 * closer; closed subpaths end where they began. Null if the data isn't valid path data
 * (or is unreasonably large).
 */
export function svgPathToPolylines(d: string, spacing = 2.5): Vec2[][] | null {
  try {
    return parse(d, spacing);
  } catch (err) {
    if (err instanceof TooManyPoints) return null;
    throw err;
  }
}

function parse(d: string, spacing: number): Vec2[][] | null {
  if (d.length > MAX_LENGTH || !(spacing > 0)) return null;
  const raw = tokenize(d);
  if (!raw) return null;
  const tokens = splitFlags(raw);
  const paths: Vec2[][] = [];
  let current: Vec2[] | null = null;
  let point: Vec2 = { x: 0, y: 0 };
  let start: Vec2 = { x: 0, y: 0 };
  let lastControl: Vec2 | null = null;
  let lastKind = '';
  let total = 0;
  let i = 0;
  let command = '';

  const take = (n: number): number[] | null => {
    const values: number[] = [];
    for (let k = 0; k < n; k++) {
      const t = tokens[i + k];
      if (t?.kind !== 'number' || !Number.isFinite(t.value)) return null;
      values.push(t.value);
    }
    i += n;
    return values;
  };
  const extend = (points: Vec2[]): boolean => {
    current ??= [point];
    current.push(...points);
    total += points.length;
    return total <= MAX_POINTS;
  };

  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.kind === 'command') {
      command = t.value;
      i++;
      if (command === 'z' || command === 'Z') {
        if (current) {
          if (!extend(linePoints(point, start, spacing))) return null;
          paths.push(current);
          current = null;
        }
        point = start;
        lastControl = null;
        lastKind = 'z';
        continue;
      }
    } else if (!command || command === 'z' || command === 'Z') {
      return null;
    }
    const lower = command.toLowerCase();
    const relative = command === lower;
    const count = ARGS[lower];
    if (count === undefined) return null;
    const args = take(count);
    if (!args) return null;
    const abs = (x: number, y: number): Vec2 => (relative ? { x: point.x + x, y: point.y + y } : { x, y });

    if (lower === 'm') {
      if (current && current.length > 1) paths.push(current);
      point = abs(args[0]!, args[1]!);
      start = point;
      current = [point];
      // Pairs after a moveto are linetos.
      command = relative ? 'l' : 'L';
      lastControl = null;
    } else if (lower === 'l' || lower === 'h' || lower === 'v') {
      const to =
        lower === 'l'
          ? abs(args[0]!, args[1]!)
          : lower === 'h'
            ? { x: relative ? point.x + args[0]! : args[0]!, y: point.y }
            : { x: point.x, y: relative ? point.y + args[0]! : args[0]! };
      if (!extend(linePoints(point, to, spacing))) return null;
      point = to;
      lastControl = null;
    } else if (lower === 'c' || lower === 's') {
      const reflected: Vec2 =
        lastControl && (lastKind === 'c' || lastKind === 's')
          ? { x: 2 * point.x - lastControl.x, y: 2 * point.y - lastControl.y }
          : point;
      const [c1, c2, to] =
        lower === 'c'
          ? [abs(args[0]!, args[1]!), abs(args[2]!, args[3]!), abs(args[4]!, args[5]!)]
          : [reflected, abs(args[0]!, args[1]!), abs(args[2]!, args[3]!)];
      if (!extend(cubicPoints(point, c1, c2, to, spacing))) return null;
      point = to;
      lastControl = c2;
    } else if (lower === 'q' || lower === 't') {
      const reflected: Vec2 =
        lastControl && (lastKind === 'q' || lastKind === 't')
          ? { x: 2 * point.x - lastControl.x, y: 2 * point.y - lastControl.y }
          : point;
      const [c, to] =
        lower === 'q' ? [abs(args[0]!, args[1]!), abs(args[2]!, args[3]!)] : [reflected, abs(args[0]!, args[1]!)];
      // A quadratic as a cubic: control points two thirds of the way to the quadratic's.
      const c1 = lerp(point, c, 2 / 3);
      const c2 = lerp(to, c, 2 / 3);
      if (!extend(cubicPoints(point, c1, c2, to, spacing))) return null;
      point = to;
      lastControl = c;
    } else {
      const flags = [args[3]!, args[4]!];
      if (flags.some((f) => f !== 0 && f !== 1)) return null;
      const to = abs(args[5]!, args[6]!);
      if (!extend(arcPoints(point, args[0]!, args[1]!, args[2]!, flags[0] === 1, flags[1] === 1, to, spacing))) {
        return null;
      }
      point = to;
      lastControl = null;
    }
    lastKind = lower;
  }
  if (current && current.length > 1) paths.push(current);
  return paths.length > 0 ? paths : null;
}
