// Landing background: photoreal 3D fruit drifting behind the page.
// Lazy-loaded by Landing.jsx after first paint, so three.js never blocks the page.
// Models: Poly Haven photogrammetry scans (CC0, polyhaven.com), pre-optimized into public/models/*.glb with
//   npx @gltf-transform/cli optimize in.gltf out.glb --compress quantize --texture-compress webp --texture-size 512
// (welded + simplified mesh, quantized vertices, 512px WebP textures: ~185 KB each, no decoder needed at runtime).
import {
  ACESFilmicToneMapping, Box3, DirectionalLight, Group, PMREMGenerator, PerspectiveCamera, Raycaster, Scene, Vector2,
  Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Phones load only the first three.
const MODELS = ['apple', 'kiwi', 'lime', 'avocado', 'pomegranate', 'lychee'];

// [model, page fraction (0 top .. 1 bottom), x (-1..1 of half width), y in viewport (-1..1), z, scale, phone x?, phone y?]
// Hero pieces sit in its empty corners; everything below hugs the page edges so it never crosses text.
const LAYOUT = [
  ['apple', 0, -0.8, 0.6, -0.6, 1, 0.92, 0.12], // phones: beside the buttons, the one empty spot in that hero
  ['kiwi', 0, -0.32, -0.8, 0.8, 0.9],
  ['lime', 0, -0.96, -0.3, 1.2, 0.85],
  ['avocado', 0, 0.9, 0.76, -2.2, 1.15],
  ['lychee', 0, 0.02, 0.88, -1.4, 0.7],
  ['pomegranate', 0, 0.93, -0.8, 0.2, 1],
  ['kiwi', 0.14, -0.97, 0.05, 0, 0.85],
  ['lime', 0.19, 0.97, 0.35, 1, 0.8],
  ['lychee', 0.25, -0.98, -0.6, -1, 0.75],
  ['apple', 0.31, 0.98, -0.5, -1.4, 0.95],
  ['pomegranate', 0.37, -0.98, 0.45, 0.8, 0.85],
  ['avocado', 0.45, 0.97, 0.2, 0.4, 0.95],
  ['lime', 0.53, -0.97, -0.35, -0.6, 0.8],
  ['kiwi', 0.61, 0.98, 0.5, -1.6, 0.85],
  ['apple', 0.7, -0.98, 0.2, 0, 0.9],
  ['lychee', 0.78, 0.97, -0.4, 1.2, 0.75],
  ['avocado', 0.86, 0.96, 0.4, -0.4, 0.9],
  ['pomegranate', 0.92, -0.97, -0.2, 0.6, 0.85],
  ['apple', 1, -0.95, 0.5, -1, 0.9],
];

const UNIT = 1.7; // every model is normalized so its longest side is this many world units
const VIEW_HALF = Math.tan((35 / 2) * (Math.PI / 180)) * 14; // half viewport height in world units at z = 0
const DRIFT = 0.55; // the fruit scrolls at 55% of page speed, so it reads as background

export function mount(canvas, { still = false } = {}) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return () => {};
  }
  const narrow = window.innerWidth < 768;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new Scene();
  // Studio reflections from a generated room: what makes PBR scans look real rather than plastic.
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  const key = new DirectionalLight(0xfff3e4, 1.6);
  key.position.set(4, 6, 8);
  scene.add(key);

  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.z = 14;

  let w = 0; let h = 0; let aspect = 1; let travel = 0;
  const items = [];
  const placeItem = (it) => {
    // Phones: further out, peeking in from the edges (or a phone-specific spot when the layout gives one).
    const x = narrow ? (it.nx ?? Math.sign(it.x || 1) * 1.38) : it.x;
    it.baseX = x * VIEW_HALF * aspect;
    it.baseY = -it.f * travel + (narrow && it.ny != null ? it.ny : it.y) * VIEW_HALF * 0.9;
    it.obj.position.set(it.baseX, it.baseY, it.z);
  };

  const render = () => renderer.render(scene, camera);
  const resize = () => {
    w = window.innerWidth; h = window.innerHeight; aspect = w / h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    travel = (Math.max(document.documentElement.scrollHeight - h, 0) / h) * VIEW_HALF * 2 * DRIFT;
    items.forEach(placeItem);
    if (still) render();
  };

  // Load each model once; every placement is a clone sharing its geometry and textures.
  const kinds = narrow ? MODELS.slice(0, 3) : MODELS;
  const layout = LAYOUT.filter(([kind], i) => kinds.includes(kind) && (!narrow || i < 6 || i % 2 === 0));
  const loader = new GLTFLoader();
  let disposed = false;
  kinds.forEach((kind) => {
    loader.loadAsync(`${import.meta.env.BASE_URL}models/${kind}.glb`).then((gltf) => {
      if (disposed) return;
      const model = gltf.scene;
      const box = new Box3().setFromObject(model);
      const size = box.getSize(new Vector3());
      model.position.sub(box.getCenter(new Vector3()));
      const proto = new Group().add(model);
      const unit = UNIT / Math.max(size.x, size.y, size.z);
      layout.forEach(([k, f, x, y, z, s, nx, ny], i) => {
        if (k !== kind) return;
        const obj = proto.clone();
        obj.rotation.set(i * 1.3, i * 2.1, i * 0.7);
        const it = { obj, f, x, nx, ny, y, z, size: unit * s * (narrow ? 0.75 : 1), grow: still ? 1 : 0, spin: 0.1 + ((i * 37) % 10) / 70, phase: i * 1.7, boost: 0 };
        obj.scale.setScalar(it.size * it.grow);
        placeItem(it);
        scene.add(obj);
        items.push(it);
      });
      if (still) render();
    }).catch(() => {});
  });

  // Pointer: the camera leans, and fruit under the cursor gets a spin.
  let mx = 0; let my = 0;
  const ray = new Raycaster();
  const ndc = new Vector2();
  let pending = null;
  let lastPoke = 0;
  const onMove = (e) => {
    mx = e.clientX / w - 0.5; my = e.clientY / h - 0.5;
    if (e.pointerType === 'mouse') pending = e;
  };
  const poke = (t) => {
    if (!pending || t - lastPoke < 90) return; // bounding-sphere test first, triangles only near the ray
    lastPoke = t;
    ndc.set((pending.clientX / w) * 2 - 1, -(pending.clientY / h) * 2 + 1);
    pending = null;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(items.map((it) => it.obj), true)[0];
    if (!hit) return;
    let o = hit.object;
    while (o.parent && o.parent !== scene) o = o.parent;
    const it = items.find((x) => x.obj === o);
    if (it) it.boost = Math.min(it.boost + 0.1, 0.6);
  };

  let raf = 0; let last = 0; let camX = 0; let camY = 0;
  const frame = (t) => {
    const dt = Math.min((t - last) / 1000, 0.05) || 0.016;
    last = t;
    camY += (-(window.scrollY / h) * VIEW_HALF * 2 * DRIFT - camY) * 0.12;
    camX += (mx * 1.2 - camX) * 0.04;
    camera.position.set(camX, camY - my * 0.8, 14);
    camera.lookAt(camX * 0.4, camY, 0);
    poke(t);
    const s = t / 1000;
    for (const it of items) {
      const o = it.obj;
      if (it.grow < 1) {
        it.grow = Math.min(1, it.grow + dt * 1.6);
        o.scale.setScalar(it.size * (1 - (1 - it.grow) ** 3));
      }
      it.boost *= 0.97;
      o.rotation.y += (it.spin + it.boost * 8) * dt;
      o.rotation.x += it.spin * 0.3 * dt;
      o.position.y = it.baseY + Math.sin(s * 0.6 + it.phase) * 0.18;
      o.position.x = it.baseX + Math.cos(s * 0.45 + it.phase) * 0.1;
    }
    render();
    raf = requestAnimationFrame(frame);
  };

  resize();
  window.addEventListener('resize', resize);
  // Page height settles after fonts and lazy sections render.
  const ro = new ResizeObserver(resize);
  ro.observe(document.body);
  if (!still) {
    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(frame);
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      [].concat(o.material || []).forEach((m) => {
        Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
        m.dispose();
      });
    });
    env.dispose();
    renderer.dispose();
  };
}
