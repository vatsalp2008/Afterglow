# End-to-end test assets

`hand-640x480.mjpeg` is fed to Chrome as a fake webcam (`--use-file-for-fake-video-capture`), so the camera path can be tested with a real hand and no camera. It's derived from `pointing_up.jpg`, a test image from Google's [MediaPipe](https://github.com/google-ai-edge/mediapipe) project (Apache License 2.0), scaled to 480 px tall, padded to 640x480, and stored as 3 identical MJPEG frames.

Regenerate it with:

```sh
curl -sO https://storage.googleapis.com/mediapipe-assets/pointing_up.jpg
ffmpeg -loop 1 -i pointing_up.jpg -frames:v 3 -vf "scale=-2:480,pad=640:480:(ow-iw)/2:0:color=0xD9D7D3" -q:v 4 -f mjpeg hand-640x480.mjpeg
```
