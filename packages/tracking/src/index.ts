// The MediaPipe-backed tracker lives behind the "./mediapipe" entry point so
// apps can lazy-load it; importing this entry never pulls in MediaPipe.
export { CameraError, classifyCameraError, openCamera, stopCamera, type CameraErrorKind } from './camera';
export { toHandFrame } from './handFrame';
export type { FrameListener, MediaPipeHandTracker, TrackerTiming } from './handTracker';
