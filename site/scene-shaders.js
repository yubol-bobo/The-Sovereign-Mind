// GLSL for the cyber cosmos (scene.js). Kept apart so `scripts/check-shaders.mjs` can compile
// every shader with glslangValidator the way three.js wraps them (GLSL ES 3.00).
// Conventions: three.js supplies position/normal/uv, the matrices and cameraPosition, and maps
// attribute/varying/gl_FragColor/texture2D onto GLSL 3. Colours are linear; values above 1 bloom.

const NOISE = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 5; i++) {
      s += a * noise3(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return s;
  }`;

/** The sky dome: deep space with magenta, violet and cyan nebulae along a tilted galactic band. */
export const sky = {
  vert: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  frag: /* glsl */ `
    uniform float uTime;
    uniform float uLight;
    varying vec3 vDir;
    ${NOISE}
    void main() {
      vec3 d = normalize(vDir);
      float t = uTime * 0.012;
      float n1 = fbm(d * 2.2 + vec3(t, 0.0, -t));
      float n2 = fbm(d * 4.6 - vec3(0.0, t * 2.0, t) + n1);
      float band = exp(-pow((d.y * 0.9 + d.x * 0.35) * 3.0, 2.0));
      vec3 base = mix(vec3(0.008, 0.006, 0.024), vec3(0.018, 0.012, 0.055), d.y * 0.5 + 0.5);
      vec3 neb = mix(vec3(0.18, 0.09, 0.50), vec3(0.42, 0.08, 0.48), smoothstep(0.35, 0.75, n1));
      neb = mix(neb, vec3(0.03, 0.40, 0.60), smoothstep(0.45, 0.80, n2) * (0.6 + 0.4 * d.x));
      float dens = smoothstep(0.38, 0.95, n1 * 0.6 + n2 * 0.55) * (0.3 + 0.95 * band);
      vec3 night = base + neb * dens * 0.55;
      // a magenta glow along the horizon, under the grid
      night += vec3(0.24, 0.06, 0.30) * pow(max(0.0, 1.0 - abs(d.y + 0.06) * 5.0), 3.0) * 0.4;
      vec3 day = mix(vec3(0.93, 0.90, 0.87), vec3(0.86, 0.83, 0.93), d.y * 0.5 + 0.5) + neb * dens * 0.22;
      gl_FragColor = vec4(mix(night, day, uLight), 1.0);
    }`,
};

/** Twinkling stars, sized by distance. */
export const stars = {
  vert: /* glsl */ `
    attribute float aSize;
    attribute float aPhase;
    attribute vec3 aColor;
    uniform float uTime;
    uniform float uScale;
    varying vec3 vColor;
    varying float vTwinkle;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      vTwinkle = 0.55 + 0.45 * sin(uTime * (0.4 + aPhase * 1.6) + aPhase * 40.0);
      vColor = aColor;
      gl_PointSize = aSize * uScale * (40.0 / -mv.z);
    }`,
  frag: /* glsl */ `
    uniform float uOpacity;
    uniform float uLight;
    varying vec3 vColor;
    varying float vTwinkle;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float core = 1.0 - smoothstep(0.0, 0.5, d);
      float a = pow(core, 2.4) + 0.35 * pow(core, 8.0);
      vec3 c = mix(vColor * 1.6, vec3(0.16, 0.12, 0.28), uLight);
      gl_FragColor = vec4(c, a * vTwinkle * uOpacity);
    }`,
};

/** Hyperspace: streaks rushing past the camera while the scene arrives. Lives in camera space. */
export const warp = {
  vert: /* glsl */ `
    attribute float aEnd;
    attribute float aSpeed;
    uniform float uTime;
    uniform float uWarp;
    varying float vA;
    varying float vHue;
    void main() {
      float z = -84.0 + mod(position.z * 80.0 + uTime * aSpeed * 70.0, 80.0);
      z -= aEnd * (1.0 + 16.0 * uWarp) * aSpeed;
      vA = uWarp * smoothstep(-84.0, -60.0, z) * (1.0 - aEnd * 0.85);
      vHue = fract(position.z * 7.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, z, 1.0);
    }`,
  frag: /* glsl */ `
    varying float vA;
    varying float vHue;
    void main() {
      vec3 c = mix(vec3(0.40, 0.86, 0.96), vec3(0.73, 0.42, 0.92), vHue);
      gl_FragColor = vec4(c * 2.2, vA);
    }`,
};

/** The holographic floor: a square grid, polar rings on the orbits, and a shock wave every few seconds. */
export const grid = {
  vert: /* glsl */ `
    varying vec3 vL;
    void main() {
      vL = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  frag: /* glsl */ `
    uniform float uTime;
    uniform float uLight;
    uniform float uIntro;
    uniform float uWave;
    uniform vec3 uColA;
    uniform vec3 uColB;
    varying vec3 vL;
    float lines(vec2 p, float size) {
      vec2 q = p / size;
      vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
      return 1.0 - min(min(g.x, g.y), 1.0);
    }
    void main() {
      vec2 p = vL.xy; // plane coordinates, so the grid turns with the galaxy
      float r = length(p);
      float fine = lines(p, 0.5) * 0.28;
      float major = lines(p, 2.5);
      float rq = r / 1.25;
      float rings = (1.0 - min(abs(fract(rq - 0.5) - 0.5) / fwidth(rq), 1.0)) * 0.55;
      float fade = exp(-r * 0.05);
      float front = uIntro * 70.0;
      float reveal = 1.0 - smoothstep(front - 8.0, front, r);
      float w = fract(uTime * 0.16);
      float wave = exp(-pow((r - w * 46.0) * 0.8, 2.0)) * (1.0 - w) * uWave;
      vec3 col = mix(uColA, uColB, clamp(r / 28.0 + 0.12 * sin(uTime * 0.3 + r * 0.12), 0.0, 1.0));
      float a = (fine + major * 0.75 + rings) * fade;
      a += wave * fade * (0.35 + major + rings) * 1.4;
      a += exp(-r * 0.55) * 0.3;
      a *= reveal;
      float glow = mix(1.5, 0.85, uLight) * (1.0 + wave * 2.5);
      gl_FragColor = vec4(col * glow, a * mix(1.0, 0.55, uLight));
    }`,
};

