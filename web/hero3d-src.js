// Home hero: a 3D hamster running in its wheel, built entirely in code (three.js, no model files).
// Loaded on demand from app.js only on wide screens with WebGL; the SVG hero stays as the fallback.
// Method borrowed from Nyxera0x/cutaway (MIT): one reference look, measured proportions, parts as code.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, SphereGeometry, CylinderGeometry, TorusGeometry,
  CapsuleGeometry, PlaneGeometry, BoxGeometry, MeshPhysicalMaterial, MeshStandardMaterial, ShadowMaterial,
  HemisphereLight, DirectionalLight, PMREMGenerator, Color, SRGBColorSpace, ACESFilmicToneMapping,
  PCFSoftShadowMap, Vector3, BufferGeometry, LineBasicMaterial, LineSegments, Float32BufferAttribute,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const BRAND = { yellow: 0xfcbe46, blue: 0x597af7, night: 0x0a0a0c };
const R = 1.55;            // wheel radius (rung circle)
const DEPTH = 1.1;         // wheel depth along the axle
const REV_SECONDS = 2.4;   // one wheel turn, same tempo as the SVG hero
const STRIDE_HZ = 3.2;     // scurry rate

function fur(color, sheen = 0xfff1d0) {
  return new MeshPhysicalMaterial({ color, roughness: 0.78, metalness: 0, sheen: 1, sheenColor: new Color(sheen), sheenRoughness: 0.45 });
}
function ball(material, r, [x, y, z], [sx, sy, sz] = [1, 1, 1], seg = 40) {
  const m = new Mesh(new SphereGeometry(r, seg, Math.round(seg * 0.75)), material);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; return m;
}

function buildHamster() {
  const coat = fur(0xeea84a);
  const cream = fur(0xfff3e0, 0xffffff);
  const pink = new MeshPhysicalMaterial({ color: 0xf2a3a0, roughness: 0.55, sheen: 0.6, sheenColor: new Color(0xffd6d6) });
  const blush = new MeshStandardMaterial({ color: 0xff8f8f, roughness: 0.9, transparent: true, opacity: 0.55 });
  const eyeMat = new MeshPhysicalMaterial({ color: 0x0b0b10, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 });
  const glint = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 });

  const h = new Group();
  const torso = new Group(); h.add(torso);
  // Proportions measured off the SVG hero: body ~1.25 long, 0.9 tall; head ~0.6 of body height.
  torso.add(ball(coat, 1, [0, 0.46, 0], [0.64, 0.47, 0.5]));
  torso.add(ball(cream, 1, [0.12, 0.33, 0], [0.5, 0.3, 0.42]));
  torso.add(ball(coat, 0.13, [-0.62, 0.42, 0], [0.8, 0.7, 0.7], 20)); // tail nub
  const head = new Group(); head.position.set(0.52, 0.62, 0); torso.add(head);
  head.add(ball(coat, 0.39, [0, 0, 0], [1, 0.92, 0.96]));
  head.add(ball(cream, 0.21, [0.26, -0.08, 0], [0.95, 0.75, 1.15]));
  head.add(ball(pink, 0.045, [0.46, -0.03, 0], [1, 0.8, 1.1], 16));
  for (const s of [-1, 1]) {
    const eye = ball(eyeMat, 0.068, [0.25, 0.1, 0.2 * s], [0.9, 1, 1], 24); head.add(eye);
    head.add(ball(glint, 0.018, [0.31, 0.13, 0.215 * s], [1, 1, 1], 10));
    head.add(ball(blush, 0.085, [0.22, -0.08, 0.27 * s], [0.8, 0.55, 0.35], 16));
    const ear = new Group(); ear.position.set(-0.1, 0.33, 0.21 * s); ear.rotation.set(0.35 * s, 0, -0.15); head.add(ear);
    ear.add(ball(coat, 0.13, [0, 0, 0], [0.55, 1, 1], 24));
    ear.add(ball(pink, 0.09, [0.05, 0.01, 0], [0.35, 0.85, 0.85], 20));
  }
  // Whiskers: three per side, thin lines fanning back from the muzzle.
  const pts = [];
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
    const o = new Vector3(0.36, -0.07, 0.13 * s);
    pts.push(o.x, o.y, o.z, o.x + 0.06, o.y + 0.07 * k - 0.01, o.z + 0.3 * s);
  }
  const wg = new BufferGeometry(); wg.setAttribute('position', new Float32BufferAttribute(pts, 3));
  head.add(new LineSegments(wg, new LineBasicMaterial({ color: 0x5a4632, transparent: true, opacity: 0.7 })));

  // Legs pivot at the hip/shoulder so the gait reads at thumbnail size.
  const legs = [];
  const paw = new CapsuleGeometry(0.055, 0.14, 6, 12);
  const foot = new CapsuleGeometry(0.07, 0.16, 6, 12);
  for (const [x, z, geo, phase, front] of [
    [0.38, 0.17, paw, 0, true], [0.38, -0.17, paw, Math.PI, true],
    [-0.34, 0.22, foot, Math.PI, false], [-0.34, -0.22, foot, 0, false],
  ]) {
    const pivot = new Group(); pivot.position.set(x, 0.2, z); h.add(pivot);
    const limb = new Mesh(geo, pink); limb.castShadow = true;
    limb.position.set(front ? 0.02 : -0.02, -0.12, 0); limb.rotation.z = front ? 0.2 : -0.25; pivot.add(limb);
    legs.push({ pivot, phase, front });
  }
  h.userData = { torso, head, legs };
  return h;
}

