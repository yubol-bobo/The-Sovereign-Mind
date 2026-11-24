// The 3D study: every book in the list stands on a circular shelf around a low-poly core.
// Inner ring = the 24 mainline books. Outer rings = the shelves, grouped by direction.
// Books you have read light up.
import * as THREE from './vendor/three.module.min.js';

const PALETTE = {
  orange: '#ff7a4d', pink: '#f07aa8', violet: '#a089ff', indigo: '#8590ff', red: '#f0665b', amber: '#f0b03a',
  brown: '#cf9763', teal: '#35bccd', jade: '#33c08d', lime: '#86c452', blue: '#5b9bf5',
};

export function mountScene(host, tip, { books, directions, read, theme, onPick }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 3.5, 9.4);
  camera.lookAt(0, 0.1, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x2a2440, 1.1);
  const key = new THREE.DirectionalLight(0xfff1e0, 1.6);
  key.position.set(4, 7, 5);
  const coreLight = new THREE.PointLight(0xff7a4d, 14, 9, 1.6);
  coreLight.position.set(0, 0.7, 0);
  scene.add(hemi, key, coreLight);

  const world = new THREE.Group();
  world.rotation.x = 0.06;
  scene.add(world);

  /* core: a faceted "mind" with a wire shell */
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.62, 1),
    new THREE.MeshStandardMaterial({ color: 0xff7a4d, emissive: 0xd9532a, emissiveIntensity: 0.55, flatShading: true, roughness: 0.45 }),
  );
  core.position.y = 0.75;
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.92, 1),
    new THREE.MeshBasicMaterial({ color: 0xffb08f, wireframe: true, transparent: true, opacity: 0.22 }),
  );
  shell.position.copy(core.position);
  world.add(core, shell);

  /* shelves: three thin discs */
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x2b2938, roughness: 0.9, flatShading: true });
  const RINGS = [1.75, 2.85, 3.75];
  RINGS.forEach((r) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.3, r + 0.3, 72), shelfMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.01;
    world.add(m);
  });

  /* books */
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
      const mat = new THREE.MeshStandardMaterial({ color: dirColor[b.dir], flatShading: true, roughness: 0.62, emissive: dirColor[b.dir] });
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(b.main ? 1.25 : 1, h, 1);
      m.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
      m.rotation.y = a + Math.PI / 2 + (rnd - 0.5) * 0.12;
      m.userData = { book: b, lift: 0, angle: a };
      world.add(m);
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

  /* dust */
  const N = 220;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 2 + Math.random() * 5;
    const t = Math.random() * Math.PI * 2;
    pos.set([Math.cos(t) * r, Math.random() * 4.5 - 0.5, Math.sin(t) * r], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd9c2, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(dust);

  /* appearance */
  let dark = theme === 'dark';
  let focus = 'all';
  const paint = (m) => {
    const b = m.userData.book;
    const isRead = read.has(b.id);
    const dim = focus !== 'all' && b.dir !== focus;
    m.material.emissiveIntensity = isRead ? 0.9 : 0.03;
    m.material.color.copy(dirColor[b.dir]).multiplyScalar(isRead ? 1 : dark ? 0.36 : 0.8);
    m.material.transparent = dim;
    m.material.opacity = dim ? 0.16 : 1;
    m.material.needsUpdate = true;
  };
  const paintAll = () => {
    shelfMat.color.set(dark ? 0x2b2938 : 0xe7dfd2);
    hemi.groundColor.set(dark ? 0x2a2440 : 0xd8cdbb);
    hemi.intensity = dark ? 1.1 : 1.7;
    dust.material.color.set(dark ? 0xffd9c2 : 0xc9a27e);
    meshes.forEach(paint);
  };
  paintAll();

  /* interaction */
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2(9, 9);
  let hover = null;
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let vel = 0;
  let target = null; // rotation to ease toward when a direction is chosen
  let idle = 0;

  const setPtr = (e) => {
    const r = host.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const pick = () => {
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
      world.rotation.y += vel;
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
    tip.style.top = `${Math.max(((1 - p.y) / 2) * r.height, 60)}px`;
    tip.hidden = false;
    host.style.cursor = 'pointer';
  };

  /* sizing */
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole outer ring in frame on narrow cards.
    const fit = Math.max(1, 1.62 / camera.aspect);
    camera.position.set(0, 3.5 * fit, 9.4 * fit);
    camera.lookAt(0, 0.1, 0);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();

  /* loop — pauses when the hero is off screen */
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(host);
  const clock = new THREE.Clock();
  const frame = () => {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    idle += dt;

    if (target !== null) {
      const d = Math.atan2(Math.sin(target - world.rotation.y), Math.cos(target - world.rotation.y));
      world.rotation.y += d * Math.min(1, dt * 3.5);
      if (Math.abs(d) < 0.002) target = null;
    } else if (!dragging) {
      world.rotation.y += vel;
      vel *= 0.93;
      if (!reduce && !hover && idle > 1.2) world.rotation.y += dt * 0.07;
    }

    if (!reduce) {
      core.rotation.y = t * 0.35;
      core.rotation.x = t * 0.2;
      shell.rotation.y = -t * 0.12;
      core.position.y = 0.75 + Math.sin(t * 1.1) * 0.05;
      dust.rotation.y = t * 0.015;
    }

    const h = dragging ? null : pick();
    if (h !== hover) {
      hover = h;
      if (!h) showTip(null);
    }
    if (hover) showTip(hover);
    for (const m of meshes) {
      const goal = m === hover ? 0.28 : 0;
      m.userData.lift += (goal - m.userData.lift) * Math.min(1, dt * 12);
      m.position.y = m.userData.lift;
    }
    renderer.render(scene, camera);
  };
  frame();

  return {
    setRead(id, on) {
      on ? read.add(id) : read.delete(id);
      paint(meshes[id]);
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
  };
}
