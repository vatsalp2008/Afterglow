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

/** Opens the user-facing camera at 640×480 and starts playback into `video`. */
export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  // mediaDevices is only exposed in secure contexts (https or localhost).
  if (!('mediaDevices' in navigator)) {
    throw new CameraError('unsupported', 'getUserMedia is not available');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } },
    });
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
