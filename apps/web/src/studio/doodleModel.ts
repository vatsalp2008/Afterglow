// The doodle model in the browser (ADR 0015): onnxruntime-web's WebAssembly runtime,
// loaded the first time a group of strokes settles, running the int8 model trained in
// ml/ on images from the same rasterizer (core/src/doodle/raster.ts). One thread, so it
// needs no cross-origin isolation.

import { doodleImage, DOODLE_SIZE, type Vec2 } from '@afterglow/core';
import type { InferenceSession } from 'onnxruntime-web';

const BASE = import.meta.env.BASE_URL;

/** models/doodle.json, written with the model by `afterglow-ml export --ship`. */
interface ModelMeta {
  version: number;
  input: { name: string; size: number };
  output: string;
  classes: string[];
}

export interface DoodleGuess {
  label: string;
  /** The model's softmax probability for it. */
  probability: number;
  /** Time to rasterize and run the model, ms. */
  ms: number;
}

interface Loaded {
  session: InferenceSession;
  meta: ModelMeta;
  Tensor: typeof import('onnxruntime-web').Tensor;
}

async function load(): Promise<Loaded> {
  const [ort, mjs, wasm] = await Promise.all([
    import('onnxruntime-web/wasm'),
    // The runtime's own files, by URL: Vite serves them in development and fingerprints them in builds.
    import('onnxruntime-web/ort-wasm-simd-threaded.mjs?url'),
    import('onnxruntime-web/ort-wasm-simd-threaded.wasm?url'),
  ]);
  ort.env.wasm.wasmPaths = { mjs: mjs.default, wasm: wasm.default };
  ort.env.wasm.numThreads = 1;
  const res = await fetch(`${BASE}models/doodle.json`);
  if (!res.ok) throw new Error(`doodle model metadata: HTTP ${String(res.status)}`);
  const meta = (await res.json()) as ModelMeta;
  if (meta.version !== 1 || meta.input.size !== DOODLE_SIZE) throw new Error('doodle model metadata is unexpected');
  const session = await ort.InferenceSession.create(`${BASE}models/doodle.onnx`, { executionProviders: ['wasm'] });
  return { session, meta, Tensor: ort.Tensor };
}

export class DoodleModel {
  private loading: Promise<Loaded> | null = null;

  /** The most likely class for a drawing, loading the model the first time. */
  async guess(strokes: ReadonlyArray<readonly Vec2[]>): Promise<DoodleGuess> {
    this.loading ??= load();
    const { session, meta, Tensor } = await this.loading;
    const t0 = performance.now();
    const image = doodleImage(strokes);
    const input = new Tensor('float32', image, [1, 1, DOODLE_SIZE, DOODLE_SIZE]);
    const out = await session.run({ [meta.input.name]: input });
    const logits = out[meta.output]?.data as Float32Array | undefined;
    if (!logits) throw new Error('doodle model returned no logits');
    let best = 0;
    for (let i = 1; i < logits.length; i++) if (logits[i]! > logits[best]!) best = i;
    let sum = 0;
    for (const v of logits) sum += Math.exp(v - logits[best]!);
    return { label: meta.classes[best] ?? '', probability: 1 / sum, ms: performance.now() - t0 };
  }
}