function buildWheel() {
  const rimMat = new MeshPhysicalMaterial({ color: BRAND.yellow, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.15 });
  const rungMat = new MeshStandardMaterial({ color: 0xd9dce4, roughness: 0.3, metalness: 0.85 });
  const frameMat = new MeshPhysicalMaterial({ color: BRAND.blue, roughness: 0.35, metalness: 0.2, clearcoat: 0.8 });
  const wheel = new Group();
  for (const z of [-DEPTH / 2, DEPTH / 2]) {
    const rim = new Mesh(new TorusGeometry(R + 0.05, 0.06, 18, 160), rimMat); rim.position.z = z; rim.castShadow = true; wheel.add(rim);
  }
  const rungGeo = new CylinderGeometry(0.022, 0.022, DEPTH, 10);
  const N = 40;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rung = new Mesh(rungGeo, rungMat); rung.rotation.x = Math.PI / 2;
    rung.position.set(Math.cos(a) * (R + 0.04), Math.sin(a) * (R + 0.04), 0); rung.castShadow = true; wheel.add(rung);
  }
  // Spokes and hub on the back face only, so the front stays open onto the hamster.
  for (let i = 0; i < 6; i++) {
    const spoke = new Mesh(new BoxGeometry(R * 2, 0.07, 0.05), rimMat);
    spoke.position.z = -DEPTH / 2; spoke.rotation.z = (i / 6) * Math.PI; wheel.add(spoke);
  }
  const hub = new Mesh(new CylinderGeometry(0.2, 0.2, 0.14, 32), frameMat); hub.rotation.x = Math.PI / 2; hub.position.z = -DEPTH / 2 - 0.02; wheel.add(hub);

  const stand = new Group();
  const axle = new Mesh(new CylinderGeometry(0.06, 0.06, 0.4, 16), rungMat); axle.rotation.x = Math.PI / 2; axle.position.z = -DEPTH / 2 - 0.22; stand.add(axle);
  const floorY = -R - 0.32;
  for (const s of [-1, 1]) {
    const top = new Vector3(0, 0, -DEPTH / 2 - 0.4), bot = new Vector3(1.05 * s, floorY + 0.06, -DEPTH / 2 - 0.4);
    const len = top.distanceTo(bot);
    const leg = new Mesh(new CylinderGeometry(0.07, 0.07, len, 16), frameMat); leg.castShadow = true;
    leg.position.copy(top).add(bot).multiplyScalar(0.5); leg.rotation.z = Math.atan2(bot.y - top.y, bot.x - top.x) - Math.PI / 2; stand.add(leg);
    const pad = new Mesh(new CylinderGeometry(0.14, 0.16, 0.06, 24), frameMat); pad.position.copy(bot).setY(floorY + 0.03); pad.castShadow = true; stand.add(pad);
  }
  return { wheel, stand, floorY };
}

