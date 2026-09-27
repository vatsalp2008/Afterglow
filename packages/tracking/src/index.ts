// MediaPipe-backed trackers live behind the "./mediapipe" entry point so apps
// can lazy-load them; importing this entry never pulls in MediaPipe.
export {
  CAMERA_RESOLUTIONS,
  CameraError,
  cameraConstraints,
  classifyCameraError,
  listCameras,
  openCamera,
  stopCamera,
  type CameraDevice,
  type CameraErrorKind,
  type CameraOptions,
  type CameraResolution,
} from './camera';
export { FixtureTracker, type FixtureTrackerOptions, type Scheduler } from './fixtureTracker';
export { packResult, toHandFrame, type LandmarkResult } from './handFrame';
export type { FrameListener, HandTracker, TrackerTiming } from './types';
