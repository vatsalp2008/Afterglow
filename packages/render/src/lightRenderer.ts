// Three.js renderer. Layer order:
//   light scene (neon strokes + sparks) -> bloom      [offscreen]
//   composite(video or night bg + bloomed light, highlight compression) -> ink strokes -> sRGB  [screen]
// Bloom only ever sees light, so the room behind the user never glows.

import {
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  SRGBColorSpace,
  Scene,
  Vector2,
  VideoTexture,
  WebGLRenderer,
  type ShaderMaterial,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { coverScale, visibleCanvasRect, type FrameSize, type Stroke, type Vec2, type Viewport } from '@afterglow/core';
import { CompositeShader } from './composite';
import { createFadeUniforms, createInkMaterial, createNeonMaterial } from './materials';
import { buildRibbon } from './ribbon';
import { Sparks } from './sparks';

export class LightRenderer {
  readonly gl: WebGLRenderer;
  readonly sparks = new Sparks();
  private camera = new OrthographicCamera(0, 1, 0, 1, -10, 10);
  private lightScene = new Scene();
  private inkScene = new Scene();
  private fade = createFadeUniforms();
  private neon = createNeonMaterial(this.fade, 1);
  private sparkCore = createNeonMaterial(this.fade, 1.4);
  private ink = createInkMaterial(this.fade);
  private bloomComposer: EffectComposer;
  private finalComposer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private composite: ShaderPass;
  private meshes = new Map<string, Mesh>();
  private live: Mesh[] = [];
  private video: VideoTexture | null = null;
  private grainAnimated = true;
  private frame: FrameSize = { width: 1, height: 1 };
  private viewport: Viewport = { width: 1, height: 1 };

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    // Highlights are compressed in the composite shader instead, so dark UI colors stay exact.
    this.gl.toneMapping = NoToneMapping;
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.setClearColor(0x000000, 1);
    this.lightScene.add(this.sparks.object);

    this.bloomComposer = new EffectComposer(this.gl);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(this.lightScene, this.camera));
    this.bloomPass = new UnrealBloomPass(new Vector2(256, 256), 0.95, 0.4, 0);
    this.bloomComposer.addPass(this.bloomPass);

    this.finalComposer = new EffectComposer(this.gl);
    this.composite = new ShaderPass(CompositeShader);
    // Neither RenderPass nor UnrealBloomPass swap buffers, so the result stays in renderTarget2.
    this.composite.uniforms['tLight']!.value = this.bloomComposer.renderTarget2.texture;
    this.finalComposer.addPass(this.composite);
    const inkPass = new RenderPass(this.inkScene, this.camera);
    inkPass.clear = false;
    this.finalComposer.addPass(inkPass);
    this.finalComposer.addPass(new OutputPass());
  }

  setSize(viewport: Viewport, pixelRatio: number): void {
    this.viewport = viewport;
    this.gl.setPixelRatio(pixelRatio);
    this.gl.setSize(viewport.width, viewport.height, false);
    for (const c of [this.bloomComposer, this.finalComposer]) {
      c.setPixelRatio(pixelRatio);
      c.setSize(viewport.width, viewport.height);
    }
    (this.composite.uniforms['uResolution']!.value as Vector2).set(
      viewport.width * pixelRatio,
      viewport.height * pixelRatio,
    );
    this.updateCamera();
  }

  setFrame(frame: FrameSize): void {
    this.frame = frame;
    this.updateCamera();
  }

  setVideo(video: HTMLVideoElement | null): void {
    this.video?.dispose();
    this.video = null;
    if (video) {
      this.video = new VideoTexture(video);
      this.video.colorSpace = SRGBColorSpace;
    }
    this.composite.uniforms['tVideo']!.value = this.video;
    this.composite.uniforms['uHasVideo']!.value = video ? 1 : 0;
  }

  setVideoOpacity(opacity: number): void {
    this.composite.uniforms['uVideoOpacity']!.value = opacity;
  }

  setDarkroom(amount: number): void {
    this.composite.uniforms['uDarkroom']!.value = amount;
  }

  /** Film grain strength; `animated: false` freezes it (reduced motion). */
  setGrain(amount: number, animated = true): void {
    this.composite.uniforms['uGrain']!.value = amount;
    this.grainAnimated = animated;
  }

  /** Fade time constant in ms; 0 keeps strokes at full brightness. */
  setFadeTau(ms: number): void {
    this.fade.uFadeTau.value = ms;
  }

  /** Syncs committed strokes, building geometry only for strokes it hasn't seen. */
  setStrokes(strokes: readonly Stroke[]): void {
    const wanted = new Set(strokes.map((s) => s.id));
    for (const [id, mesh] of this.meshes) {
      if (!wanted.has(id)) {
        this.removeMesh(mesh);
        this.meshes.delete(id);
      }
    }
    for (const s of strokes) {
      if (!this.meshes.has(s.id)) this.meshes.set(s.id, this.addMesh(s));
    }
  }

  /** Replaces the in-progress strokes. Called only when they change. */
  setLive(strokes: readonly Stroke[]): void {
    for (const m of this.live) this.removeMesh(m);
    this.live = strokes.filter((s) => s.points.length > 0).map((s) => this.addMesh(s));
  }

  emitSparks(from: Vec2, to: Vec2, color: string): void {
    const count = Math.min(40, Math.round(3 + Math.hypot(to.x - from.x, to.y - from.y) * 0.25));
    this.sparks.emitAlong(from, to, color, count);
  }

  render(now: number, dtSec: number): void {
    this.fade.uNow.value = now;
    if (this.grainAnimated) this.composite.uniforms['uTime']!.value = now / 1000;
    this.sparks.update(dtSec);
    this.bloomComposer.render(dtSec);
    this.finalComposer.render(dtSec);
  }

  /** The GPU as WebGL reports it, e.g. "ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, ...)". */
  gpuDescription(): string {
    const gl = this.gl.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  }

  /** Renders a frame and snapshots it while the drawing buffer is still valid. */
  snapshot(now: number): Promise<Blob> {
    this.render(now, 0);
    return new Promise((resolve, reject) => {
      this.gl.domElement.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png');
    });
  }

  dispose(): void {
    this.setLive([]);
    this.setStrokes([]);
    this.video?.dispose();
    this.sparks.dispose();
    for (const m of [this.neon, this.sparkCore, this.ink]) m.dispose();
    this.bloomPass.dispose();
    this.bloomComposer.dispose();
    this.finalComposer.dispose();
    this.gl.dispose();
  }

  private addMesh(s: Stroke): Mesh {
    let material: ShaderMaterial = this.neon;
    let widthScale = 1;
    if (s.brush === 'sparks') {
      material = this.sparkCore;
      widthScale = 0.35;
    } else if (s.brush === 'ink') {
      material = this.ink;
    }
    const mesh = new Mesh(buildRibbon(s, widthScale), material);
    mesh.frustumCulled = false;
    (s.brush === 'ink' ? this.inkScene : this.lightScene).add(mesh);
    return mesh;
  }

  private removeMesh(mesh: Mesh): void {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }

  private updateCamera(): void {
    const r = visibleCanvasRect(this.frame, this.viewport);
    this.camera.left = r.left;
    this.camera.right = r.right;
    this.camera.top = r.top;
    this.camera.bottom = r.bottom;
    this.camera.updateProjectionMatrix();
    const s = coverScale(this.frame, this.viewport);
    (this.composite.uniforms['uCoverScale']!.value as Vector2).set(s.x, s.y);
  }
}
