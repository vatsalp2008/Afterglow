// Spark particles for the sparks brush, drawn as short additive streaks that
// fall under gravity, like steel-wool light painting. Fixed-size ring buffer.

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import type { Vec2 } from '../core/types';

const MAX = 4000;
const GRAVITY = 900; // canvas units / s²
const DRAG = 1.6; // 1/s
const STREAK = 0.03; // seconds of motion shown per streak

const HOT = new Color('#FFE3B0');

export class Sparks {
  readonly object: LineSegments;
  private pos = new Float32Array(MAX * 2);
  private vel = new Float32Array(MAX * 2);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private rgb = new Float32Array(MAX * 3);
  private positions: Float32BufferAttribute;
  private colors: Float32BufferAttribute;
  private next = 0;
  private alive = 0;

  constructor() {
    const geo = new BufferGeometry();
    this.positions = new Float32BufferAttribute(new Float32Array(MAX * 6), 3);
    this.colors = new Float32BufferAttribute(new Float32Array(MAX * 6), 3);
    this.positions.setUsage(DynamicDrawUsage);
    this.colors.setUsage(DynamicDrawUsage);
    geo.setAttribute('position', this.positions);
    geo.setAttribute('color', this.colors);
    this.object = new LineSegments(
      geo,
      new LineBasicMaterial({ vertexColors: true, blending: AdditiveBlending, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.object.frustumCulled = false;
  }

  emitAlong(from: Vec2, to: Vec2, hex: string, count: number): void {
    const base = new Color(hex);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const s = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 420;
      this.pos[i * 2] = from.x + (to.x - from.x) * s;
      this.pos[i * 2 + 1] = from.y + (to.y - from.y) * s;
      this.vel[i * 2] = Math.cos(angle) * speed;
      this.vel[i * 2 + 1] = Math.sin(angle) * speed - 120;
      const life = 0.35 + Math.random() * 0.7;
      this.life[i] = life;
      this.maxLife[i] = life;
      const c = base.clone().lerp(HOT, Math.random() * 0.6);
      this.rgb[i * 3] = c.r;
      this.rgb[i * 3 + 1] = c.g;
      this.rgb[i * 3 + 2] = c.b;
    }
    this.alive = MAX;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    const pa = this.positions.array as Float32Array;
    const ca = this.colors.array as Float32Array;
    const drag = Math.exp(-DRAG * dt);
    let any = 0;
    for (let i = 0; i < MAX; i++) {
      const o = i * 6;
      if (this.life[i]! <= 0) {
        ca.fill(0, o, o + 6);
        continue;
      }
      any++;
      this.life[i]! -= dt;
      const vx = (this.vel[i * 2]! *= drag);
      const vy = (this.vel[i * 2 + 1] = this.vel[i * 2 + 1]! * drag + GRAVITY * dt);
      const x = (this.pos[i * 2]! += vx * dt);
      const y = (this.pos[i * 2 + 1]! += vy * dt);
      pa[o] = x;
      pa[o + 1] = y;
      pa[o + 3] = x - vx * STREAK;
      pa[o + 4] = y - vy * STREAK;
      const k = Math.max(0, this.life[i]! / this.maxLife[i]!) ** 1.5 * 3;
      const r = this.rgb[i * 3]!;
      const g = this.rgb[i * 3 + 1]!;
      const b = this.rgb[i * 3 + 2]!;
      ca[o] = r * k + 0.4 * k;
      ca[o + 1] = g * k + 0.35 * k;
      ca[o + 2] = b * k + 0.3 * k;
      ca[o + 3] = r * k * 0.15;
      ca[o + 4] = g * k * 0.15;
      ca[o + 5] = b * k * 0.15;
    }
    this.alive = any;
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.alive = MAX;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as LineBasicMaterial).dispose();
  }
}
