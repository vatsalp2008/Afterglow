# @afterglow/tracking

Camera access and hand tracking. `@afterglow/tracking` exposes the camera helpers and the pure `toHandFrame` conversion; `@afterglow/tracking/mediapipe` exposes the MediaPipe Tasks `HandLandmarker` adapter, kept behind its own entry point so apps can lazy-load it.

Frames are driven by `requestVideoFrameCallback`, and every `HandFrame` carries the camera capture time so latency is measured from capture.
