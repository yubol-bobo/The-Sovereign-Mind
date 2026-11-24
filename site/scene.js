// The cosmos behind the whole page: every book in the list orbits a glowing "mind".
// Inner ring = the 24 mainline books. Outer rings = the shelves, grouped by direction.
// Books you have read light up. The camera follows the page as you scroll.
import * as THREE from './vendor/three.module.min.js';

const PALETTE = {
  orange: '#ff7a4d', pink: '#f07aa8', violet: '#a089ff', indigo: '#8590ff', red: '#f0665b', amber: '#f0b03a',
  brown: '#cf9763', teal: '#35bccd', jade: '#33c08d', lime: '#86c452', blue: '#5b9bf5',
};
const RINGS = [1.75, 2.85, 3.75];
const ease = (x) => 1 - Math.pow(1 - x, 3);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

/** A soft round glow, used for stars, nebulae and halos. */
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
  grad.addColorStop(0.85, 'rgba(255,240,225,0.7)');
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

const STAR_VERT = /* glsl */ `
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
  }`;
const STAR_FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uTint;
  uniform float uTintMix;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    float a = pow(core, 2.4) + 0.35 * pow(core, 8.0);
    gl_FragColor = vec4(mix(vColor, uTint, uTintMix), a * vTwinkle * uOpacity);
  }`;

export function mountScene(host, tip, { books, directions, read, theme, onPick }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 700px)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: !small, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x2a2440, 1.0);
  const key = new THREE.DirectionalLight(0xfff1e0, 1.4);
  key.position.set(4, 7, 5);
  const coreLight = new THREE.PointLight(0xff7a4d, 18, 10, 1.6);
  scene.add(hemi, key);

  // rig: where the galaxy sits on screen · spin: its rotation · world: the galaxy itself
  const rig = new THREE.Group();
  const spin = new THREE.Group();
  const world = new THREE.Group();
  world.rotation.x = 0.05;
  rig.add(spin);
  spin.add(world);
  scene.add(rig);
  coreLight.position.set(0, 0.75, 0);
  world.add(coreLight);

  const glow = glowTexture();
  const softGlow = glowTexture([[0, 0.9], [0.4, 0.3], [1, 0]]);

  /* ---------- deep field: twinkling stars ---------- */
  const N = small ? 2400 : 5200;
  const sPos = new Float32Array(N * 3);
  const sSize = new Float32Array(N);
  const sPhase = new Float32Array(N);
  const sColor = new Float32Array(N * 3);
  const tints = [new THREE.Color('#ffffff'), new THREE.Color('#ffe2c8'), new THREE.Color('#c9d8ff'), new THREE.Color('#ffd0e4')];
  for (let i = 0; i < N; i++) {
    // A shell around the galaxy, crowded toward a tilted band like a milky way.
    const u = Math.random() * Math.PI * 2;
    const band = Math.random() < 0.55;
    const v = band ? (Math.random() - 0.5) * 0.5 : Math.acos(2 * Math.random() - 1) - Math.PI / 2;
    const r = 40 + Math.random() * 120;
    const x = Math.cos(v) * Math.cos(u) * r;
    const y = Math.sin(v) * r;
    const z = Math.cos(v) * Math.sin(u) * r;
    // tilt the band
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
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: renderer.getPixelRatio() },
      uOpacity: { value: 1 },
      uTint: { value: new THREE.Color('#2a2440') },
      uTintMix: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  /* ---------- nebulae ---------- */
  const nebulae = [
    ['#ff6a3d', [-26, 8, -60], 70, 0.2],
    ['#7a4dff', [30, -6, -70], 80, 0.22],
    ['#2f6bff', [6, 22, -90], 90, 0.16],
    ['#ff4f9a', [-10, -18, -50], 50, 0.12],
    ['#ff9a4d', [0, 0.5, 0], 9, 0.18], // warm haze around the core
  ].map(([color, p, s, o]) => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow, color, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(...p);
    m.scale.set(s, s, 1);
    m.userData.base = o;
    (p[2] === 0 ? world : scene).add(m);
    return m;
  });

  /* ---------- the mind at the centre ---------- */
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.62, 1),
    new THREE.MeshStandardMaterial({ color: 0xff7a4d, emissive: 0xd9532a, emissiveIntensity: 0.7, flatShading: true, roughness: 0.4 }),
  );
  core.position.y = 0.75;
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.95, 1),
    new THREE.MeshBasicMaterial({ color: 0xffb08f, wireframe: true, transparent: true, opacity: 0.2, depthWrite: false }),
  );
  shell.position.copy(core.position);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff8a5c, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.copy(core.position);
  halo.scale.set(3.4, 3.4, 1);
  // orbiting rings of light around the core
  const orbitals = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(1.15 + i * 0.16, 0.006, 6, 120),
      new THREE.MeshBasicMaterial({ color: 0xffc2a6, transparent: true, opacity: 0.35 - i * 0.08, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    m.position.copy(core.position);
    m.rotation.set(Math.PI / 2 + (i - 1) * 0.5, i * 0.8, 0);
    return m;
  });
  world.add(core, shell, halo, ...orbitals);

  /* ---------- orbits: thin lines and drifting dust ---------- */
  const orbitMat = new THREE.LineBasicMaterial({ color: 0xffd2b8, transparent: true, opacity: 0.14, depthWrite: false });
  RINGS.forEach((r) => {
    const pts = [];
    for (let i = 0; i <= 160; i++) pts.push(new THREE.Vector3(Math.sin((i / 160) * Math.PI * 2) * r, 0, Math.cos((i / 160) * Math.PI * 2) * r));
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), orbitMat));
  });
  const D = small ? 700 : 1400;
  const dPos = new Float32Array(D * 3);
  for (let i = 0; i < D; i++) {
    const r = 1.2 + Math.pow(Math.random(), 0.8) * 4.2;
    const t = Math.random() * Math.PI * 2;
    dPos.set([Math.sin(t) * r, (Math.random() - 0.5) * 0.35 * (1 + r * 0.15) - 0.05, Math.cos(t) * r], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dustMat = new THREE.PointsMaterial({ map: glow, color: 0xffcfae, size: 0.07, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dustGeo, dustMat);
  world.add(dust);

  /* ---------- books ---------- */
  const dirColor = Object.fromEntries(directions.map((d) => [d.id, new THREE.Color(PALETTE[d.color])]));
  const geo = new THREE.BoxGeometry(0.13, 1, 0.5);
  geo.translate(0, 0.5, 0);
  const meshes = [];
  const dirAngle = {};

  const place = (list, radius, start, span) => {
    list.forEach((b, i) => {
      const a = start + (span * (i + 0.5)) / list.length;
      const rnd = Math.abs(Math.sin(b.id * 12.9898) * 43758.5453) % 1;
      const h = 0.62 + rnd * 0.34 + (b.main ? 0.12 : 0);
      const mat = new THREE.MeshStandardMaterial({ color: dirColor[b.dir], flatShading: true, roughness: 0.55, emissive: dirColor[b.dir] });
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(b.main ? 1.25 : 1, h, 1);
      m.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
      m.rotation.y = a + Math.PI / 2 + (rnd - 0.5) * 0.12;
      const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: dirColor[b.dir], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      lamp.scale.set(0.9, 0.9, 1);
      lamp.position.set(m.position.x, h * 0.55, m.position.z);
      m.userData = { book: b, lift: 0, angle: a, h, lamp, glow: 0, phase: rnd * 6.28 };
      world.add(m, lamp);
      meshes[b.id] = m;
    });
  };

  const main = books.filter((b) => b.main).sort((a, b) => a.main - b.main);
  place(main, RINGS[0], 0, Math.PI * 2);

  // Outer rings: each direction owns an arc proportional to its size, split across two rings.
  const rest = books.filter((b) => !b.main);
  let a0 = 0;
  for (const d of directions) {
    const list = rest.filter((b) => b.dir === d.id);
    const span = (list.length / rest.length) * Math.PI * 2;
    const gap = 0.05;
    const half = Math.ceil(list.length * 0.44);
    place(list.slice(0, half), RINGS[1], a0 + gap, span - gap * 2);
    place(list.slice(half), RINGS[2], a0 + gap, span - gap * 2);
    dirAngle[d.id] = a0 + span / 2;
    a0 += span;
  }

  /* ---------- shooting stars ---------- */
  const streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: streakTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  streak.scale.set(9, 0.18, 1);
  scene.add(streak);
  let shot = null;
  let nextShot = 3 + Math.random() * 4;
  const launch = () => {
    const from = new THREE.Vector3((Math.random() - 0.5) * 50, 10 + Math.random() * 14, -30 - Math.random() * 20);
    const dir = new THREE.Vector3(Math.random() < 0.5 ? 1 : -1, -0.35 - Math.random() * 0.3, 0).normalize();
    shot = { from, dir, t: 0, life: 1.1 + Math.random() * 0.5 };
    streak.material.rotation = Math.atan2(dir.y, dir.x);
  };

  /* ---------- appearance ---------- */
  let dark = theme === 'dark';
  let focus = 'all';
  const paint = (m) => {
    const b = m.userData.book;
    const isRead = read.has(b.key);
    const dim = focus !== 'all' && b.dir !== focus;
    m.userData.read = isRead;
    m.material.emissiveIntensity = isRead ? 1.1 : 0.05;
    m.material.color.copy(dirColor[b.dir]).multiplyScalar(isRead ? 1 : dark ? 0.42 : 0.85);
    m.material.transparent = dim;
    m.material.opacity = dim ? 0.12 : 1;
    m.material.needsUpdate = true;
    m.userData.lampGoal = isRead && !dim ? (dark ? 0.85 : 0.45) : 0;
  };
  const paintAll = () => {
    hemi.groundColor.set(dark ? 0x2a2440 : 0xd8cdbb);
    hemi.intensity = dark ? 1.0 : 1.8;
    const blend = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    starMat.blending = blend;
    starMat.uniforms.uTintMix.value = dark ? 0 : 0.85;
    starMat.uniforms.uOpacity.value = dark ? 1 : 0.55;
    starMat.needsUpdate = true;
    for (const n of nebulae) {
      n.material.opacity = n.userData.base * (dark ? 1 : 0.55);
      n.material.blending = blend;
      n.material.needsUpdate = true;
    }
    dustMat.color.set(dark ? 0xffcfae : 0xa87a55);
    dustMat.blending = blend;
    dustMat.needsUpdate = true;
    orbitMat.color.set(dark ? 0xffd2b8 : 0x7a5a3c);
    orbitMat.opacity = dark ? 0.14 : 0.22;
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
  let target = null; // rotation to ease toward when a direction is chosen
  let idle = 0;
  let scrollP = 0;

  const setPtr = (e) => {
    const r = host.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const pick = () => {
    if (scrollP > 0.85) return null; // once the page covers the galaxy, books aren't pickable
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(meshes.filter((m) => !m.material.transparent), false)[0];
    return hit ? hit.object : null;
  };
  host.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    target = null;
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
    const b = m.userData.book;
    const p = new THREE.Vector3(0, m.scale.y + 0.15, 0).applyMatrix4(m.matrixWorld).project(camera);
    const r = host.getBoundingClientRect();
    tip.innerHTML = '';
    const t = document.createElement('b');
    t.textContent = b.title;
    tip.append(t, b.author.replace(/（.*$/, ''));
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
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();

  /* ---------- camera path ----------
     p = 0: the hero. The galaxy sits beside the title (below it on phones), seen from a low angle.
     p = 1: one screen down. It drifts to the centre and the camera rises to look down on the orbits. */
  const cam = { r: 0, e: 0, x: 0, y: 0, ly: 0 };
  const goal = (p) => {
    const wide = aspect > 1.15;
    const k = ease(Math.min(Math.max(p, 0), 1));
    const fit = wide ? 1 : Math.max(1, 0.95 / aspect);
    const r0 = 10.6 * fit * (wide ? Math.max(1, 1.6 / aspect) : 1);
    return {
      r: r0 * (1 + 0.12 * k),
      e: 0.32 + 0.62 * k, // elevation in radians
      x: (wide ? 2.5 : 0) * (1 - k),
      y: (wide ? -0.1 : -2.3 * Math.min(1, fit / 2)) * (1 - k),
      ly: 0.25 * (1 - k),
    };
  };
  Object.assign(cam, goal(0));

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  const intro = reduce ? 1 : 0;
  let introT = intro;
  const frame = () => {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    idle += dt;
    introT = Math.min(1, introT + dt / 3.2);
    const k = ease(introT);

    // rotation: chosen direction > drag inertia > slow drift
    if (target !== null) {
      const d = Math.atan2(Math.sin(target - userRot), Math.cos(target - userRot));
      userRot += d * Math.min(1, dt * 3);
      if (Math.abs(d) < 0.002) target = null;
    } else if (!dragging) {
      userRot += vel;
      vel *= 0.94;
      if (!reduce && !hover && idle > 1.2) userRot += dt * (0.05 + scrollP * 0.04);
    }
    spin.rotation.y = userRot - (1 - k) * 2.6;

    // camera follows the scroll, with a fly-in on load and a little pointer parallax
    const g = goal(scrollP);
    for (const n of ['r', 'e', 'x', 'y', 'ly']) cam[n] = damp(cam[n], g[n], 4, dt);
    if (!reduce) {
      look.x = damp(look.x, look.tx, 2.5, dt);
      look.y = damp(look.y, look.ty, 2.5, dt);
    }
    const r = cam.r * (1 + 1.9 * (1 - k));
    const e = cam.e + (1 - k) * 0.35;
    rig.position.set(cam.x, cam.y, 0);
    camera.position.set(look.x * 0.7, Math.sin(e) * r - look.y * 0.4, Math.cos(e) * r);
    camera.lookAt(look.x * 0.25, cam.ly + cam.y * 0.3, 0);
    stars.rotation.y = t * 0.004 + look.x * 0.03;
    stars.rotation.x = -look.y * 0.02 - scrollP * 0.08;
    starMat.uniforms.uTime.value = t;
    starMat.uniforms.uOpacity.value = (dark ? 1 : 0.55) * Math.min(1, t / 1.6 + 0.1);

    if (!reduce) {
      core.rotation.y = t * 0.35;
      core.rotation.x = t * 0.2;
      shell.rotation.y = -t * 0.12;
      shell.rotation.z = t * 0.05;
      core.position.y = 0.75 + Math.sin(t * 1.1) * 0.05;
      halo.position.y = shell.position.y = core.position.y;
      const pulse = 1 + Math.sin(t * 1.6) * 0.06;
      halo.scale.set(3.4 * pulse, 3.4 * pulse, 1);
      orbitals.forEach((o, i) => {
        o.rotation.z = t * (0.18 + i * 0.07) * (i % 2 ? -1 : 1);
        o.position.y = core.position.y;
      });
      dust.rotation.y = t * 0.02;
      for (const n of nebulae) n.material.rotation = t * 0.01;

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

    const h = dragging ? null : pick();
    if (h !== hover) {
      hover = h;
      if (!h) showTip(null);
    }
    if (hover) showTip(hover);
    for (const m of meshes) {
      const u = m.userData;
      u.lift = damp(u.lift, m === hover ? 0.3 : 0, 12, dt);
      m.position.y = u.lift;
      u.glow = damp(u.glow, u.lampGoal, 5, dt);
      u.lamp.material.opacity = u.glow * (reduce ? 1 : 0.8 + 0.2 * Math.sin(t * 2 + u.phase));
      u.lamp.position.y = u.lift + u.h * 0.55;
    }
    renderer.render(scene, camera);
  };
  frame();

  return {
    setRead(id, on) {
      const m = meshes[id];
      on ? read.add(m.userData.book.key) : read.delete(m.userData.book.key);
      paint(m);
      // a small celebration: the book jumps
      if (on && !reduce) m.userData.lift = 0.9;
    },
    setTheme(t) {
      dark = t === 'dark';
      paintAll();
    },
    focusDir(id) {
      focus = id;
      meshes.forEach(paint);
      if (id !== 'all') target = -dirAngle[id];
    },
    /** 0 at the top of the page, 1 one screen down. */
    setScroll(p) {
      scrollP = p;
    },
  };
}