export function mount(host, { reducedMotion = false } = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
  const canvas = renderer.domElement; canvas.className = 'hero-3d'; canvas.setAttribute('aria-hidden', 'true');

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();
  scene.add(new HemisphereLight(0xffffff, 0xf3d9a6, 0.9));
  const key = new DirectionalLight(0xffffff, 2.2); key.position.set(3, 6, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 15 }); key.shadow.radius = 6;
  scene.add(key);
  const rim = new DirectionalLight(BRAND.blue, 1.1); rim.position.set(-4, 2, -3); scene.add(rim);

  const rig = new Group(); scene.add(rig);
  const { wheel, stand, floorY } = buildWheel(); rig.add(wheel, stand);
  const hamster = buildHamster(); hamster.position.set(0.05, -R + 0.03, 0.02); hamster.scale.setScalar(1.12); rig.add(hamster);
  const floor = new Mesh(new PlaneGeometry(12, 12), new ShadowMaterial({ opacity: 0.16 })); floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; floor.receiveShadow = true; rig.add(floor);

  const camera = new PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(2.7, 0.9, 7.4); camera.lookAt(0.15, -0.2, 0);
  rig.rotation.y = -0.18;

  host.appendChild(canvas);
  const size = () => { const w = host.clientWidth || 400, h = canvas.clientHeight || 280; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(() => { size(); if (!running) draw(last); }); ro.observe(host); size();

  const { torso, head, legs } = hamster.userData;
  // Cursor tracking: the hamster turns toward the pointer and runs that way; the wheel follows.
  // Far away = full sprint, close = it slows, sits up and just watches. No pointer yet = runs right.
  const pointer = { x: null, y: null };
  const hamPos = new Vector3();
  const state = { facing: 1, yaw: 0, speed: 1, wheelAngle: 0, stride: 0, lookX: 0, lookY: 0 };
  const steer = (dt) => {
    let want = 1, speed = 1, lookX = 0, lookY = 0;
    if (pointer.x !== null) {
      const rect = canvas.getBoundingClientRect();
      hamster.getWorldPosition(hamPos).project(camera);
      const hx = rect.left + (hamPos.x + 1) / 2 * rect.width, hy = rect.top + (1 - hamPos.y) / 2 * rect.height;
      const dx = pointer.x - hx, dy = pointer.y - hy;
      want = dx >= 0 ? 1 : -1;
      speed = Math.min(1.4, Math.max(0, (Math.abs(dx) - 50) / 320));
      lookX = Math.max(-1, Math.min(1, dx / 400)); lookY = Math.max(-1, Math.min(1, -dy / 300));
    }
    const k = 1 - Math.exp(-dt * 6);
    state.facing += (want - state.facing) * k;               // -1..1, eased turn-around
    state.speed += (speed - state.speed) * (1 - Math.exp(-dt * 3));
    state.lookX += (lookX - state.lookX) * k; state.lookY += (lookY - state.lookY) * k;
    state.wheelAngle -= Math.sign(state.facing || 1) * state.speed * dt * (Math.PI * 2 / REV_SECONDS);
    state.stride += state.speed * dt * STRIDE_HZ * Math.PI * 2;
  };
  const pose = (t, dt) => {
    steer(dt);
    wheel.rotation.z = state.wheelAngle;
    hamster.rotation.y = (1 - state.facing) / 2 * -Math.PI;   // face +x or -x, turning through the camera
    const run = Math.min(1, state.speed), p = state.stride;
    torso.position.y = Math.abs(Math.sin(p)) * 0.04 * run;
    torso.rotation.z = Math.sin(p) * 0.04 * run + (1 - run) * 0.12; // sits up a little when idle
    head.rotation.z = Math.sin(p + 0.6) * 0.04 * run + state.lookY * 0.35;
    head.rotation.y = Math.sin(t * 0.7) * 0.08 * (1 - run) + 0.35 * (1 - Math.abs(state.facing)); // glances at the camera mid-turn
    for (const { pivot, phase, front } of legs) pivot.rotation.z = Math.sin(p + phase) * (front ? 0.75 : 0.6) * run;
  };
  let last = 0.9, raf = 0, running = false, visible = true, onScreen = true, prev = 0;
  const draw = (t, dt = 0) => { pose(t, dt); renderer.render(scene, camera); };
  const loop = (now) => { const dt = Math.min(0.05, prev ? (now - prev) / 1000 : 0); prev = now; last += dt; draw(last, dt); raf = requestAnimationFrame(loop); };
  const sync = () => {
    const want = !reducedMotion && visible && onScreen;
    if (want && !running) { running = true; prev = 0; raf = requestAnimationFrame(loop); }
    else if (!want && running) { running = false; cancelAnimationFrame(raf); }
  };
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }); io.observe(host);
  const onVis = () => { visible = document.visibilityState === 'visible'; sync(); }; document.addEventListener('visibilitychange', onVis);
  const onMove = (e) => { pointer.x = e.clientX; pointer.y = e.clientY; };
  const onLeave = () => { pointer.x = pointer.y = null; };
  if (!reducedMotion) { window.addEventListener('pointermove', onMove, { passive: true }); document.documentElement.addEventListener('pointerleave', onLeave); }

  draw(last); host.classList.add('is-3d'); sync();
  return {
    destroy() {
      cancelAnimationFrame(raf); running = false; io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pointermove', onMove); document.documentElement.removeEventListener('pointerleave', onLeave);
      host.classList.remove('is-3d'); canvas.remove();
      scene.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); scene.environment?.dispose?.(); renderer.dispose();
    },
  };
}
