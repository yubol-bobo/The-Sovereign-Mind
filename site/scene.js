// The cyber cosmos behind the whole page. Every book in the list is a neon-edged spine orbiting
// a glowing "mind" above a holographic floor; data streams into the core, and the camera flies
// through the system as the page moves from section to section.
// Inner ring = the 24 mainline books. Outer rings = the shelves, grouped by direction.
// Books you have read light up.
import * as THREE from './vendor/three.module.min.js';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from './vendor/postprocessing/ShaderPass.js';
import { OutputPass } from './vendor/postprocessing/OutputPass.js';
import * as GLSL from './scene-shaders.js';

// The direction colours from styles.css, lifted a step so they glow against deep space.
const PALETTE = {
  orange: '#e47b3f', pink: '#ea9bc7', violet: '#9d71cc', indigo: '#8db6ff', red: '#d26861', amber: '#d9b24f',
  brown: '#b87347', teal: '#48c2e1', jade: '#2ea374', lime: '#b6bc57', blue: '#5594e3',
};
const CYAN = new THREE.Color('#54d8f4');
const MAGENTA = new THREE.Color('#ba66e9'); // an orchid violet, softer than hot pink
const EMBER = new THREE.Color('#f18154');
const RINGS = [1.75, 2.85, 3.75];
const CORE_Y = 0.85;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const bump = (s, at) => smooth(1 - Math.abs(s - at));

/** Camera stops, one per page section: hero, the seven stars, the mainline, the library, recommend. */
const STOPS = [
  { r: 11.5, e: 0.3, az: 0, x: 2.6, y: -0.1, ly: 0.35, fov: 34 },
  { r: 7.6, e: 0.1, az: 0.75, x: 0, y: -0.2, ly: 0.8, fov: 42 },
  { r: 6.8, e: 0.82, az: -0.5, x: 0, y: 0, ly: 0.3, fov: 38 },
  { r: 12.5, e: 1.2, az: 0.25, x: 0, y: 0, ly: 0, fov: 34 },
  { r: 24, e: 0.42, az: 1.0, x: 0, y: 1.2, ly: 1.2, fov: 30 },
];
const KEYS = Object.keys(STOPS[0]);

/** A soft round glow, used for halos, lamps and dust. */
function glowTexture(stops = [[0, 1], [0.25, 0.55], [1, 0]]) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A horizontal streak that fades out to the left, for shooting stars. */
function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.85, 'rgba(200,245,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 8);
  g.lineTo(250, 5);
  g.arc(250, 8, 3, -Math.PI / 2, Math.PI / 2);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Draws the cosmos into `host`. Throws if WebGL 2 is missing or the first frame can't be drawn,
 * so the caller can fall back; later failures (a lost GPU context) are reported through onFail.
 */