/** Data streaming inward from the shelves to the mind, along spirals. */
export const streams = {
  vert: /* glsl */ `
    attribute vec3 aColor;
    attribute float aSpeed;
    uniform float uTime;
    uniform float uScale;
    uniform float uCoreY;
    uniform float uOn;
    varying vec3 vColor;
    varying float vA;
    void main() {
      float a0 = position.x;
      float r0 = position.y;
      float ph = position.z;
      float k = fract(ph + uTime * aSpeed);
      float e = k * k;
      float r = mix(r0, 0.22, e);
      float ang = a0 + e * 3.4 + uTime * 0.05;
      float y = mix(0.02, uCoreY, smoothstep(0.5, 1.0, k)) + sin(ph * 40.0 + uTime) * 0.04 * (1.0 - k);
      vec4 mv = modelViewMatrix * vec4(sin(ang) * r, y, cos(ang) * r, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = (1.4 + 3.2 * k) * uScale * (9.0 / -mv.z);
      vColor = aColor;
      vA = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.9, 1.0, k)) * uOn;
    }`,
  frag: /* glsl */ `
    uniform float uLight;
    varying vec3 vColor;
    varying float vA;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = 1.0 - smoothstep(0.1, 0.5, d);
      gl_FragColor = vec4(mix(vColor * 2.4, vColor * 0.6, uLight), a * vA);
    }`,
};

/** A flat HUD ring: dashed segments, tick marks and a bright sweep running round. */
export const holo = {
  vert: /* glsl */ `
    varying vec2 vP;
    void main() {
      vP = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  frag: /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uSeg;
    uniform float uSpeed;
    uniform float uDash;
    uniform float uOpacity;
    uniform float uInner;
    uniform float uOuter;
    uniform float uLight;
    varying vec2 vP;
    void main() {
      float ang = atan(vP.y, vP.x) / 6.2831853 + 0.5;
      float r = (length(vP) - uInner) / (uOuter - uInner);
      float seg = fract((ang + uTime * uSpeed) * uSeg);
      float dash = step(uDash, seg);
      float sweep = pow(fract(ang - uTime * uSpeed * 0.6), 7.0);
      float edge = smoothstep(0.0, 0.18, r) * (1.0 - smoothstep(0.82, 1.0, r));
      float a = (dash * 0.55 + sweep * 0.9) * edge * uOpacity;
      gl_FragColor = vec4(uColor * mix(1.6 + sweep * 2.4, 0.9, uLight), a);
    }`,
};

/** Soft glow at the silhouette of a sphere: the force field around the mind. */
export const fresnel = {
  vert: /* glsl */ `
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  frag: /* glsl */ `
    uniform float uTime;
    uniform float uPower;
    uniform float uOpacity;
    uniform vec3 uColA;
    uniform vec3 uColB;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
      vec3 c = mix(uColA, uColB, 0.5 + 0.5 * sin(uTime * 0.7 + vN.y * 3.0));
      gl_FragColor = vec4(c * (1.0 + f * 2.0), f * uOpacity);
    }`,
};

/** The column of light through the mind, with bands of data rising along it. */
export const beam = {
  vert: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  frag: /* glsl */ `
    uniform float uTime;
    uniform float uOpacity;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      float center = pow(abs(dot(normalize(vN), normalize(vV))), 2.5);
      float along = 1.0 - abs(vUv.y - 0.5) * 2.0;
      float bands = 0.65 + 0.35 * sin(vUv.y * 140.0 - uTime * 6.0);
      float a = center * pow(along, 1.6) * bands * uOpacity;
      gl_FragColor = vec4(uColor * (1.4 + center * 1.8), a);
    }`,
};

/** Final pass: chromatic edges, faint scanlines, grain, vignette and a glitch when the scene switches. */
export const post = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberr: { value: 0.012 },
    uGlitch: { value: 0 },
    uScan: { value: 0.035 },
    uVignette: { value: 0.55 },
    uLight: { value: 0 },
    uRes: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberr;
    uniform float uGlitch;
    uniform float uScan;
    uniform float uVignette;
    uniform float uLight;
    uniform vec2 uRes;
    varying vec2 vUv;
    float rnd(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec2 uv = vUv;
      if (uGlitch > 0.0) {
        float band = floor(uv.y * 28.0);
        float r = rnd(vec2(band, floor(uTime * 24.0)));
        uv.x += (r - 0.5) * 0.08 * uGlitch * step(0.72, r);
      }
      vec2 c = uv - 0.5;
      float d = dot(c, c);
      vec2 off = c * d * (uAberr + uGlitch * 0.05);
      vec4 mid = texture2D(tDiffuse, uv);
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, mid.g, texture2D(tDiffuse, uv - off).b);
      col *= 1.0 - uScan * (1.0 - uLight) * (0.5 + 0.5 * sin(uv.y * uRes.y * 1.5707963));
      col += (rnd(uv * uRes + fract(uTime)) - 0.5) * 0.025 * (1.0 - uLight);
      col *= mix(1.0, 1.0 - smoothstep(0.12, 0.9, d * 1.7), uVignette);
      gl_FragColor = vec4(col, mid.a);
    }`,
};
