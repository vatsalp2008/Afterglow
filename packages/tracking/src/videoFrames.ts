export interface VideoFrameInfo {
  /** Callback time (performance timebase). */
  now: number;
  captureTime: number;
  hasCaptureTime: boolean;
  /** Cumulative frames presented but not delivered to this callback. */
  droppedFrames: number;
}

/**
 * Calls `onFrame` once per new video frame, via requestVideoFrameCallback when
 * available (with a requestAnimationFrame fallback). Returns a stop function.
 */
export function watchVideoFrames(video: HTMLVideoElement, onFrame: (info: VideoFrameInfo) => void): () => void {
  // Older Firefox and Safari lack requestVideoFrameCallback.
  const hasRvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  let running = true;
  let handle = 0;
  let lastPresented: number | null = null;
  let dropped = 0;
  let lastVideoTime = -1;

  const deliver = (now: number, meta?: VideoFrameCallbackMetadata) => {
    if (!running) return;
    if (video.readyState >= 2) {
      const capture = meta?.captureTime;
      // Guard against browsers reporting capture time in another timebase.
      const hasCaptureTime = typeof capture === 'number' && capture <= now && now - capture < 1000;
      if (meta && lastPresented !== null) dropped += Math.max(0, meta.presentedFrames - lastPresented - 1);
      if (meta) lastPresented = meta.presentedFrames;
      onFrame({ now, captureTime: hasCaptureTime ? capture : now, hasCaptureTime, droppedFrames: dropped });
    }
    schedule();
  };

  const schedule = () => {
    if (!running) return;
    if (hasRvfc) {
      handle = video.requestVideoFrameCallback(deliver);
      return;
    }
    handle = requestAnimationFrame((now) => {
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        deliver(now);
      } else schedule();
    });
  };
  schedule();

  return () => {
    running = false;
    if (hasRvfc) video.cancelVideoFrameCallback(handle);
    else cancelAnimationFrame(handle);
  };
}
