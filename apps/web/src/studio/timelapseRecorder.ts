// Records the canvas while a timelapse replays, then downloads the video.

import { download, stamp } from './download';

const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

export class TimelapseRecorder {
  private recorder: MediaRecorder | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onSaved: () => void,
  ) {}

  get active(): boolean {
    return this.recorder !== null;
  }

  /** Returns false if this browser can't record the canvas. */
  start(): boolean {
    const mimeType =
      typeof MediaRecorder === 'undefined' ? undefined : MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType || typeof this.canvas.captureStream !== 'function') return false;
    const stream = this.canvas.captureStream(60);
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10_000_000 });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      for (const t of stream.getTracks()) t.stop();
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      download(new Blob(chunks, { type: mimeType }), `afterglow-timelapse-${stamp()}.${ext}`);
      this.onSaved();
    };
    rec.start(250);
    this.recorder = rec;
    return true;
  }

  stop(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
  }
}
