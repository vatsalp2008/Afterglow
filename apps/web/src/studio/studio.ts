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
  MenuController,
  LandmarkFilter,
  parseDrawing,
  placeDrawing,
  toDrawing,
  landmarkToView,
  penSample,
  PinchTracker,
  sampleTimeline,
  screenToCanvas,
  eraseStrokes,
  StrokeBuilder,
  ToolGestureTracker,
  viewToCanvas,
  visibleCanvasRect,
  type BuildResult,
  type CoverFit,
  type FrameSize,
  type HandFrame,
  type InputEvent,
  type MenuEvent,
  type PenSample,
  type PenState,
  type SessionRecording,
  type Stroke,
  type StrokeStyle,
  type Timeline,
  type ToolGesture,
  type Vec2,
  type Viewport,
} from '@afterglow/core';
import { LightRenderer, strokesToSvg } from '@afterglow/render';
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
import { ERASER_RADII, SIZES } from '../app/brushes';
import { menuTree, runByGesture } from '../app/commands';
import { showToast, useStudioStore, type StartError, type StudioState } from '../app/store';
import { DemoPen } from './demoPen';
import { download, downloadJson, stamp } from './download';
import { carriesFiles, MAX_DRAWING_BYTES, OPEN_PROBLEM_COPY, pickDrawingFile } from './drawingFile';
import { loadFixture } from './fixtures';
import { isPointerKey, POINTER_KEY, pointerKey } from './pointerKeys';
import type { Scenario } from './scenarios';
import { SessionCapture } from './sessionCapture';
import { stressCount, stressStrokes } from './stress';
import { percentile, RateCounter, RollingStats } from './telemetry';
import { TimelapseRecorder } from './timelapseRecorder';
import { median, summarizeScene, type FrameSamples, type RenderBenchResult } from './renderBench';
import { BenchCollector, type BlockSummary } from './trackerBench';

const FADE_TAU_MS = 2600;
const INTRO_FADE_TAU_MS = 1300;
const WASM_BASE_PATH = `${import.meta.env.BASE_URL}mediapipe`;
/**
 * With the camera on and the page in view, this long without a tracker frame means
 * tracking has failed: frames arrive even with no hand in view.
 */
const TRACKING_STALL_MS = 4000;

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

const HELP_SEEN_KEY = 'afterglow:gestures-help-seen';

/** Shows the gestures card the first time the camera is used. */
function showGesturesOnce(): void {
  try {
    if (localStorage.getItem(HELP_SEEN_KEY)) return;
    localStorage.setItem(HELP_SEEN_KEY, '1');
  } catch {
    // Storage unavailable: show it this time anyway.
  }
  useStudioStore.setState({ helpOpen: true });
}

function renderStats(s: { calls: number; triangles: number; geometries: number }) {
  return { drawCalls: s.calls, triangles: s.triangles, geometries: s.geometries };
}

