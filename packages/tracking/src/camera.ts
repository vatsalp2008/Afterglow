export type CameraErrorKind = 'denied' | 'notFound' | 'inUse' | 'unsupported' | 'unknown';

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

/** Maps a getUserMedia failure to a kind the UI can explain. */
export function classifyCameraError(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return new CameraError('denied', 'Camera permission denied');
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return new CameraError('notFound', 'No camera found');
  if (name === 'NotReadableError' || name === 'AbortError') return new CameraError('inUse', 'Camera is busy');
  return new CameraError('unknown', err instanceof Error ? err.message : String(err));
}

export type CameraResolution = '640x480' | '1280x720';

export const CAMERA_RESOLUTIONS: Record<CameraResolution, { width: number; height: number }> = {
  '640x480': { width: 640, height: 480 },
  '1280x720': { width: 1280, height: 720 },
};

export interface CameraOptions {
  /** A device from listCameras(); defaults to the user-facing camera. */
  deviceId?: string;
  /** Defaults to 640x480, which is plenty for hand tracking and cheapest to process. */
  resolution?: CameraResolution;
}

export function cameraConstraints(opts: CameraOptions = {}): MediaStreamConstraints {
  const { width, height } = CAMERA_RESOLUTIONS[opts.resolution ?? '640x480'];
  return {
    audio: false,
    video: {
      ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : { facingMode: 'user' }),
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: 60 },
    },
  };
}

/** Opens a camera and starts playback into `video`. */
export async function openCamera(video: HTMLVideoElement, opts: CameraOptions = {}): Promise<MediaStream> {
  // mediaDevices is only exposed in secure contexts (https or localhost).
  if (!('mediaDevices' in navigator)) {
    throw new CameraError('unsupported', 'getUserMedia is not available');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(opts));
  } catch (err) {
    throw classifyCameraError(err);
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) => video.addEventListener('loadedmetadata', () => resolve(), { once: true }));
  }
  return stream;
}

export function stopCamera(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

/** Video inputs. Browsers only reveal labels after camera permission is granted. */
export async function listCameras(): Promise<CameraDevice[]> {
  if (!('mediaDevices' in navigator)) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${String(i + 1)}` }));
}