export function mountScene(host, tip, { books, directions, read, theme, onPick, onFail, label }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 700px)').matches;
  const tipText = label || ((b) => ({ title: b.title, author: b.author.replace(/（.*$/, '') }));

  // three.js r170 draws with WebGL 2 only; the constructor throws if the browser can't give it one.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  let ratio = Math.min(devicePixelRatio || 1, small ? 1.25 : 1.6);
  renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 1000);
  scene.add(camera); // the hyperspace streaks ride along with it

  const hemi = new THREE.HemisphereLight(0x8fa8ff, 0x1a1030, 0.6);
  const key = new THREE.DirectionalLight(0xdfe8ff, 0.8);
  key.position.set(4, 7, 5);
  scene.add(hemi, key);

  // rig: where the galaxy sits on screen · spin: its rotation · world: the galaxy itself
  const rig = new THREE.Group();
  const spin = new THREE.Group();
  const world = new THREE.Group();
  world.rotation.x = 0.05;
  rig.add(spin);
  spin.add(world);
  scene.add(rig);

  const coreLight = new THREE.PointLight(0xf18154, 22, 12, 1.6);
  coreLight.position.set(0, CORE_Y, 0);
  const cyanLight = new THREE.PointLight(0x54d8f4, 40, 16, 1.4);
  cyanLight.position.set(-4.5, 2.6, 3);
  const magentaLight = new THREE.PointLight(0xba66e9, 40, 16, 1.4);
  magentaLight.position.set(4.5, 1.6, -3.5);
  world.add(coreLight, cyanLight, magentaLight);

  const glow = glowTexture();
  const timed = []; // shader materials with a uTime uniform
  const themed = []; // shader materials with a uLight uniform
  const additive = []; // materials that glow additively at night and blend normally by day
  const shader = (src, uniforms, opts = {}) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: src.vert,
      fragmentShader: src.frag,
      uniforms: { uTime: { value: 0 }, uLight: { value: 0 }, ...uniforms },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      ...opts,
    });
    timed.push(m);
    themed.push(m);
    if (m.blending === THREE.AdditiveBlending) additive.push(m);
    return m;
  };
  const glowMat = (color, opacity, map = glow) => {
    const m = new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    additive.push(m);
    return m;
  };

  /* ---------- sky dome: deep space and nebulae ---------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 48, 24),
    shader(GLSL.sky, {}, { side: THREE.BackSide, transparent: false, blending: THREE.NormalBlending }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  /* ---------- stars ---------- */
  const N = small ? 2200 : 5200;
  const sPos = new Float32Array(N * 3);
  const sSize = new Float32Array(N);
  const sPhase = new Float32Array(N);
  const sColor = new Float32Array(N * 3);
  const tints = [new THREE.Color(1, 1, 1), new THREE.Color(0.7, 0.92, 1), new THREE.Color(1, 0.75, 0.95), new THREE.Color(1, 0.86, 0.75)];
  for (let i = 0; i < N; i++) {
    // A shell around the galaxy, crowded toward a tilted band like a milky way.
    const u = Math.random() * Math.PI * 2;
    const band = Math.random() < 0.55;
    const v = band ? (Math.random() - 0.5) * 0.5 : Math.acos(2 * Math.random() - 1) - Math.PI / 2;
    const r = 40 + Math.random() * 150;
    const x = Math.cos(v) * Math.cos(u) * r;
    const y = Math.sin(v) * r;
    const z = Math.cos(v) * Math.sin(u) * r;
    sPos.set([x, y * Math.cos(0.5) - z * Math.sin(0.5), y * Math.sin(0.5) + z * Math.cos(0.5)], i * 3);
    sSize[i] = Math.random() < 0.04 ? 9 + Math.random() * 7 : 2.2 + Math.random() * 3.6;
    sPhase[i] = Math.random();
    const c = tints[Math.floor(Math.random() * tints.length)];
    sColor.set([c.r, c.g, c.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPhase, 1));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(sColor, 3));
  const starMat = shader(GLSL.stars, { uScale: { value: ratio }, uOpacity: { value: 0 } });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  /* ---------- hyperspace streaks for the arrival ---------- */
  const W = small ? 220 : 480;
  const wPos = new Float32Array(W * 6);
  const wEnd = new Float32Array(W * 2);
  const wSpeed = new Float32Array(W * 2);
  for (let i = 0; i < W; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.4 + Math.pow(Math.random(), 0.6) * 16;
    const seed = Math.random();
    const s = 0.6 + Math.random() * 0.8;
    wPos.set([Math.cos(a) * r, Math.sin(a) * r, seed, Math.cos(a) * r, Math.sin(a) * r, seed], i * 6);
    wEnd.set([0, 1], i * 2);
    wSpeed.set([s, s], i * 2);
  }
  const warpGeo = new THREE.BufferGeometry();
  warpGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
  warpGeo.setAttribute('aEnd', new THREE.BufferAttribute(wEnd, 1));
  warpGeo.setAttribute('aSpeed', new THREE.BufferAttribute(wSpeed, 1));
  const warpMat = shader(GLSL.warp, { uWarp: { value: reduce ? 0 : 1 } });
  const warp = new THREE.LineSegments(warpGeo, warpMat);
  warp.frustumCulled = false;
  camera.add(warp);

  /* ---------- the holographic floor ---------- */
  const gridMat = shader(
    GLSL.grid,
    {
      uIntro: { value: reduce ? 1 : 0 },
      uWave: { value: reduce ? 0 : 1 },
      uColA: { value: CYAN.clone() },
      uColB: { value: MAGENTA.clone() },
    },
    { side: THREE.DoubleSide },
  );
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), gridMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.15;
  world.add(floor);

  /* ---------- HUD rings ---------- */
  const holo = (inner, outer, color, seg, speed, dash, opacity) => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 192, 1),
      shader(
        GLSL.holo,
        {
          uColor: { value: color.clone() },
          uSeg: { value: seg },
          uSpeed: { value: reduce ? speed * 0.2 : speed },
          uDash: { value: dash },
          uOpacity: { value: opacity },
          uInner: { value: inner },
          uOuter: { value: outer },
        },
        { side: THREE.DoubleSide },
      ),
    );
    m.userData.opacity = opacity;
    return m;
  };
  // orbit tracks under the three rings, a compass ring outside them, and a faint far ring
  const tracks = [
    ...RINGS.map((r, i) => holo(r - 0.025, r + 0.025, i ? CYAN : EMBER, 48 + i * 24, 0.01 * (i % 2 ? -1 : 1), 0.35, 0.55)),
    holo(4.55, 4.72, MAGENTA, 120, 0.008, 0.55, 0.6),
    holo(6.2, 6.24, CYAN, 36, -0.004, 0.2, 0.35),
  ];
  for (const t of tracks) {
    t.rotation.x = -Math.PI / 2;
    t.position.y = -0.01;
    world.add(t);
  }

  /* ---------- the mind at the centre ---------- */
  const mind = new THREE.Group();
  mind.position.y = CORE_Y;
  world.add(mind);
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.MeshStandardMaterial({ color: 0xf18154, emissive: 0xe6653c, emissiveIntensity: 2.2, flatShading: true, roughness: 0.35, metalness: 0.2 }),
  );
  const wireA = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.85, 1),
    new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(1.8), wireframe: true, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  const wireB = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.05, 0),
    new THREE.MeshBasicMaterial({ color: MAGENTA.clone().multiplyScalar(1.6), wireframe: true, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  additive.push(wireA.material, wireB.material);
  const field = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 48, 32),
    shader(GLSL.fresnel, { uPower: { value: 2.6 }, uOpacity: { value: 0.9 }, uColA: { value: CYAN.clone() }, uColB: { value: MAGENTA.clone() } }),
  );
  const halo = new THREE.Sprite(glowMat(0xf39a72, 0.7));
  halo.scale.set(3.8, 3.8, 1);
  const hud = [
    [holo(1.42, 1.47, CYAN, 48, 0.06, 0.35, 0.9), [Math.PI / 2 + 0.35, 0, 0.2]],
    [holo(1.62, 1.66, MAGENTA, 12, -0.04, 0.5, 0.7), [Math.PI / 2 - 0.45, 0.6, 0]],
    [holo(1.86, 1.89, CYAN, 90, 0.02, 0.6, 0.5), [Math.PI / 2, 0, 0]],
  ].map(([m, r]) => {
    m.rotation.set(...r);
    return m;
  });
  mind.add(core, wireA, wireB, field, halo, ...hud);

  // a column of light through the mind
  const beams = [
    [0.05, new THREE.Color(1, 0.78, 0.62), 0.9],
    [0.32, CYAN, 0.32],
  ].map(([w, color, opacity]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(w, w, 36, 24, 1, true), shader(GLSL.beam, { uColor: { value: color.clone() }, uOpacity: { value: 0 } }));
    m.userData.opacity = opacity;
    mind.add(m);
    return m;
  });

  /* ---------- dust and data streams ---------- */
  const D = small ? 700 : 1400;
  const dPos = new Float32Array(D * 3);
  for (let i = 0; i < D; i++) {
    const r = 1.2 + Math.pow(Math.random(), 0.8) * 4.4;
    const t = Math.random() * Math.PI * 2;
    dPos.set([Math.sin(t) * r, (Math.random() - 0.5) * 0.4 * (1 + r * 0.15) - 0.05, Math.cos(t) * r], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dustMat = new THREE.PointsMaterial({ map: glow, color: 0x9fdcff, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  additive.push(dustMat);
  const dust = new THREE.Points(dustGeo, dustMat);
  world.add(dust);

  const F = small ? 900 : 2000;
  const fPos = new Float32Array(F * 3);
  const fColor = new Float32Array(F * 3);
  const fSpeed = new Float32Array(F);
  for (let i = 0; i < F; i++) {
    const r0 = Math.random() < 0.85 ? RINGS[i % 3] + (Math.random() - 0.5) * 0.4 : 4.6;
    fPos.set([Math.random() * Math.PI * 2, r0, Math.random()], i * 3);
    const x = Math.random();
    const c = x < 0.5 ? CYAN : x < 0.85 ? MAGENTA : EMBER;
    fColor.set([c.r, c.g, c.b], i * 3);
    fSpeed[i] = 0.05 + Math.random() * 0.09;
  }
  const flowGeo = new THREE.BufferGeometry();
  flowGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  flowGeo.setAttribute('aColor', new THREE.BufferAttribute(fColor, 3));
  flowGeo.setAttribute('aSpeed', new THREE.BufferAttribute(fSpeed, 1));
  const flowMat = shader(GLSL.streams, { uScale: { value: ratio }, uCoreY: { value: CORE_Y }, uOn: { value: 0 } });
  const flow = new THREE.Points(flowGeo, flowMat);
  flow.frustumCulled = false;
  world.add(flow);

  /* ---------- books ---------- */
  const dirColor = Object.fromEntries(directions.map((d) => [d.id, new THREE.Color(PALETTE[d.color])]));
  const geo = new THREE.BoxGeometry(0.13, 1, 0.5);
  geo.translate(0, 0.5, 0);
  const edgeGeo = new THREE.EdgesGeometry(geo);
  const meshes = [];
  const dirAngle = {};
  const sectors = {};

  const place = (list, ring, start, span) => {
    const radius = RINGS[ring];
    list.forEach((b, i) => {
      const a = start + (span * (i + 0.5)) / list.length;
      const rnd = Math.abs(Math.sin(b.id * 12.9898) * 43758.5453) % 1;
      const h = 0.62 + rnd * 0.34 + (b.main ? 0.12 : 0);
      const mat = new THREE.MeshStandardMaterial({ color: dirColor[b.dir], flatShading: true, roughness: 0.3, metalness: 0.7, emissive: dirColor[b.dir] });
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(b.main ? 1.25 : 1, h, 1);
      m.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
      m.rotation.y = a + Math.PI / 2 + (rnd - 0.5) * 0.12;
      const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: dirColor[b.dir], transparent: true, depthWrite: false }));
      m.add(edges);
      const lamp = new THREE.Sprite(glowMat(dirColor[b.dir], 0));
      lamp.scale.set(0.9, 0.9, 1);
      lamp.position.set(m.position.x, h * 0.55, m.position.z);
      const turn = (((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
      m.userData = { book: b, edges, lamp, h, lift: 0, glow: 0, flash: 0, phase: rnd * 6.28, delay: 0.3 + turn * 0.32 + ring * 0.05 };
      world.add(m, lamp);
      meshes[b.id] = m;
    });
  };

  const main = books.filter((b) => b.main).sort((a, b) => a.main - b.main);
  place(main, 0, 0, Math.PI * 2);

  // Outer rings: each direction owns an arc proportional to its size, split across two rings,
  // with a glowing sector on the floor beneath it.
  const rest = books.filter((b) => !b.main);
  let a0 = 0;
  for (const d of directions) {
    const list = rest.filter((b) => b.dir === d.id);
    const span = (list.length / rest.length) * Math.PI * 2;
    const gap = 0.05;
    const half = Math.ceil(list.length * 0.44);
    place(list.slice(0, half), 1, a0 + gap, span - gap * 2);
    place(list.slice(half), 2, a0 + gap, span - gap * 2);
    dirAngle[d.id] = a0 + span / 2;
    const sm = new THREE.MeshBasicMaterial({ color: dirColor[d.id].clone().multiplyScalar(1.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    additive.push(sm);
    // RingGeometry measures angles from +x; laid flat, a book's angle a sits at theta = a - 90°.
    const sector = new THREE.Mesh(new THREE.RingGeometry(RINGS[1] - 0.42, RINGS[2] + 0.42, 32, 1, a0 + gap - Math.PI / 2, span - gap * 2), sm);
    sector.rotation.x = -Math.PI / 2;
    sector.position.y = -0.02;
    world.add(sector);
    sectors[d.id] = sector;
    a0 += span;
  }

  /* ---------- shooting stars ---------- */
  const streak = new THREE.Sprite(glowMat(0xffffff, 0, streakTexture()));
  streak.scale.set(9, 0.18, 1);
  scene.add(streak);
  let shot = null;
  let nextShot = 4 + Math.random() * 4;
  const launch = () => {
    const from = new THREE.Vector3((Math.random() - 0.5) * 50, 10 + Math.random() * 14, -30 - Math.random() * 20);
    const dir = new THREE.Vector3(Math.random() < 0.5 ? 1 : -1, -0.35 - Math.random() * 0.3, 0).normalize();
    shot = { from, dir, t: 0, life: 1.1 + Math.random() * 0.5 };
    streak.material.rotation = Math.atan2(dir.y, dir.x);
  };

  /* ---------- post-processing: bloom, then the cyber pass ---------- */
  // HDR targets need float colour buffers; without them bloom still works, just clipped at white.
  const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: small ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(GLSL.sanitize));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1.05, 0.6, 0.62);
  composer.addPass(bloom);
  const cyber = new ShaderPass(GLSL.post);
  cyber.uniforms.uRes.value = new THREE.Vector2(1, 1);
  composer.addPass(cyber);
  composer.addPass(new OutputPass());

  /* ---------- appearance ---------- */
  let dark = theme === 'dark';
  let focus = 'all';
  const paint = (m) => {
    const u = m.userData;
    const b = u.book;
    const isRead = read.has(b.key);
    const dim = focus !== 'all' && b.dir !== focus;
    const c = dirColor[b.dir];
    u.read = isRead;
    u.base = isRead ? (dark ? 2.4 : 0.9) : dark ? 0.16 : 0.04;
    m.material.color.copy(c).multiplyScalar(dark ? (isRead ? 0.5 : 0.1) : isRead ? 1 : 0.8);
    m.material.metalness = dark ? 0.7 : 0.2;
    m.material.transparent = dim;
    m.material.opacity = dim ? 0.1 : 1;
    m.material.needsUpdate = true;
    u.edges.material.color.copy(c).multiplyScalar(dark ? (isRead ? 3.2 : 1.4) : 0.8);
    u.edges.material.opacity = dim ? 0.12 : 1;
    u.edges.material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    u.edges.material.needsUpdate = true;
    u.lampGoal = isRead && !dim ? (dark ? 0.85 : 0.4) : 0;
  };
  const paintAll = () => {
    for (const m of themed) m.uniforms.uLight.value = dark ? 0 : 1;
    for (const m of additive) {
      m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.needsUpdate = true;
    }
    hemi.intensity = dark ? 0.6 : 1.8;
    hemi.groundColor.set(dark ? 0x1a1030 : 0xd8cdbb);
    key.intensity = dark ? 0.8 : 1.6;
    renderer.toneMappingExposure = dark ? 1.05 : 1.15;
    // by day only real highlights bloom, and gently
    bloom.strength = dark ? 1.05 : 0.35;
    bloom.threshold = dark ? 0.62 : 1.1;
    cyber.uniforms.uLight.value = dark ? 0 : 1;
    dustMat.color.set(dark ? 0x9fdcff : 0x5a6f9a);
    meshes.forEach(paint);
  };
  paintAll();

  /* ---------- interaction ---------- */
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2(9, 9);
  const look = { x: 0, y: 0, tx: 0, ty: 0 }; // pointer parallax
  let hover = null;
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let vel = 0;
  let userRot = 0;
  let turnTo = null; // rotation to ease toward when a direction is chosen
  let idle = 0;
  let stage = 0;
  let glitch = reduce ? 0 : -1; // -1: the arrival glitch hasn't played yet

  const setPtr = (e) => {
    const r = host.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const pick = () => {
    if (stage > 0.7) return null; // once the page covers the galaxy, books aren't pickable
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(meshes.filter((m) => !m.material.transparent), false)[0];
    return hit ? hit.object : null;
  };
  host.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    turnTo = null;
    host.setPointerCapture(e.pointerId);
  });
  host.addEventListener('pointermove', (e) => {
    setPtr(e);
    if (dragging) {
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      vel = dx * 0.006;
      userRot += vel;
    }
    idle = 0;
  });
  host.addEventListener('pointerup', (e) => {
    dragging = false;
    if (moved < 6) {
      setPtr(e);
      const m = pick();
      if (m) onPick(m.userData.book.id);
    }
  });
  host.addEventListener('pointerleave', () => {
    ptr.set(9, 9);
    dragging = false;
  });
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      look.tx = (e.clientX / innerWidth) * 2 - 1;
      look.ty = (e.clientY / innerHeight) * 2 - 1;
    },
    { passive: true },
  );

  const showTip = (m) => {
    if (!m) {
      tip.hidden = true;
      host.style.cursor = '';
      return;
    }
    const { title, author } = tipText(m.userData.book);
    const p = new THREE.Vector3(0, 1.15, 0).applyMatrix4(m.matrixWorld).project(camera);
    const r = host.getBoundingClientRect();
    tip.innerHTML = '';
    const t = document.createElement('b');
    t.textContent = title;
    tip.append(t, author);
    tip.style.left = `${Math.min(Math.max(((p.x + 1) / 2) * r.width, 90), r.width - 90)}px`;
    tip.style.top = `${Math.max(((1 - p.y) / 2) * r.height, 90)}px`;
    tip.hidden = false;
    host.style.cursor = 'pointer';
  };

  /* ---------- sizing ---------- */
  let aspect = 1;
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    cyber.uniforms.uRes.value.set(w * ratio, h * ratio);
    starMat.uniforms.uScale.value = flowMat.uniforms.uScale.value = ratio;
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();

  /* ---------- camera path: one stop per section, eased between ---------- */
  const goal = (s) => {
    const c = Math.min(Math.max(s, 0), STOPS.length - 1);
    const i = Math.min(STOPS.length - 2, Math.floor(c));
    const f = smooth(c - i);
    const g = {};
    for (const k of KEYS) g[k] = STOPS[i][k] + (STOPS[i + 1][k] - STOPS[i][k]) * f;
    const wide = aspect > 1.15;
    g.r *= wide ? Math.max(1, 1.6 / aspect) : Math.max(1, 0.95 / aspect);
    if (!wide) {
      // phones: the galaxy sits below the title instead of beside it
      g.x = 0;
      g.y -= 1.9 * (1 - smooth(c));
    }
    return g;
  };
  const pose = goal(0);

  /* ---------- quality: step down if frames run slow ---------- */
  let level = 0;
  let perfN = 0;
  let perfSum = 0;
  const degrade = () => {
    level++;
    if (level === 1 && ratio > 1) {
      ratio = 1;
      resize();
    } else {
      bloom.enabled = false;
      level = 2;
    }
    console.info(`3D scene: lowered quality to level ${level} to keep it smooth`);
  };

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  let introT = reduce ? 1 : 0;
  const step = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime * (reduce ? 0.3 : 1);
    idle += dt;
    introT = Math.min(1, introT + dt / 3.6);
    const k = ease(introT);

    // the arrival: hyperspace, the floor unfolding, the mind igniting, books rising, a glitch
    warpMat.uniforms.uWarp.value = reduce ? 0 : 1 - smooth(introT / 0.55);
    gridMat.uniforms.uIntro.value = ease((introT - 0.12) / 0.6);
    flowMat.uniforms.uOn.value = smooth((introT - 0.55) / 0.3);
    starMat.uniforms.uOpacity.value = smooth(introT / 0.3);
    const ignite = ease((introT - 0.22) / 0.3);
    mind.scale.setScalar(Math.max(0.001, ignite));
    for (const b of beams) b.material.uniforms.uOpacity.value = b.userData.opacity * smooth((introT - 0.35) / 0.25);
    if (glitch === -1 && introT > 0.6) glitch = 0.35;
    if (glitch > 0) glitch = Math.max(0, glitch - dt);
    cyber.uniforms.uGlitch.value = glitch > 0 ? Math.min(1, glitch / 0.2) * 0.9 : 0;
    cyber.uniforms.uTime.value = t;
    for (const m of timed) m.uniforms.uTime.value = t;

    // rotation: chosen direction > drag inertia > slow drift
    if (turnTo !== null) {
      const d = Math.atan2(Math.sin(turnTo - userRot), Math.cos(turnTo - userRot));
      userRot += d * Math.min(1, dt * 3);
      if (Math.abs(d) < 0.002) turnTo = null;
    } else if (!dragging) {
      userRot += vel;
      vel *= 0.94;
      if (!hover && idle > 1.2) userRot += dt * (reduce ? 0.015 : 0.05 + stage * 0.02);
    }
    spin.rotation.y = userRot - (1 - k) * 2.6;

    // camera: glides between section stops, flies in on arrival, leans toward the pointer
    const g = goal(stage);
    for (const n of KEYS) pose[n] = damp(pose[n], g[n], 2.6, dt);
    if (!reduce) {
      look.x = damp(look.x, look.tx, 2.5, dt);
      look.y = damp(look.y, look.ty, 2.5, dt);
    }
    const r = pose.r * (1 + 3.2 * (1 - k));
    const e = pose.e + 0.45 * (1 - k);
    const az = pose.az - 1.2 * (1 - k);
    rig.position.set(pose.x, pose.y, 0);
    camera.position.set(Math.sin(az) * Math.cos(e) * r + look.x * 0.7, Math.sin(e) * r - look.y * 0.4, Math.cos(az) * Math.cos(e) * r);
    camera.lookAt(look.x * 0.25, pose.ly + pose.y * 0.3, 0);
    camera.fov = pose.fov + 18 * (1 - k);
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);
    stars.rotation.y = t * 0.004 + look.x * 0.03;
    stars.rotation.x = -look.y * 0.02 - stage * 0.04;

    // the mind
    core.rotation.set(t * 0.2, t * 0.35, 0);
    wireA.rotation.set(-t * 0.1, -t * 0.15, t * 0.05);
    wireB.rotation.set(t * 0.07, t * 0.11, 0);
    mind.position.y = CORE_Y + Math.sin(t * 1.1) * 0.05;
    const pulse = 1 + Math.sin(t * 1.6) * 0.06 + (1 - ignite) * 2;
    halo.scale.set(3.8 * pulse, 3.8 * pulse, 1);
    halo.material.opacity = (dark ? 0.7 : 0.4) + (1 - ignite) * 0.3;
    hud.forEach((h, i) => (h.rotation.z = t * (0.25 + i * 0.12) * (i % 2 ? -1 : 1)));
    dust.rotation.y = t * 0.02;

    // what each section points at: the seven stars, the mainline, the eleven sectors
    const wC = bump(stage, 1);
    const wM = bump(stage, 2);
    const wL = bump(stage, 3);
    for (const id in sectors) sectors[id].material.opacity = (dark ? 0.12 : 0.18) * Math.max(wL, 0.15) + (focus === id ? 0.2 : 0);
    tracks[0].material.uniforms.uOpacity.value = tracks[0].userData.opacity * (1 + wM * 1.5);

    if (!reduce) {
      nextShot -= dt;
      if (!shot && nextShot < 0 && dark) launch();
      if (shot) {
        shot.t += dt;
        const q = shot.t / shot.life;
        streak.position.copy(shot.from).addScaledVector(shot.dir, q * 34);
        streak.material.opacity = Math.sin(Math.min(q, 1) * Math.PI) * 0.9;
        if (q >= 1) {
          shot = null;
          streak.material.opacity = 0;
          nextShot = 5 + Math.random() * 9;
        }
      }
    }

    const h = dragging || introT < 1 ? null : pick();
    if (h !== hover) {
      hover = h;
      if (!h) showTip(null);
    }
    if (hover) showTip(hover);
    for (const m of meshes) {
      const u = m.userData;
      const b = u.book;
      const spot = (b.mark === 3 ? wC : 0) + (b.main ? wM * 0.8 : 0);
      u.lift = damp(u.lift, m === hover ? 0.3 : spot * 0.28, 10, dt);
      u.flash = Math.max(0, u.flash - dt * 1.2);
      const rise = ease((introT - u.delay) / 0.22);
      const hgt = u.h * Math.max(0.001, rise);
      m.scale.y = hgt;
      m.position.y = u.lift;
      m.material.emissiveIntensity = u.base + spot * (dark ? 1.6 : 0.5) + (m === hover ? 0.8 : 0) + u.flash * 4;
      u.glow = damp(u.glow, u.lampGoal + u.flash, 5, dt);
      u.lamp.material.opacity = u.glow * rise * (reduce ? 1 : 0.8 + 0.2 * Math.sin(t * 2 + u.phase));
      u.lamp.position.y = u.lift + hgt * 0.55;
    }

    // keep an eye on the frame rate once the arrival is over
    if (introT >= 1 && level < 2) {
      perfSum += dt;
      if (++perfN === 90) {
        if (perfSum / 90 > 1 / 40) degrade();
        perfN = perfSum = 0;
      }
    }
    composer.render(dt);
  };

  // Draw the first frame now: if WebGL can't draw this scene, mountScene throws and the page falls back.
  step();
  let failed = false;
  let lost = null;
  const fail = (err) => {
    if (failed) return;
    failed = true;
    onFail?.(err);
  };
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // let the browser hand the context back if it can
    lost = setTimeout(() => fail(new Error('WebGL context lost and not restored')), 4000);
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => clearTimeout(lost));
  const frame = () => {
    if (failed) return;
    requestAnimationFrame(frame);
    if (document.hidden || renderer.getContext().isContextLost()) return;
    try {
      step();
    } catch (err) {
      fail(err);
    }
  };
  requestAnimationFrame(frame);

  return {
    setRead(id, on) {
      const m = meshes[id];
      on ? read.add(m.userData.book.key) : read.delete(m.userData.book.key);
      paint(m);
      // a small celebration: the book jumps and flares
      if (on && !reduce) {
        m.userData.lift = 0.9;
        m.userData.flash = 1;
      }
    },
    setTheme(t) {
      dark = t === 'dark';
      paintAll();
    },
    focusDir(id) {
      focus = id;
      meshes.forEach(paint);
      if (id !== 'all') turnTo = -dirAngle[id];
      if (!reduce && glitch >= 0) glitch = 0.18;
    },
    /** Where the page is: 0 hero, 1 seven stars, 2 mainline, 3 library, 4 recommend; fractions in between. */
    setStage(s) {
      stage = s;
    },
  };
}