function countGesture(name: ToolGesture): void {
  useStudioStore.setState((s) => ({ gestures: { ...s.gestures, [name]: (s.gestures[name] ?? 0) + 1 } }));
}
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

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
  private tools = new ToolGestureTracker();
  private gestureMenu = new MenuController();
  private menuPointerEl: HTMLDivElement | null = null;
  /** Erase gestures in progress, per pen: an undo group and the last eraser position (canvas units). */
  private erasing = new Map<string, { group: string; last: Vec2 }>();
  private tracker: HandTracker | null = null;
  private stream: MediaStream | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private lastTrackerFrameAt = 0;
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
  private clearArmedUntil = 0;
  /** Pointers drawing right now, by pointer id, and the pen each drives. */
  private activePointers = new Map<number, string>();

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
  // Capture-to-ink: the capture time of the tracker frame being handled, the oldest one
  // whose ink hasn't been drawn yet, and the one drawn last frame (measured at the next
  // animation frame, when it has been presented).
  private frameCapture: number | null = null;
  private inkCapture: number | null = null;
  private inkDrawn: number | null = null;
  private frameCost = new RollingStats();
  // Render benchmark (?bench=render): wait for the GPU after each frame, and collect frames and ink latency.
  private gpuSync = false;
  private benchFrames: FrameSamples | null = null;
  private inkSamples: number[] | null = null;
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
    // A drawing file dropped anywhere opens; without this the browser would navigate to it.
    listen(window, 'dragover', this.onDragOver);
    listen(window, 'drop', this.onDrop);
    // Safari zooms the page on a two-finger pinch despite touch-action; painting needs both fingers.
    const stopZoom = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stopZoom);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.disposers.push(() => {
      document.removeEventListener('gesturestart', stopZoom);
      document.removeEventListener('visibilitychange', this.onVisibility);
    });
    this.disposers.push(useStudioStore.subscribe(this.onSettings));
    this.raf = requestAnimationFrame(this.tick);
  }

  // ---- lifecycle -----------------------------------------------------------

  async startCamera(): Promise<void> {
    const set = useStudioStore.setState;
    set({ phase: 'starting', error: null, loadingMessage: 'Waiting for camera permission' });
    try {
      this.stream ??= await openCamera(this.els.video, this.cameraOptions());
      this.watchCamera();
    } catch (err) {
      set({ phase: 'intro', loadingMessage: null, error: err instanceof CameraError ? err.kind : 'unknown' });
      return;
    }
    set({ loadingMessage: 'Loading hand tracking (about 8 MB)' });
    try {
      this.tracker ??= await this.createTracker();
    } catch (err) {
      console.error('[studio] hand tracker failed to load', err);
      // Without tracking the camera is no use: turn it off rather than leave its light on.
      this.releaseCamera();
      set({ phase: 'intro', loadingMessage: null, error: 'model' });
      return;
    }
    this.useVideoFrame();
    this.renderer.setVideo(this.els.video);
    this.startTracking();
    set({ inputMode: 'camera' });
    this.enterStudio();
    void this.refreshCameras();
    showGesturesOnce();
  }

  /** Replays a recorded session from fixtures/sessions instead of a camera. */
  async startFixture(name: string, loop = false, onDone?: () => void): Promise<void> {
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
        onDone?.();
      },
    });
    set({ inputMode: 'fixture' });
    this.enterStudio();
    // Play once the studio has drawn: the first frames compile shaders, which can stall
    // the page for seconds on software WebGL, and a recording started before that would
    // play its opening seconds in a burst when the page wakes up.
    await nextFrame();
    await nextFrame();
    this.tracker.start(this.onTrackerFrame);
  }

  startPointer(): void {
    this.releaseCamera();
    this.frame = frameForAspect(16 / 9);
    useStudioStore.setState({ inputMode: 'pointer', error: null });
    this.enterStudio();
  }

  /** Reopens the camera with a different device or resolution. */
  async switchCamera(opts: CameraOptions): Promise<void> {
    if (!this.stream) return;
    this.tracker?.stop();
    this.finishTrackedStrokes();
    this.releaseCamera();
    try {
      this.stream = await openCamera(this.els.video, opts);
    } catch (err) {
      console.error('[studio] camera switch failed', err);
      showToast('That camera could not be opened');
      try {
        this.stream = await openCamera(this.els.video, {});
      } catch {
        this.interrupt('camera');
        return;
      }
    }
    this.watchCamera();
    this.useVideoFrame();
    this.startTracking();
    void this.refreshCameras();
  }

  /** After an interruption: reconnects the camera and restarts hand tracking as needed. */
  async reconnect(): Promise<void> {
    const current = useStudioStore.getState().interruption;
    if (!current || current.reconnecting) return;
    const failed = (error: StartError) =>
      useStudioStore.setState({ interruption: { ...current, error, reconnecting: false } });
    useStudioStore.setState({ interruption: { ...current, error: null, reconnecting: true } });
    if (!this.stream) {
      try {
        this.stream = await openCamera(this.els.video, this.cameraOptions());
      } catch (err) {
        // The chosen camera may be the one that went away: any camera will do.
        try {
          if (!useStudioStore.getState().cameraId) throw err;
          this.stream = await openCamera(this.els.video, { resolution: useStudioStore.getState().resolution });
        } catch (fallbackErr) {
          failed(fallbackErr instanceof CameraError ? fallbackErr.kind : 'unknown');
          return;
        }
      }
      this.watchCamera();
      this.useVideoFrame();
    }
    // Nothing here pauses the video, but a browser can; frames only come while it plays.
    if (this.els.video.paused) await this.els.video.play().catch(() => undefined);
    if (current.kind === 'tracking' || !this.tracker) {
      this.tracker?.close();
      this.tracker = null;
      try {
        this.tracker = await this.createTracker();
      } catch (err) {
        console.error('[studio] hand tracker failed to restart', err);
        failed('model');
        return;
      }
    }
    this.startTracking();
    useStudioStore.setState({ interruption: null });
    showToast(current.kind === 'camera' ? 'Camera reconnected' : 'Hand tracking restarted');
    void this.refreshCameras();
  }

  /** After an interruption: carries on with the mouse or touch, keeping the drawing. */
  continueWithoutCamera(): void {
    this.tracker?.close();
    this.tracker = null;
    this.releaseCamera();
    this.renderer.setVideo(null);
    useStudioStore.setState({ inputMode: 'pointer', interruption: null, paused: false });
  }

  private async createTracker(): Promise<HandTracker> {
    // Loaded on demand so pointer-only visitors never download MediaPipe.
    const { createHandTracker } = await import('@afterglow/tracking/mediapipe');
    return createHandTracker({ mode: trackerPreference(), video: this.els.video, wasmBasePath: WASM_BASE_PATH });
  }

  private startTracking(): void {
    this.lastTrackerFrameAt = performance.now();
    this.tracker?.start(this.onTrackerFrame);
  }

  /** Notices the camera ending: unplugged, its permission revoked, or taken by another app. */
  private watchCamera(): void {
    this.cameraTrack?.removeEventListener('ended', this.onCameraEnded);
    this.cameraTrack = this.stream?.getVideoTracks()[0] ?? null;
    this.cameraTrack?.addEventListener('ended', this.onCameraEnded);
  }

  private onCameraEnded = (): void => {
    this.interrupt('camera');
  };

  private releaseCamera(): void {
    this.cameraTrack?.removeEventListener('ended', this.onCameraEnded);
    this.cameraTrack = null;
    stopCamera(this.stream);
    this.stream = null;
  }

  /** The camera or tracking stopped mid-session: end open strokes and ask what to do (ADR 0013). */
  private interrupt(kind: 'camera' | 'tracking'): void {
    if (useStudioStore.getState().interruption) return;
    this.tracker?.stop();
    this.finishTrackedStrokes();
    if (kind === 'camera') this.releaseCamera();
    useStudioStore.setState({ interruption: { kind, error: null, reconnecting: false } });
  }

  /** The watchdog: no tracker frames for a while, with the camera on and the page in view. */
  private checkTracking(t: number): void {
    if (!this.tracker || this.benchRunning || document.visibilityState !== 'visible') return;
    const s = useStudioStore.getState();
    if (s.inputMode !== 'camera' || s.interruption || t - this.lastTrackerFrameAt < TRACKING_STALL_MS) return;
    // A muted track sends no video, and the video element waits without an error.
    const track = this.cameraTrack;
    this.interrupt(!track || track.readyState === 'ended' || track.muted ? 'camera' : 'tracking');
  }

  /** Hidden, the camera's frames stop; strokes end so coming back can't draw a jump. */
  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      if (this.stream) this.finishTrackedStrokes();
    } else {
      this.lastTrackerFrameAt = performance.now();
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.timelapse.stop();
    this.tracker?.close();
    this.releaseCamera();
    for (const d of this.disposers) d();
    for (const el of this.cursorEls.values()) el.remove();
    this.menuPointerEl?.remove();
    this.renderer.dispose();
  }

  private enterStudio(): void {
    this.mode = 'studio';
    this.demo = null;
    this.demoStrokes = [];
    this.demoBuilder.finishAll();
    this.renderer.sparks.clear();
    this.resize();

    const stress = new URLSearchParams(location.search).get('stress');
    if (stress !== null) {
      const count = stressCount(stress);
      for (const s of stressStrokes(this.frame, this.now(), newId, count)) this.history.add(s);
      useStudioStore.setState({ fade: false });
      showToast(`Stress test: ${String(count)} synthetic strokes`);
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

  /** Clears at once: the gesture menu and the dock ask for confirmation themselves. */
  clear(): void {
    if (this.replay || this.history.strokes.length === 0) return;
    this.history.clear();
  }

  /** Pauses or resumes drawing with the hands; the pointer still draws. */
  togglePause(): void {
    const paused = !useStudioStore.getState().paused;
    // End open strokes (P can arrive mid-stroke), but keep the gesture state: the fist that
    // paused is still held and must not count again.
    if (paused) this.handleEvents(this.pinch.reset(this.now()));
    useStudioStore.setState({ paused });
    showToast(paused ? 'Hand drawing paused' : 'Hand drawing resumed');
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
    if (this.history.strokes.length === 0 && !this.replay) {
      showToast('Nothing to save yet. Draw something first.');
      return;
    }
    // Long exposure: every stroke at full brightness, regardless of fade. Light only: the
    // camera image never goes into a file meant to be shared.
    this.renderer.setFadeTau(0);
    this.renderer.setVideoOpacity(0);
    const pending = this.renderer.snapshot(this.replay ? this.now() - this.replay.startedAt : this.now());
    this.renderer.setVideoOpacity(this.replay ? 0 : 1);
    this.renderer.setFadeTau(this.currentFadeTau());
    try {
      download(await pending, `afterglow-${stamp()}.png`);
      showToast('Long exposure saved');
    } catch {
      showToast('Could not save the image');
    }
  }

  /** The drawing as an SVG, cropped like the PNG to what's on screen (ADR 0012). */
  saveSvg(): void {
    if (this.history.strokes.length === 0) {
      showToast('Nothing to save yet. Draw something first.');
      return;
    }
    const svg = strokesToSvg(this.history.strokes, visibleCanvasRect(this.frame, this.viewport));
    download(new Blob([svg], { type: 'image/svg+xml' }), `afterglow-${stamp()}.svg`);
    showToast('Vector image saved');
  }

  /** The strokes and their timing, to open again later. */
  saveDrawing(): void {
    if (this.history.strokes.length === 0) {
      showToast('Nothing to save yet. Draw something first.');
      return;
    }
    downloadJson(toDrawing(this.history.strokes, this.frame), `afterglow-${stamp()}.json`);
    showToast('Drawing file saved');
  }

  async openDrawingFile(): Promise<void> {
    const file = await pickDrawingFile();
    if (file) await this.openDrawing(file);
  }

  /** Replaces the canvas with a saved drawing, in one step that undo reverses. */
  async openDrawing(file: File): Promise<void> {
    if (file.size > MAX_DRAWING_BYTES) {
      showToast(OPEN_PROBLEM_COPY.tooLarge);
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      showToast(OPEN_PROBLEM_COPY.unreadable);
      return;
    }
    const parsed = parseDrawing(text);
    if (!parsed.ok) {
      showToast(OPEN_PROBLEM_COPY[parsed.problem]);
      return;
    }
    const strokes = placeDrawing(parsed.drawing, this.frame, this.now(), newId);
    if (strokes.length === 0) {
      showToast(OPEN_PROBLEM_COPY.empty);
      return;
    }
    this.stopReplay();
    for (const s of this.builder.finishAll()) this.history.add(s);
    const replaced = this.history.strokes.length > 0;
    this.history.replace(this.history.strokes, strokes);
    const count = `${String(strokes.length)} ${strokes.length === 1 ? 'stroke' : 'strokes'}`;
    showToast(`Opened a drawing with ${count}.${replaced ? ' Undo brings back the one before.' : ''}`);
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

  startSession(scenario: Scenario | null, person: string | null = null): void {
    if (!this.canRecordSession) {
      showToast('Start the camera to record a session');
      return;
    }
    this.session.start(scenario, person);
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
      this.startTracking();
      this.benchRunning = false;
    }
  }

  /**
   * The render benchmark: frame cost as the canvas fills (0 to 1000 synthetic strokes),
   * an eraser gesture across 500 strokes, live strokes of growing length, and ink latency
   * while a recorded session draws. Fading is off throughout.
   */
  async runRenderBench(): Promise<void> {
    if (this.mode !== 'studio' || this.replay) return;
    const progress = (text: string) =>
      useStudioStore.setState({ renderBench: { status: 'running', progress: text, result: null } });
    useStudioStore.setState({ fade: false });
    const result: RenderBenchResult = {
      environment: {},
      scenes: [],
      erase: null,
      live: [],
      sparks: null,
      latency: null,
    };
    try {
      for (const count of [0, 100, 250, 500, 1000]) {
        progress(`${String(count)} strokes`);
        this.loadBenchStrokes(count);
        await sleep(1000);
        const free = await this.sampleFrames(3000, false);
        const synced = await this.sampleFrames(1500, true);
        result.scenes.push(summarizeScene(count, free, synced, this.renderer.stats()));
      }
      progress('Erasing across 500 strokes');
      this.loadBenchStrokes(500);
      await sleep(1000);
      result.erase = await this.benchErase();
      progress('Live strokes');
      result.live = this.benchLive();
      result.sparks = this.benchSparks();
      result.environment = this.benchEnvironment();
      progress('Ink latency during a recorded session');
      this.history.clear();
      this.inkSamples = [];
      await new Promise<void>((resolve) => void this.startFixture('03-fast-zigzag', false, resolve));
      const samples = this.inkSamples;
      this.inkSamples = null;
      result.latency = {
        source:
          'recorded session 03-fast-zigzag: from each frame being due to its ink on screen (no camera or inference)',
        samples: samples.length,
        p50: percentile(samples, 50),
        p95: percentile(samples, 95),
      };
      useStudioStore.setState({ renderBench: { status: 'done', progress: 'Done', result } });
    } catch (err) {
      console.error('[studio] render bench failed', err);
      useStudioStore.setState({ renderBench: { status: 'error', progress: String(err), result: null } });
    } finally {
      this.gpuSync = false;
      this.benchFrames = null;
      this.inkSamples = null;
    }
  }

  private loadBenchStrokes(count: number): void {
    this.history.clear();
    for (const s of stressStrokes(this.frame, this.now(), newId, count)) this.history.add(s);
  }

  private async sampleFrames(ms: number, gpuSync: boolean): Promise<FrameSamples> {
    this.gpuSync = gpuSync;
    const frames: FrameSamples = { interval: [], cost: [] };
    this.benchFrames = frames;
    await sleep(ms);
    this.benchFrames = null;
    this.gpuSync = false;
    return frames;
  }

  /** A medium eraser dragged across the middle of the canvas, one step per frame. */
  private async benchErase(): Promise<RenderBenchResult['erase']> {
    const strokesBefore = this.history.strokes.length;
    const y = this.frame.height / 2;
    const group = newId();
    const erase: number[] = [];
    const frames: FrameSamples = { interval: [], cost: [] };
    let last = { x: 0, y };
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const at = { x: (this.frame.width * i) / steps, y };
      const started = performance.now();
      const { removed, added } = eraseStrokes(this.history.strokes, [last, at], ERASER_RADII.m, newId);
      this.history.replace(removed, added, group);
      erase.push(performance.now() - started);
      last = at;
      this.benchFrames = frames;
      await nextFrame();
      await nextFrame();
      this.benchFrames = null;
    }
    return {
      steps,
      strokesBefore,
      strokesAfter: this.history.strokes.length,
      eraseP50: percentile(erase, 50),
      eraseP95: percentile(erase, 95),
      frameP95: percentile(frames.cost, 95),
    };
  }

  /** Rebuild time of a live stroke as it grows; it's rebuilt once per input frame while drawing. */
  private benchLive(): RenderBenchResult['live'] {
    const out: RenderBenchResult['live'] = [];
    for (const points of [100, 500, 1000, 2000]) {
      const [stroke] = stressStrokes(this.frame, this.now(), newId, 1);
      const long = {
        ...stroke!,
        points: Array.from({ length: points }, (_, i) => {
          const a = i / 40;
          return { x: 600 + Math.cos(a) * (50 + i * 0.1), y: 500 + Math.sin(a) * (50 + i * 0.1), depth: 1, t: i * 16 };
        }),
      };
      const times: number[] = [];
      for (let run = 0; run < 10; run++) {
        const started = performance.now();
        this.renderer.setLive([long]);
        times.push(performance.now() - started);
      }
      out.push({ points, rebuildMs: median(times) });
    }
    this.renderer.setLive([]);
    this.liveDirty = true;
    return out;
  }

  /** The particle system full (every slot alive), updated as one frame at a time. */
  private benchSparks(): RenderBenchResult['sparks'] {
    const sparks = this.renderer.sparks;
    for (let i = 0; i < 100; i++) sparks.emitAlong({ x: 200, y: 500 }, { x: 1100, y: 500 }, '#FFB547', 40);
    const times: number[] = [];
    for (let frame = 0; frame < 60; frame++) {
      const started = performance.now();
      sparks.update(1 / 60);
      times.push(performance.now() - started);
    }
    sparks.clear();
    return { particles: 4000, updateMs: median(times) };
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
    this.lastTrackerFrameAt = performance.now();
    this.trackRate.tick(timing.doneAt);
    this.landmarkLatency.push(timing.doneAt - timing.captureTime);
    this.mainThreadCost.push(timing.mainThreadMs);
    this.hasCaptureTime = timing.hasCaptureTime;
    this.droppedFrames = timing.droppedFrames;
    this.skippedFrames = timing.skippedFrames;
    this.frameCapture = timing.captureTime;
    this.bench?.onTrackerFrame(timing);
    this.session.push(frame);

    const aspect = this.frame.width / this.frame.height;
    // Stable per-hand ids by position; MediaPipe's handedness label isn't an identity (ADR 0004).
    const identified = this.identity.assign({ ...frame, captureTime: frame.captureTime - this.t0 }, aspect);
    this.rawPens.clear();
    for (const h of identified.hands) {
      this.rawPens.set(h.key, penSample(h.landmarks));
    }

    const filtered = this.filter.apply(identified);
    this.lastFiltered = filtered;
    this.overlayDirty = true;
    const penEvents = this.pinch.update(filtered, aspect);
    const tracked = this.pinch.status();
    const gestures = this.tools.update(filtered, aspect, this.gestureMenu.visiblePens(tracked));
    const wasOpen = this.gestureMenu.isOpen;
    const menuEvents = this.gestureMenu.update(
      filtered,
      this.frame,
      tracked,
      this.mode === 'studio' ? gestures : [],
      menuTree(useStudioStore.getState()),
      visibleCanvasRect(this.frame, this.viewport),
    );
    // No drawing while the menu is open, nor from the pinch that chose something until it releases.
    this.handleEvents(penEvents.filter((e) => !this.gestureMenu.blocks(e)));
    this.handleMenu(menuEvents, filtered, aspect);
    if (!wasOpen) this.handleGestures(gestures);
    this.frameCapture = null;
    for (const key of this.pens.keys()) if (!isPointerKey(key) && !tracked.has(key)) this.pens.delete(key);
  };

  /**
   * Ends strokes held by tracked hands and forgets per-hand state. Needed whenever
   * the input source stops: with no more frames, hand-loss detection never fires.
   */
  private finishTrackedStrokes(): void {
    this.handleEvents(this.pinch.reset(this.now()));
    this.tools.reset();
    this.gestureMenu.close();
    useStudioStore.setState({ menu: null });
    this.identity.reset();
    this.filter.reset();
    this.lastFiltered = null;
    this.rawPens.clear();
    for (const key of this.pens.keys()) if (!isPointerKey(key)) this.pens.delete(key);
    this.overlayDirty = true;
  }

  private handleEvents(events: InputEvent[]): void {
    const style = this.style();
    const paused = useStudioStore.getState().paused;
    for (const ev of events) {
      if (ev.type === 'gesture') continue;
      if (ev.type === 'strokeEnd') {
        const pen = this.pens.get(ev.handKey);
        if (pen) pen.state = 'hover';
      } else {
        this.pens.set(ev.handKey, { p: ev.p, state: ev.type === 'hover' ? 'hover' : 'drawing', color: style.color });
      }
      if (this.replay || this.mode !== 'studio') continue;
      if (paused && !isPointerKey(ev.handKey)) continue;
      // The tool is fixed for a whole stroke: switching mid-stroke takes effect on the next one.
      const erasing =
        ev.type === 'strokeStart' ? useStudioStore.getState().tool === 'erase' : this.erasing.has(ev.handKey);
      if (erasing) this.applyErase(ev);
      else this.applyBuild(this.builder.handle(ev, style, this.frame));
    }
  }

  /** One erase gesture (pinch or drag) is one undo step. */
  private applyErase(ev: InputEvent): void {
    if (ev.type === 'strokeEnd') {
      this.erasing.delete(ev.handKey);
      this.liveDirty = true;
      return;
    }
    if (ev.type !== 'strokeStart' && ev.type !== 'strokeMove') return;
    const at = viewToCanvas(ev.p, this.frame);
    const session = this.erasing.get(ev.handKey);
    const group = session?.group ?? newId();
    const path = session ? [session.last, at] : [at];
    this.erasing.set(ev.handKey, { group, last: at });
    const radius = ERASER_RADII[useStudioStore.getState().size];
    const { removed, added } = eraseStrokes(this.history.strokes, path, radius, newId);
    this.history.replace(removed, added, group);
    if (removed.length > 0) this.markInk();
  }

  private handleMenu(events: readonly MenuEvent[], filtered: HandFrame, aspect: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'open':
          // End strokes in progress, including one in its rejoin window.
          this.handleEvents(this.pinch.reset(filtered.captureTime));
          useStudioStore.setState({ helpOpen: false });
          this.publishMenu();
          break;
        case 'highlight':
        case 'level':
          this.publishMenu();
          break;
        case 'choose':
          runByGesture(e.id, this, showToast);
          break;
        case 'close':
          // The palm or fist that closed the menu mustn't fire a gesture of its own.
          this.tools.latch(filtered, aspect);
          useStudioStore.setState({ menu: null });
          break;
      }
    }
  }

  private publishMenu(): void {
    const m = this.gestureMenu.menu;
    if (!m.isOpen) return;
    useStudioStore.setState({
      menu: {
        path: m.path,
        highlight: m.highlight,
        center: canvasToScreen(m.center, this.fit),
        radius: m.radius * this.fit.scale,
      },
    });
  }

  private handleGestures(events: InputEvent[]): void {
    for (const ev of events) {
      if (ev.type !== 'gesture' || this.replay || this.mode !== 'studio') continue;
      countGesture(ev.name);
      switch (ev.name) {
        case 'undo':
          this.undo();
          showToast('Undo');
          break;
        case 'redo':
          this.redo();
          showToast('Redo');
          break;
        case 'pause':
          this.togglePause();
          break;
        case 'openMenu':
        case 'refine':
          // Counted in the stats panel; the radial menu and Refine arrive in later phases.
          break;
      }
    }
  }

  private applyBuild(r: BuildResult): void {
    if (r.kind === 'none') return;
    this.liveDirty = true;
    if (r.kind !== 'end') this.markInk();
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
    const key = pointerKey(e);
    // A mouse and a stylus share a pen: the second can't start a stroke while the first draws.
    if ([...this.activePointers.values()].includes(key)) return;
    this.els.canvas.setPointerCapture(e.pointerId);
    this.activePointers.set(e.pointerId, key);
    this.handleEvents([{ type: 'strokeStart', t: this.eventTime(e), handKey: key, p: this.pointerSample(e) }]);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.mode !== 'studio') return;
    const key = this.activePointers.get(e.pointerId);
    if (!key) {
      if (e.pointerType !== 'touch') {
        this.handleEvents([{ type: 'hover', t: this.eventTime(e), handKey: POINTER_KEY, p: this.pointerSample(e) }]);
      }
      return;
    }
    // Older Safari lacks getCoalescedEvents; fall back to the single event.
    const coalesced = 'getCoalescedEvents' in e ? e.getCoalescedEvents() : [];
    const samples = coalesced.length > 0 ? coalesced : [e];
    this.handleEvents(
      samples.map((ce) => ({
        type: 'strokeMove',
        t: this.eventTime(ce),
        handKey: key,
        p: this.pointerSample(ce),
      })),
    );
  };

  private onPointerUp = (e: PointerEvent): void => {
    const key = this.activePointers.get(e.pointerId);
    if (!key) return;
    this.activePointers.delete(e.pointerId);
    this.handleEvents([{ type: 'strokeEnd', t: this.eventTime(e), handKey: key, reason: 'release' }]);
    if (e.pointerType !== 'mouse') this.pens.delete(key);
  };

  private onDragOver = (e: DragEvent): void => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  private onDrop = (e: DragEvent): void => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (this.mode === 'intro') {
      if (useStudioStore.getState().phase !== 'intro') return;
      this.startPointer();
    }
    void this.openDrawing(file);
  };

  private onPointerLeave = (): void => {
    if (![...this.activePointers.values()].includes(POINTER_KEY)) this.pens.delete(POINTER_KEY);
  };

  // ---- frame loop ----------------------------------------------------------

  /** Ink changed because of the tracker frame being handled: time it until it's on screen. */
  private markInk(): void {
    if (this.frameCapture !== null && this.inkCapture === null) this.inkCapture = this.frameCapture;
  }

  private tick = (ts: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    const startedAt = performance.now();
    this.checkTracking(startedAt);
    // This frame starts once the last one is on screen: that completes its ink's latency.
    if (this.inkDrawn !== null) {
      this.inkLatency.push(ts - this.inkDrawn);
      this.inkSamples?.push(ts - this.inkDrawn);
      this.inkDrawn = null;
    }
    const interval = ts - this.lastFrameAt;
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
    if (this.gpuSync) this.renderer.waitForGpu();
    if (this.inkCapture !== null) {
      this.inkDrawn = this.inkCapture;
      this.inkCapture = null;
    }
    this.renderRate.tick(ts);
    this.drawCursors();
    if (this.overlayDirty) this.drawOverlay();
    const cost = performance.now() - startedAt;
    this.frameCost.push(cost);
    if (this.benchFrames) {
      this.benchFrames.interval.push(interval);
      this.benchFrames.cost.push(cost);
    }
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
    // While the menu is open, its hand shows the menu pointer (at the palm) instead of a pen.
    const menuHand = this.gestureMenu.isOpen ? this.gestureMenu.handKey : null;
    for (const [key, pen] of this.pens) if (key !== menuHand) wanted.set(key, pen);
    this.drawMenuPointer();
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
      if (pen.state !== 'raw') {
        // An eraser ring the size of what it erases, while erasing or with the eraser picked.
        const store = useStudioStore.getState();
        const erase = this.erasing.has(key) || (pen.state !== 'drawing' && store.tool === 'erase');
        el.dataset['tool'] = erase ? 'erase' : 'draw';
        if (erase) el.style.setProperty('--eraser', `${(2 * ERASER_RADII[store.size] * this.fit.scale).toFixed(1)}px`);
      }
    }
  }

  private drawMenuPointer(): void {
    const pointer = this.gestureMenu.isOpen ? this.gestureMenu.menu.pointer : null;
    if (!pointer) {
      if (this.menuPointerEl) this.menuPointerEl.hidden = true;
      return;
    }
    if (!this.menuPointerEl) {
      this.menuPointerEl = document.createElement('div');
      this.menuPointerEl.className = 'menu-pointer';
      this.els.cursors.appendChild(this.menuPointerEl);
    }
    const s = canvasToScreen(pointer, this.fit);
    this.menuPointerEl.hidden = false;
    this.menuPointerEl.style.transform = `translate3d(${String(s.x)}px, ${String(s.y)}px, 0)`;
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
        frameP50: this.frameCost.percentile(50),
        frameP95: this.frameCost.percentile(95),
        ...renderStats(this.renderer.stats()),
        mainThreadP50: this.mainThreadCost.percentile(50),
        mainThreadP95: this.mainThreadCost.percentile(95),
        hasCaptureTime: this.hasCaptureTime,
        tracker: this.tracker?.mode ?? null,
        delegate: this.tracker?.delegate ?? null,
        droppedFrames: this.droppedFrames,
        skippedFrames: this.skippedFrames,
        hands,
      },
      drawing: this.builder.activeStrokes().length > 0 || this.erasing.size > 0,
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
    this.publishMenu();
  };
}
