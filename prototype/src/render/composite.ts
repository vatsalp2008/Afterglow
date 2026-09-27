// Final composite: darkroom-treated video (or plain night background) plus the
// bloomed light layer. The video is cover-fit and mirrored here, so it lines up
// with canvas space exactly like the strokes do.

import { Color, Vector2, type Texture } from 'three';

export const CompositeShader = {
  name: 'AfterglowComposite',
  uniforms: {
    tLight: { value: null as Texture | null },
    tVideo: { value: null as Texture | null },
    uHasVideo: { value: 0 },
    uVideoOpacity: { value: 1 },
    uDarkroom: { value: 1 },
    uCoverScale: { value: new Vector2(1, 1) },
    uResolution: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uGrain: { value: 1 },
    uNight: { value: new Color('#141A33') },
    uShadow: { value: new Color('#070A18') },
    uHighlight: { value: new Color('#4A5380') },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tLight;
    uniform sampler2D tVideo;
    uniform float uHasVideo;
    uniform float uVideoOpacity;
    uniform float uDarkroom;
    uniform vec2 uCoverScale;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uGrain;
    uniform vec3 uNight;
    uniform vec3 uShadow;
    uniform vec3 uHighlight;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      float vig = 1.0 - smoothstep(0.3, 1.1, length((vUv - 0.5) * aspect));
      vec3 base = uNight * mix(0.4, 1.0, vig);

      if (uHasVideo > 0.5) {
        vec2 f = (vUv - 0.5) * uCoverScale + 0.5;
        vec3 v = texture2D(tVideo, vec2(1.0 - f.x, f.y)).rgb;
        float lum = pow(clamp(dot(v, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0), 0.75);
        vec3 darkroom = mix(uShadow, uHighlight, lum);
        vec3 natural = v * 0.7;
        vec3 vid = mix(natural, darkroom, uDarkroom) * mix(0.5, 1.0, vig);
        base = mix(base, vid, uVideoOpacity);
      }

      float n = hash(floor(vUv * uResolution) + fract(uTime * 0.37) * 1000.0) - 0.5;
      base = max(base + n * uGrain * (0.004 + base * 0.3), 0.0);
      gl_FragColor = vec4(base + texture2D(tLight, vUv).rgb, 1.0);
    }
  `,
};
