// Orchestrates the real-time pipeline, entirely outside React:
//   tracker -> LandmarkFilter -> PinchTracker -> StrokeBuilder -> History -> LightRenderer
// Pointer input and the intro demo pen feed the same StrokeBuilder path.
// Cursors and the skeleton overlay are written to the DOM directly each frame.

import {
  buildTimeline,
  canvasToScreen,
  canvasToView,
  coverFit,
  frameForAspect,
  HAND_CONNECTIONS,
  HandIdentity,
  History,
  LandmarkFilter,
  landmarkToView,
  penSample,
  PinchTracker,
  sampleTimeline,
  screenToCanvas,
  StrokeBuilder,
  viewToCanvas,
  type BuildResult,
  type CoverFit,
  type FrameSize,
  type HandFrame,
  type InputEvent,
  type PenSample,
  type PenState,
  type SessionRecording,
  type Stroke,
  type StrokeStyle,
  type Timeline,
  type Viewport,
} from '@afterglow/core';
import { LightRenderer } from '@afterglow/render';
import {
  CameraError,
  FixtureTracker,
  listCameras,
  openCamera,
  stopCamera,
  type CameraOptions,
  type HandTracker,
  type TrackerTiming,
} from '@afterglow/tracking';
import { SIZES } from '../app/brushes';
import { showToast, useStudioStore, type StudioState } from '../app/store';
import { DemoPen } from './demoPen';
import { download, downloadJson, stamp } from './download';
import { loadFixture } from './fixtures';
import type { Scenario } from './scenarios';
import { SessionCapture } from './sessionCapture';
import { STRESS_STROKES, stressStrokes } from './stress';
import { RateCounter, RollingStats } from './telemetry';
import { TimelapseRecorder } from './timelapseRecorder';
import { BenchCollector, type BlockSummary } from './trackerBench';

const FADE_TAU_MS = 2600;
const INTRO_FADE_TAU_MS = 1300;
const POINTER_KEY = 'pointer';
const WASM_BASE_PATH = `${import.meta.env.BASE_URL}mediapipe`;

export interface StudioElements {
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  cursors: HTMLElement;
  video: HTMLVideoElement;
}

interface PenCursor {
  p: PenSample;
  state: PenState;
  color: string;
}

interface Replay {
  timeline: Timeline;
  startedAt: number;
  heads: Map<string, number>;
}

const newId = () => crypto.randomUUID();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `?tracker=main|worker` overrides where inference runs (see ADR 0003). */
function trackerPreference(): 'worker' | 'main' {
  return new URLSearchParams(location.search).get('tracker') === 'main' ? 'main' : 'worker';
}

export class Studio {
  private renderer: LightRenderer;
  private history = new History();
  private builder = new StrokeBuilder(newId);
  private identity = new HandIdentity();
  private filter = new LandmarkFilter(useStudioStore.getState().filter);
  private pinch = new PinchTracker(useStudioStore.getState().pinch);
  private tracker: HandTracker | null = null;
  private stream: MediaStream | null = null;
  private videoSize = { width: 0, height: 0 };
  private frame: FrameSize = frameForAspect(16 / 9);
  private viewport: Viewport = { width: 1, height: 1 };
  private fit: CoverFit = { scale: 1, offsetX: 0, offsetY: 0 };
  private dpr = 1;
  private readonly t0 = performance.now();
  private mode: 'intro' | 'studio' = 'intro';
  private reducedMotion = useStudioStore.getState().reducedMotion;

  private demo: DemoPen | null = null;
  private demoBuilder = new StrokeBuilder(newId);
  private demoStrokes: Stroke[] = [];

  private liveDirty = true;
  private syncedVersion = -1;
  private replay: Replay | null = null;
  private timelapse: TimelapseRecorder;
  private session = new SessionCapture();
  private bench: BenchCollector | null = null;
  private benchRunning = false;
  private measureSink: number[] | null = null;
  private calibrating = false;
  private clearArmedUntil = 0;
  private pointerActive = false;

