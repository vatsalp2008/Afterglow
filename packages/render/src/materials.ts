// Stroke shaders. Neon is additive and HDR (values above 1 feed the bloom);
// ink is a matte, normally blended stroke drawn after bloom.
// Both fade per vertex: brightness = exp(-age / tau), so a stroke's tail dims
// first, like the afterimage of a moving light. tau = 0 keeps strokes fixed.
// Points timed after "now" aren't drawn yet: strokes timed ahead draw themselves in as
// the clock reaches them, which is how refined art appears (ADR 0016).

import { AdditiveBlending, DoubleSide, NormalBlending, ShaderMaterial } from 'three';

export interface FadeUniforms {
  uNow: { value: number };
  uFadeTau: { value: number };
}

export function createFadeUniforms(): FadeUniforms {
  return { uNow: { value: 0 }, uFadeTau: { value: 0 } };
}

const vertexShader = /* glsl */ `
  uniform float uNow;
  uniform float uFadeTau;
  attribute float aAcross;
  attribute float aTime;
  attribute float aBright;
  attribute vec3 aColor;
  varying float vAcross;
  varying float vFade;
  varying float vBright;
  varying vec3 vColor;
  varying float vDue;
  void main() {
    vAcross = aAcross;
    vDue = aTime <= uNow ? 1.0 : 0.0;
    float age = max(uNow - aTime, 0.0);
    vFade = uFadeTau > 0.0 ? exp(-age / uFadeTau) : 1.0;
    vBright = aBright;
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const neonFragment = /* glsl */ `
  uniform float uIntensity;
  varying float vAcross;
  varying float vFade;
  varying float vBright;
  varying vec3 vColor;
  varying float vDue;
  void main() {
    if (vDue < 0.5) discard;
    float d = abs(vAcross);
    float core = 1.0 - smoothstep(0.0, 0.45, d);
    float body = 1.0 - smoothstep(0.2, 1.0, d);
    vec3 col = vColor * body * 1.5 + vec3(1.0, 0.95, 0.88) * core * core * 1.2;
    gl_FragColor = vec4(col * vFade * vBright * uIntensity, 1.0);
  }
`;

// A lit ribbon: bright rims and a softer middle, so it reads as a band of light that turns.
const ribbonFragment = /* glsl */ `
  varying float vAcross;
  varying float vFade;
  varying float vBright;
  varying vec3 vColor;
  varying float vDue;
  void main() {
    if (vDue < 0.5) discard;
    float d = abs(vAcross);
    float rim = smoothstep(0.55, 1.0, d);
    vec3 col = vColor * (0.7 + 1.1 * rim) + vec3(1.0, 0.95, 0.88) * rim * rim * 0.5;
    gl_FragColor = vec4(col * vFade * vBright, 1.0);
  }
`;

const inkFragment = /* glsl */ `
  varying float vAcross;
  varying float vFade;
  varying float vBright;
  varying vec3 vColor;
  varying float vDue;
  void main() {
    if (vDue < 0.5) discard;
    float d = abs(vAcross);
    float a = 1.0 - smoothstep(0.75, 1.0, d);
    gl_FragColor = vec4(vColor * 0.7, a * vFade);
  }
`;

export function createNeonMaterial(fade: FadeUniforms, intensity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...fade, uIntensity: { value: intensity } },
    vertexShader,
    fragmentShader: neonFragment,
    blending: AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function createRibbonMaterial(fade: FadeUniforms): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...fade },
    vertexShader,
    fragmentShader: ribbonFragment,
    blending: AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function createInkMaterial(fade: FadeUniforms): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...fade },
    vertexShader,
    fragmentShader: inkFragment,
    blending: NormalBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
}