  private pens = new Map<string, PenCursor>();
  private rawPens = new Map<string, PenSample>();
  private lastFiltered: HandFrame | null = null;
  private cursorEls = new Map<string, HTMLDivElement>();
  private overlayCtx: CanvasRenderingContext2D | null;
  private overlayDirty = false;

  private trackRate = new RateCounter();
  private renderRate = new RateCounter();
  private landmarkLatency = new RollingStats();
  private inkLatency = new RollingStats();
  private mainThreadCost = new RollingStats();
  private hasCaptureTime = false;
  private droppedFrames = 0;
  private skippedFrames = 0;
  private pendingCapture: number | null = null;
  private lastStatsAt = 0;
  private lastFrameAt = performance.now();
  private raf = 0;
  private disposers: Array<() => void> = [];

  constructor(private els: StudioElements) {
    // A new studio always starts at the intro (this also keeps the UI in sync after a dev hot reload).
    useStudioStore.setState({
      phase: 'intro',
      loadingMessage: null,
      strokeCount: 0,
      canUndo: false,
      canRedo: false,
      drawing: false,
      replaying: false,
      recordingVideo: false,
      session: null,
      bench: null,
    });
    this.renderer = new LightRenderer(els.canvas);
    this.timelapse = new TimelapseRecorder(els.canvas, () => showToast('Timelapse video saved'));
    this.overlayCtx = els.overlay.getContext('2d');
    this.renderer.setGrain(1, !this.reducedMotion);
    this.resize();

    if (this.reducedMotion) {
      this.renderer.setFadeTau(0);
      this.drawStaticDemo();
    } else {
      this.renderer.setFadeTau(INTRO_FADE_TAU_MS);
      this.demo = new DemoPen(this.now() + 500);
    }

    const listen = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ) => {
      target.addEventListener(type, fn as EventListener);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener));
    };
    listen(window, 'resize', this.resize);
    listen(els.canvas, 'pointerdown', this.onPointerDown);
    listen(els.canvas, 'pointermove', this.onPointerMove);
    listen(els.canvas, 'pointerup', this.onPointerUp);
    listen(els.canvas, 'pointercancel', this.onPointerUp);
    listen(els.canvas, 'pointerleave', this.onPointerLeave);
    this.disposers.push(useStudioStore.subscribe(this.onSettings));
    this.raf = requestAnimationFrame(this.tick);
  }

  // ---- lifecycle -----------------------------------------------------------

  async startCamera(): Promise<void> {
    const set = useStudioStore.setState;
    set({ phase: 'starting', error: null, loadingMessage: 'Waiting for camera permission' });
    try {
      this.stream ??= await openCamera(this.els.video, this.cameraOptions());
    } catch (err) {
      set({ phase: 'intro', loadingMessage: null, error: err instanceof CameraError ? err.kind : 'unknown' });
      return;
    }
    set({ loadingMessage: 'Loading hand tracking (about 8 MB)' });
    try {
      // Loaded on demand so pointer-only visitors never download MediaPipe.
      const { createHandTracker } = await import('@afterglow/tracking/mediapipe');
      this.tracker ??= await createHandTracker({
        mode: trackerPreference(),
        video: this.els.video,
        wasmBasePath: WASM_BASE_PATH,
      });
    } catch (err) {
      console.error('[studio] hand tracker failed to load', err);
      set({ phase: 'intro', loadingMessage: null, error: 'model' });
      return;
    }
    this.useVideoFrame();
    this.renderer.setVideo(this.els.video);
    this.tracker.start(this.onTrackerFrame);
    set({ inputMode: 'camera' });
    this.enterStudio();
    void this.refreshCameras();
  }

  /** Replays a recorded session from fixtures/sessions instead of a camera. */
  async startFixture(name: string, loop = false): Promise<void> {
    const set = useStudioStore.setState;
    set({ phase: 'starting', error: null, loadingMessage: `Loading fixture ${name}` });
    let recording: SessionRecording;
    try {
      recording = await loadFixture(name);
    } catch (err) {
      console.error('[studio] fixture failed to load', err);
      set({ phase: 'intro', loadingMessage: null, error: 'fixture' });
      return;
    }
    this.videoSize = { width: recording.meta.videoWidth, height: recording.meta.videoHeight };
    this.frame = frameForAspect(this.videoSize.width / this.videoSize.height);
    this.renderer.setVideo(null);
    this.tracker = new FixtureTracker(recording, {
      loop,
      onEnd: () => {
        this.finishTrackedStrokes();
        showToast(`Fixture ${name} finished`);
      },
    });
    this.tracker.start(this.onTrackerFrame);
    set({ inputMode: 'fixture' });
    this.enterStudio();
  }

  startPointer(): void {
    stopCamera(this.stream);
    this.stream = null;
    this.frame = frameForAspect(16 / 9);
    useStudioStore.setState({ inputMode: 'pointer', error: null });
    this.enterStudio();
  }

  /** Reopens the camera with a different device or resolution. */
  async switchCamera(opts: CameraOptions): Promise<void> {
    if (!this.stream) return;
    this.tracker?.stop();
    this.finishTrackedStrokes();
    stopCamera(this.stream);
    this.stream = null;
    try {
      this.stream = await openCamera(this.els.video, opts);
    } catch (err) {
      console.error('[studio] camera switch failed', err);
      showToast('That camera could not be opened');
      this.stream = await openCamera(this.els.video, {}).catch(() => null);
    }
    this.useVideoFrame();
    this.tracker?.start(this.onTrackerFrame);
    void this.refreshCameras();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.timelapse.stop();
    this.tracker?.close();
    stopCamera(this.stream);
    for (const d of this.disposers) d();
    for (const el of this.cursorEls.values()) el.remove();
    this.renderer.dispose();
  }

  private enterStudio(): void {
    this.mode = 'studio';
    this.demo = null;
    this.demoStrokes = [];
    this.demoBuilder.finishAll();
    this.renderer.sparks.clear();
    this.resize();

    const stress = new URLSearchParams(location.search).has('stress');
    if (stress) {
      for (const s of stressStrokes(this.frame, this.now(), newId)) this.history.add(s);
      useStudioStore.setState({ fade: false });
      showToast(`Stress test: ${STRESS_STROKES} synthetic strokes`);
    }
    this.renderer.setFadeTau(this.currentFadeTau());
    this.renderer.setDarkroom(this.view().darkroom ? 1 : 0);
    this.syncedVersion = -1;
    this.liveDirty = true;
    useStudioStore.setState({ phase: 'studio', loadingMessage: null });
  }

  private useVideoFrame(): void {
    const v = this.els.video;
    this.videoSize = { width: v.videoWidth, height: v.videoHeight };
    this.frame = frameForAspect(v.videoWidth / v.videoHeight);
    this.resize();
  }

  private cameraOptions(): CameraOptions {
    const s = useStudioStore.getState();
    return { resolution: s.resolution, ...(s.cameraId ? { deviceId: s.cameraId } : {}) };
  }

  private async refreshCameras(): Promise<void> {
    const cameras = await listCameras();
    const activeId = this.stream?.getVideoTracks()[0]?.getSettings().deviceId ?? null;
    useStudioStore.setState({ cameras, cameraId: activeId });
  }

  // ---- tools ---------------------------------------------------------------

  undo(): void {
    if (!this.replay) this.history.undo();
  }

  redo(): void {
    if (!this.replay) this.history.redo();
  }

  /** Clearing needs a second press within 2.5 s. */
  requestClear(): void {
    if (this.replay || this.history.strokes.length === 0) return;
    const t = performance.now();
    if (t < this.clearArmedUntil) {
      this.clearArmedUntil = 0;
      this.history.clear();
      showToast('Canvas cleared. Undo brings it back.');
    } else {
      this.clearArmedUntil = t + 2500;
      showToast('Press clear again to erase everything');
    }
  }

  async saveStill(): Promise<void> {
    // Long exposure: every stroke at full brightness, regardless of fade.
    this.renderer.setFadeTau(0);
    const pending = this.renderer.snapshot(this.replay ? this.now() - this.replay.startedAt : this.now());
    this.renderer.setFadeTau(this.currentFadeTau());
    try {
      download(await pending, `afterglow-${stamp()}.png`);
      showToast('Long exposure saved');
    } catch {
      showToast('Could not save the image');
    }
  }

  startReplay(record = false): void {
    if (this.replay) return;
    for (const s of this.builder.finishAll()) this.history.add(s);
    if (this.history.strokes.length === 0) {
      showToast('Nothing to replay yet. Draw something first.');
      return;
    }
    this.replay = { timeline: buildTimeline(this.history.strokes), startedAt: this.now(), heads: new Map() };
    this.renderer.setLive([]);
    this.renderer.setStrokes([]);
    this.renderer.sparks.clear();
    this.renderer.setVideoOpacity(0);
    if (record && !this.timelapse.start()) showToast('Video recording is not supported in this browser');
    useStudioStore.setState({ replaying: true, recordingVideo: this.timelapse.active });
  }

  stopReplay(): void {
    if (!this.replay) return;
    this.replay = null;
    this.renderer.setLive([]);
    this.renderer.setVideoOpacity(1);
    this.syncedVersion = -1;
    this.liveDirty = true;
    this.timelapse.stop();
    useStudioStore.setState({ replaying: false, recordingVideo: false });
  }

  // ---- session recording ---------------------------------------------------

  get canRecordSession(): boolean {
    return this.tracker !== null && this.mode === 'studio';
  }

  /** R toggles an ad-hoc recording of raw tracker frames. */
  toggleSessionRecording(): void {
    if (this.session.active) this.stopSession();
    else this.startSession(null);
  }

  startSession(scenario: Scenario | null): void {
    if (!this.canRecordSession) {
      showToast('Start the camera to record a session');
      return;
    }
    this.session.start(scenario);
    useStudioStore.setState({ session: { scenario: scenario?.id ?? null } });
    if (!scenario) showToast('Recording session. Press R to stop.');
  }

  stopSession(): void {
    if (!this.session.active || !this.tracker) return;
    const { recording, fileName } = this.session.finish(
      {
        userAgent: navigator.userAgent,
        recordedAt: new Date().toISOString(),
        videoWidth: this.videoSize.width,
        videoHeight: this.videoSize.height,
        tracker: this.tracker.mode,
        delegate: this.tracker.delegate,
      },
      `afterglow-session-${stamp()}`,
    );
    useStudioStore.setState({ session: null });
    if (recording.frames.length === 0) {
      showToast('Nothing was recorded. Is a hand in view?');
      return;
    }
    downloadJson(recording, fileName);
    showToast(`Saved ${fileName} (${String(recording.frames.length)} frames)`);
  }

  /**
   * Collects the pinch measure of the first visible hand for `durationMs`, for
   * calibration. Drawing is suppressed meanwhile, so the calibration pinch doesn't paint.
   */
  async sampleMeasures(durationMs: number): Promise<number[]> {
    const sink: number[] = [];
    this.measureSink = sink;
    this.calibrating = true;
    this.finishTrackedStrokes();
    await sleep(durationMs);
    if (this.measureSink === sink) this.measureSink = null;
    return sink;
  }

  endCalibration(): void {
    this.measureSink = null;
    this.calibrating = false;
    this.finishTrackedStrokes();
  }

  cancelSession(): void {
    this.session.cancel();
    useStudioStore.setState({ session: null });
  }

  // ---- tracker benchmark (ADR 0003) ----------------------------------------

  /**
   * Alternates main-thread and worker tracking in blocks on the live camera, while
   * rendering. Each block gets a fresh tracker and closes it afterwards, so only
   * one MediaPipe instance (and GPU context) exists at a time.
   */
  async runTrackerBench(blockMs = 10_000, warmupMs = 2000): Promise<void> {
    if (this.benchRunning || !this.stream || !this.tracker) return;
    this.benchRunning = true;
    const set = (bench: StudioState['bench']) => {
      useStudioStore.setState({ bench });
    };
    const blocks: BlockSummary[] = [];
    const restoreMode = this.tracker.mode === 'main' ? 'main' : 'worker';
    this.tracker.close();
    this.tracker = null;
    this.finishTrackedStrokes();
    const opts = { video: this.els.video, wasmBasePath: WASM_BASE_PATH };
    const { WorkerHandTracker, createHandTracker } = await import('@afterglow/tracking/mediapipe');
    const { MainThreadHandTracker } = await import('@afterglow/tracking/main-thread');
    try {
      const order = ['main', 'worker', 'main', 'worker'] as const;
      for (const [i, mode] of order.entries()) {
        set({ status: 'running', progress: `Block ${String(i + 1)} of 4: ${mode}`, blocks: [...blocks] });
        const tracker =
          mode === 'main' ? await MainThreadHandTracker.create(opts) : await WorkerHandTracker.create(opts);
        this.tracker = tracker;
        tracker.start(this.onTrackerFrame);
        await sleep(warmupMs);
        this.bench = new BenchCollector(performance.now());
        await sleep(blockMs);
        blocks.push(this.bench.summarize(tracker.mode, tracker.delegate, performance.now()));
        this.bench = null;
        tracker.close();
        this.tracker = null;
      }
      set({ status: 'done', progress: 'Done', blocks });
    } catch (err) {
      console.error('[studio] tracker benchmark failed', err);
      set({ status: 'error', progress: '', blocks, error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.bench = null;
      this.tracker?.close();
      this.tracker = await createHandTracker({ ...opts, mode: restoreMode });
      this.tracker.start(this.onTrackerFrame);
      this.benchRunning = false;
    }
  }

  benchEnvironment(): Record<string, unknown> {
    return {
      userAgent: navigator.userAgent,
      gpu: this.renderer.gpuDescription(),
      video: `${String(this.videoSize.width)}x${String(this.videoSize.height)}`,
      viewport: `${String(this.viewport.width)}x${String(this.viewport.height)}@${String(this.dpr)}`,
      strokes: this.history.strokes.length,
      recordedAt: new Date().toISOString(),
    };
  }

  // ---- input ---------------------------------------------------------------

  private onTrackerFrame = (frame: HandFrame, timing: TrackerTiming): void => {
    this.trackRate.tick(timing.doneAt);
    this.landmarkLatency.push(timing.doneAt - timing.captureTime);
    this.mainThreadCost.push(timing.mainThreadMs);
    this.hasCaptureTime = timing.hasCaptureTime;
    this.droppedFrames = timing.droppedFrames;
    this.skippedFrames = timing.skippedFrames;
    this.pendingCapture = timing.captureTime;
    this.bench?.onTrackerFrame(timing);
    this.session.push(frame);

    const aspect = this.frame.width / this.frame.height;
    // Stable per-hand ids by position; MediaPipe's handedness label isn't an identity (ADR 0004).
    const identified = this.identity.assign({ ...frame, captureTime: frame.captureTime - this.t0 }, aspect);
    this.rawPens.clear();
    for (const h of identified.hands) {
      this.rawPens.set(h.key, penSample(h.landmarks, aspect, this.pinch.config.neutralPalm));
    }

    const filtered = this.filter.apply(identified);
    this.lastFiltered = filtered;
    this.overlayDirty = true;
    this.handleEvents(this.pinch.update(filtered, aspect));

    const tracked = this.pinch.status();
    const first = filtered.hands[0];
    if (this.measureSink && first) {
      const ratio = tracked.get(first.key)?.ratio;
      if (ratio !== undefined && Number.isFinite(ratio)) this.measureSink.push(ratio);
    }
    for (const key of this.pens.keys()) if (key !== POINTER_KEY && !tracked.has(key)) this.pens.delete(key);
  };

  /**
   * Ends strokes held by tracked hands and forgets per-hand state. Needed whenever
   * the input source stops: with no more frames, hand-loss detection never fires.
   */
  private finishTrackedStrokes(): void {
    this.handleEvents(this.pinch.reset(this.now()));
    this.identity.reset();
    this.filter.reset();
    this.lastFiltered = null;
    this.rawPens.clear();
    for (const key of this.pens.keys()) if (key !== POINTER_KEY) this.pens.delete(key);
    this.overlayDirty = true;
  }

  private handleEvents(events: InputEvent[]): void {
    const style = this.style();
    for (const ev of events) {
      if (ev.type === 'strokeEnd') {
        const pen = this.pens.get(ev.handKey);
        if (pen) pen.state = 'hover';
      } else {
        this.pens.set(ev.handKey, { p: ev.p, state: ev.type === 'hover' ? 'hover' : 'drawing', color: style.color });
      }
      if (this.replay || this.calibrating || this.mode !== 'studio') continue;
      this.applyBuild(this.builder.handle(ev, style, this.frame));
    }
  }

  private applyBuild(r: BuildResult): void {
    if (r.kind === 'none') return;
    this.liveDirty = true;
    if (r.kind === 'move' && r.stroke.brush === 'sparks' && !this.reducedMotion) {
      this.renderer.emitSparks(r.from, r.to, r.stroke.color);
    }
    if (r.kind === 'end') {
      this.history.add(r.stroke);
      if (!useStudioStore.getState().hasDrawn) useStudioStore.setState({ hasDrawn: true });
    }
  }

  private pointerSample(e: PointerEvent): PenSample {
    const v = canvasToView(screenToCanvas({ x: e.clientX, y: e.clientY }, this.fit), this.frame);
    return { x: v.x, y: v.y, depth: e.pointerType === 'pen' ? 0.5 + e.pressure : 1 };
  }

  private eventTime(e: PointerEvent): number {
    return e.timeStamp - this.t0;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'studio' || this.replay || e.button > 0) return;
    this.els.canvas.setPointerCapture(e.pointerId);
    this.pointerActive = true;
    this.handleEvents([{ type: 'strokeStart', t: this.eventTime(e), handKey: POINTER_KEY, p: this.pointerSample(e) }]);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.mode !== 'studio') return;
    if (!this.pointerActive) {
      this.handleEvents([{ type: 'hover', t: this.eventTime(e), handKey: POINTER_KEY, p: this.pointerSample(e) }]);
      return;
    }
    // Older Safari lacks getCoalescedEvents; fall back to the single event.
    const coalesced = 'getCoalescedEvents' in e ? e.getCoalescedEvents() : [];
    const samples = coalesced.length > 0 ? coalesced : [e];
    this.handleEvents(
      samples.map((ce) => ({
        type: 'strokeMove',
        t: this.eventTime(ce),
        handKey: POINTER_KEY,
        p: this.pointerSample(ce),
      })),
    );
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointerActive) return;
    this.pointerActive = false;
    this.handleEvents([{ type: 'strokeEnd', t: this.eventTime(e), handKey: POINTER_KEY, reason: 'release' }]);
    if (e.pointerType !== 'mouse') this.pens.delete(POINTER_KEY);
  };

  private onPointerLeave = (): void => {
    if (!this.pointerActive) this.pens.delete(POINTER_KEY);
  };

  // ---- frame loop ----------------------------------------------------------

  private tick = (ts: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    this.bench?.onRenderFrame(ts - this.lastFrameAt);
    const dt = Math.min(0.1, Math.max(0, (ts - this.lastFrameAt) / 1000));
    this.lastFrameAt = ts;
    const now = this.now();
    let fadeNow = now;

    if (this.demo) this.runDemo(now);
    if (this.replay) {
      fadeNow = this.updateReplay(now);
    } else {
      if (this.mode === 'studio' && this.history.version !== this.syncedVersion) {
        this.syncedVersion = this.history.version;
        this.renderer.setStrokes(this.history.strokes);
        useStudioStore.setState({
          strokeCount: this.history.strokes.length,
          canUndo: this.history.canUndo,
          canRedo: this.history.canRedo,
        });
      }
      if (this.liveDirty) {
        this.liveDirty = false;
        this.renderer.setLive(this.mode === 'intro' ? this.demoBuilder.activeStrokes() : this.builder.activeStrokes());
      }
    }

    this.renderer.render(fadeNow, dt);
    if (this.pendingCapture !== null) {
      this.inkLatency.push(performance.now() - this.pendingCapture);
      this.pendingCapture = null;
    }
    this.renderRate.tick(ts);
    this.drawCursors();
    if (this.overlayDirty) this.drawOverlay();
    if (ts - this.lastStatsAt > 250) {
      this.lastStatsAt = ts;
      this.publishStats(ts);
    }
  };

  private runDemo(now: number): void {
    const demo = this.demo;
    if (!demo) return;
    const fig = demo.figure;
    for (const ev of demo.update(now)) {
      const r = this.demoBuilder.handle(ev, { brush: fig.brush, color: fig.color, size: SIZES.m }, this.frame);
      if (r.kind === 'none') continue;
      this.liveDirty = true;
      if (r.kind === 'move' && r.stroke.brush === 'sparks') this.renderer.emitSparks(r.from, r.to, r.stroke.color);
      if (r.kind === 'end') {
        this.demoStrokes = [...this.demoStrokes.slice(-3), r.stroke];
        this.renderer.setStrokes(this.demoStrokes);
      }
    }
  }

  private drawStaticDemo(): void {
    for (const { figure, events } of DemoPen.staticEvents(this.now())) {
      for (const ev of events) {
        const r = this.demoBuilder.handle(ev, { brush: figure.brush, color: figure.color, size: SIZES.m }, this.frame);
        if (r.kind === 'end') this.demoStrokes.push(r.stroke);
      }
    }
    this.renderer.setStrokes(this.demoStrokes);
  }

  /** Advances the timelapse; returns the playhead, which is the "now" for fading. */
  private updateReplay(now: number): number {
    const rp = this.replay!;
    const head = now - rp.startedAt;
    const { complete, active } = sampleTimeline(rp.timeline, head);
    this.renderer.setStrokes(complete);
    this.renderer.setLive(active);
    if (!this.reducedMotion) {
      for (const s of active) {
        if (s.brush !== 'sparks') continue;
        const n = s.points.length;
        const prev = rp.heads.get(s.id) ?? 0;
        if (n >= 2 && n > prev) this.renderer.emitSparks(s.points[Math.max(0, prev - 1)]!, s.points[n - 1]!, s.color);
        rp.heads.set(s.id, n);
      }
    }
    if (head > rp.timeline.duration) this.stopReplay();
    return head;
  }

  private drawCursors(): void {
    const showRaw = this.view().raw && this.mode === 'studio';
    const wanted = new Map<string, { p: PenSample; state: string; color: string }>();
    for (const [key, pen] of this.pens) wanted.set(key, pen);
    if (showRaw) for (const [key, p] of this.rawPens) wanted.set(`raw:${key}`, { p, state: 'raw', color: '#8A93B8' });

    for (const [key, el] of this.cursorEls) {
      if (!wanted.has(key)) {
        el.remove();
        this.cursorEls.delete(key);
      }
    }
    for (const [key, pen] of wanted) {
      let el = this.cursorEls.get(key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'pen-cursor';
        this.els.cursors.appendChild(el);
        this.cursorEls.set(key, el);
      }
      const s = canvasToScreen(viewToCanvas(pen.p, this.frame), this.fit);
      el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
      el.dataset['state'] = pen.state;
      el.style.setProperty('--pen', pen.color);
      el.style.setProperty('--depth', pen.p.depth.toFixed(2));
    }
  }

  private drawOverlay(): void {
    this.overlayDirty = false;
    const ctx = this.overlayCtx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.els.overlay.width, this.els.overlay.height);
    if (!this.view().skeleton || !this.lastFiltered || this.mode !== 'studio') return;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(138, 147, 184, 0.6)';
    ctx.fillStyle = 'rgba(233, 236, 245, 0.85)';
    for (const hand of this.lastFiltered.hands) {
      const pts = hand.landmarks.map((l) => canvasToScreen(viewToCanvas(landmarkToView(l), this.frame), this.fit));
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(pts[a]!.x, pts[a]!.y);
        ctx.lineTo(pts[b]!.x, pts[b]!.y);
      }
      ctx.stroke();
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private publishStats(ts: number): void {
    const hands = [...this.pinch.status()].map(([key, v]) => ({ key, state: v.state, ratio: v.ratio }));
    useStudioStore.setState({
      stats: {
        trackingFps: this.tracker ? this.trackRate.rate(performance.now()) : 0,
        renderFps: this.renderRate.rate(ts),
        landmarkP50: this.landmarkLatency.percentile(50),
        landmarkP95: this.landmarkLatency.percentile(95),
        inkP50: this.inkLatency.percentile(50),
        inkP95: this.inkLatency.percentile(95),
        mainThreadP50: this.mainThreadCost.percentile(50),
        mainThreadP95: this.mainThreadCost.percentile(95),
        hasCaptureTime: this.hasCaptureTime,
        tracker: this.tracker?.mode ?? null,
        delegate: this.tracker?.delegate ?? null,
        droppedFrames: this.droppedFrames,
        skippedFrames: this.skippedFrames,
        hands,
      },
      drawing: this.builder.activeStrokes().length > 0,
    });
  }

  // ---- helpers -------------------------------------------------------------

  /** Effective view flags: debug view shows the natural video, skeleton, and raw signal. */
  private view(): { darkroom: boolean; skeleton: boolean; raw: boolean } {
    const s = useStudioStore.getState();
    return {
      darkroom: s.darkroom && !s.debugView,
      skeleton: s.showSkeleton || s.debugView,
      raw: s.showRaw || s.debugView,
    };
  }

  private onSettings = (s: StudioState, prev: StudioState): void => {
    if (s.fade !== prev.fade) this.renderer.setFadeTau(this.currentFadeTau());
    if (s.darkroom !== prev.darkroom || s.debugView !== prev.debugView) {
      this.renderer.setDarkroom(this.view().darkroom ? 1 : 0);
    }
    if (s.filter !== prev.filter) this.filter.setSpec(s.filter);
    if (s.pinch !== prev.pinch) this.pinch.config = s.pinch;
    if (s.showSkeleton !== prev.showSkeleton || s.debugView !== prev.debugView) this.overlayDirty = true;
  };

  private currentFadeTau(): number {
    if (this.mode === 'intro') return this.reducedMotion ? 0 : INTRO_FADE_TAU_MS;
    return useStudioStore.getState().fade ? FADE_TAU_MS : 0;
  }

  private style(): StrokeStyle {
    const s = useStudioStore.getState();
    return { brush: s.brush, color: s.color, size: SIZES[s.size] };
  }

  private now(): number {
    return performance.now() - this.t0;
  }

  private resize = (): void => {
    this.viewport = { width: window.innerWidth, height: window.innerHeight };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setFrame(this.frame);
    this.renderer.setSize(this.viewport, this.dpr);
    this.fit = coverFit(this.frame, this.viewport);
    this.els.overlay.width = Math.round(this.viewport.width * this.dpr);
    this.els.overlay.height = Math.round(this.viewport.height * this.dpr);
    this.overlayDirty = true;
  };
}
