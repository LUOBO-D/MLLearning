import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';

/**
 * Interior 3D scenes. Each variant is a small piece of mathematics rendered
 * as a translucent surface + wireframe + glowing samples, in the welcome palette.
 * Pauses off-screen and in background tabs; renders one still frame under
 * reduced motion; falls back to `fallback` when WebGL is unavailable.
 */
export type SceneVariant =
  | 'linear-regression'
  | 'gradient-descent'
  | 'overfitting'
  | 'regularization'
  | 'logistic-regression'
  | 'model-evaluation'
  | 'decision-trees'
  | 'neural-networks'
  | 'ml-engineering'
  | 'path';

const VIOLET = new THREE.Color(0x6757e7);
const VIOLET_LIGHT = new THREE.Color(0xb3a8ff);
const LIME = new THREE.Color(0xdff18f);
const INK = new THREE.Color(0x0f1714);

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Height function z = f(x, y) on [-1, 1]² for each surface variant. */
function surfaceFor(variant: SceneVariant): (x: number, y: number) => number {
  switch (variant) {
    case 'linear-regression': return (x, y) => 0.42 * x + 0.22 * y;
    case 'gradient-descent': return (x, y) => 0.55 * ((x * 0.9 + y * 0.45) ** 2 * 2.2 + (y * 0.9 - x * 0.45) ** 2 * 0.45) - 0.5;
    case 'overfitting': return (x, y) => 0.18 * Math.sin(6.5 * x) * Math.cos(4.5 * y) + 0.25 * x;
    case 'regularization': return (x, y) => 0.5 * ((x - 0.45) ** 2 * 1.6 + (y - 0.25) ** 2) - 0.45;
    case 'logistic-regression': return (x, y) => sigmoid(5.5 * (0.85 * x + 0.5 * y)) * 0.9 - 0.45;
    case 'decision-trees': return (x, y) => (x > 0.15 ? (y > -0.3 ? 0.9 : 0.35) : (y > 0.4 ? 0.55 : 0)) + (x > 0.6 ? 0.2 : 0);
    case 'ml-engineering': return (x, y) => Math.exp(-((x - 0.45 * y - 0.1) ** 2) / 0.06) * (0.7 + 0.3 * y) - 0.3;
    case 'model-evaluation': return (x, y) => 0.75 * Math.exp(-((x + 0.38) ** 2 + y * y) / 0.11) + 0.62 * Math.exp(-((x - 0.42) ** 2 + y * y) / 0.13) - 0.4;
    default: return () => 0;
  }
}

function buildSurface(variant: SceneVariant, group: THREE.Group, disposables: { dispose(): void }[]) {
  const raw = surfaceFor(variant);
  // Normalise every surface to the same height band so all scenes frame alike.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= 40; i += 1) {
    for (let j = 0; j <= 40; j += 1) {
      const v = raw(-1 + i / 20, -1 + j / 20);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  const span = hi - lo || 1;
  const f = (x: number, y: number) => ((raw(x, y) - lo) / span - 0.5) * 1.1;
  const size = 3.2;
  const segments = 56;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i) / (size / 2);
    const y = position.getZ(i) / (size / 2);
    const z = f(x, y);
    position.setY(i, z);
    // Low = lime (good), high = violet; matches the lab loss colormap.
    tmp.copy(LIME).lerp(VIOLET, Math.min(1, (z / 1.1 + 0.5) * 1.15));
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), new THREE.LineBasicMaterial({ color: VIOLET_LIGHT, transparent: true, opacity: 0.18 }));
  // A faint floor grid gives the surface a sense of space.
  const floor = new THREE.GridHelper(size * 1.25, 14, VIOLET_LIGHT, VIOLET_LIGHT);
  (floor.material as THREE.Material).transparent = true;
  (floor.material as THREE.Material).opacity = 0.08;
  floor.position.y = -0.85;
  group.add(mesh, wire, floor);
  disposables.push(geometry, mesh.material as THREE.Material, wire.geometry, wire.material as THREE.Material, floor.geometry, floor.material as THREE.Material);
  return { f, size };
}

function addPoints(group: THREE.Group, points: THREE.Vector3[], color: THREE.Color, size: number, texture: THREE.Texture, disposables: { dispose(): void }[]) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.PointsMaterial({ color, size, map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const cloud = new THREE.Points(geometry, material);
  group.add(cloud);
  disposables.push(geometry, material);
  return cloud;
}

function addLine(group: THREE.Group, points: THREE.Vector3[], color: THREE.Color, opacity: number, disposables: { dispose(): void }[]) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geometry, material);
  group.add(line);
  disposables.push(geometry, material);
  return line;
}

export function Scene3D({ variant, className = '', fallback, label }: { variant: SceneVariant; className?: string; fallback?: ReactNode; label?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(INK, 6, 12);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    const group = new THREE.Group();
    scene.add(group);
    const disposables: { dispose(): void }[] = [];
    const texture = glowTexture();
    disposables.push(texture);
    const random = seeded(variant.length * 97 + 13);
    let animate: (t: number) => void = () => undefined;

    if (variant === 'path') {
      // Seven stages along a rising helix; the learner climbs from data to practice.
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 7 }, (_, i) => {
        const a = i * 0.95 - 2.6;
        return new THREE.Vector3(Math.cos(a) * 1.55, i * 0.36 - 1.1, Math.sin(a) * 1.0);
      }));
      const tube = new THREE.TubeGeometry(curve, 220, 0.018, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: VIOLET_LIGHT, transparent: true, opacity: 0.55 });
      group.add(new THREE.Mesh(tube, tubeMat));
      disposables.push(tube, tubeMat);
      const nodes = Array.from({ length: 7 }, (_, i) => curve.getPoint(i / 6));
      addPoints(group, nodes, LIME, 0.38, texture, disposables);
      addPoints(group, nodes, new THREE.Color(0xffffff), 0.12, texture, disposables);
      const dust = Array.from({ length: 260 }, () => new THREE.Vector3((random() - 0.5) * 6, (random() - 0.5) * 3.4, (random() - 0.5) * 3.4));
      addPoints(group, dust, VIOLET_LIGHT, 0.05, texture, disposables);
      // A traveller moving along the path.
      const traveller = addPoints(group, [new THREE.Vector3()], new THREE.Color(0xffffff), 0.3, texture, disposables);
      const travellerPos = traveller.geometry.attributes.position as THREE.BufferAttribute;
      const ringGeo = new THREE.RingGeometry(1.9, 1.91, 128);
      const ringMat = new THREE.MeshBasicMaterial({ color: VIOLET_LIGHT, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -1.2;
      group.add(ring);
      disposables.push(ringGeo, ringMat);
      camera.position.set(0, 0.1, 7.4);
      animate = (t) => {
        const p = curve.getPoint((t * 0.00006) % 1);
        travellerPos.setXYZ(0, p.x, p.y, p.z);
        travellerPos.needsUpdate = true;
      };
    } else if (variant === 'neural-networks') {
      const layers = [3, 6, 6, 2];
      const nodes = layers.map((count, l) => Array.from({ length: count }, (_, i) => new THREE.Vector3((l - 1.5) * 1.25, (i - (count - 1) / 2) * 0.42, Math.sin(i * 1.7 + l) * 0.35)));
      const edgePoints: THREE.Vector3[] = [];
      for (let l = 0; l < nodes.length - 1; l += 1) for (const a of nodes[l]) for (const b of nodes[l + 1]) edgePoints.push(a, b);
      const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePoints);
      const edgeMat = new THREE.LineBasicMaterial({ color: VIOLET_LIGHT, transparent: true, opacity: 0.16 });
      group.add(new THREE.LineSegments(edgeGeo, edgeMat));
      disposables.push(edgeGeo, edgeMat);
      nodes.forEach((layer, l) => addPoints(group, layer, l === 0 || l === nodes.length - 1 ? LIME : VIOLET_LIGHT, 0.32, texture, disposables));
      // Signals travelling forward along random edges.
      const pulses = addPoints(group, Array.from({ length: 24 }, () => new THREE.Vector3()), new THREE.Color(0xffffff), 0.14, texture, disposables);
      const pulsePos = pulses.geometry.attributes.position as THREE.BufferAttribute;
      const routes = Array.from({ length: 24 }, () => Math.floor(random() * (edgePoints.length / 2)));
      camera.position.set(0.6, 0.5, 5.2);
      animate = (t) => {
        routes.forEach((edge, i) => {
          const k = ((t * 0.0006 + i / routes.length) % 1);
          const a = edgePoints[edge * 2];
          const b = edgePoints[edge * 2 + 1];
          pulsePos.setXYZ(i, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
        });
        pulsePos.needsUpdate = true;
      };
    } else {
      const { f, size } = buildSurface(variant, group, disposables);
      const toWorld = (x: number, y: number, lift = 0) => new THREE.Vector3(x * size / 2, f(x, y) + lift, y * size / 2);
      camera.position.set(3.9, 2.9, 4.9);

      if (variant === 'linear-regression' || variant === 'overfitting' || variant === 'regularization') {
        const samples = Array.from({ length: 34 }, () => {
          const x = random() * 1.8 - 0.9;
          const y = random() * 1.8 - 0.9;
          return { x, y, z: f(x, y) + (random() - 0.5) * (variant === 'linear-regression' ? 0.35 : 0.5) };
        });
        const pts = samples.map((s) => new THREE.Vector3(s.x * size / 2, s.z, s.y * size / 2));
        addPoints(group, pts, LIME, 0.2, texture, disposables);
        if (variant === 'linear-regression') {
          samples.forEach((s, i) => { if (i % 2 === 0) addLine(group, [pts[i], toWorld(s.x, s.y)], LIME, 0.35, disposables); });
        }
        if (variant === 'regularization') {
          const ring = Array.from({ length: 97 }, (_, i) => {
            const a = (i / 96) * Math.PI * 2;
            return toWorld(Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.02);
          });
          addLine(group, ring, LIME, 0.9, disposables);
        }
      }

      if (variant === 'gradient-descent' || variant === 'regularization') {
        // Momentum-style descent path from a far corner to the minimum.
        const target = variant === 'regularization' ? { x: 0.27, y: 0.15 } : { x: 0, y: 0 };
        const path: THREE.Vector3[] = [];
        let x = -0.85;
        let y = 0.8;
        let vx = 0;
        let vy = 0;
        for (let i = 0; i < 90; i += 1) {
          const h = 1e-3;
          const gx = (f(x + h, y) - f(x - h, y)) / (2 * h);
          const gy = (f(x, y + h) - f(x, y - h)) / (2 * h);
          vx = 0.82 * vx + gx;
          vy = 0.82 * vy + gy;
          x -= 0.045 * vx;
          y -= 0.045 * vy;
          if (variant === 'regularization') { x += (target.x - x) * 0.02; y += (target.y - y) * 0.02; }
          path.push(toWorld(x, y, 0.03));
        }
        addLine(group, path, new THREE.Color(0xffffff), 0.85, disposables);
        const ball = addPoints(group, [path[0].clone()], new THREE.Color(0xffffff), 0.34, texture, disposables);
        const ballPos = ball.geometry.attributes.position as THREE.BufferAttribute;
        animate = (t) => {
          const k = Math.floor(((t * 0.02) % (path.length + 30)));
          const p = path[Math.min(path.length - 1, k)];
          ballPos.setXYZ(0, p.x, p.y, p.z);
          ballPos.needsUpdate = true;
        };
      }

      if (variant === 'logistic-regression') {
        const pos: THREE.Vector3[] = [];
        const neg: THREE.Vector3[] = [];
        for (let i = 0; i < 40; i += 1) {
          const x = (random() - 0.5) * 1.6;
          const y = (random() - 0.5) * 1.6;
          const label = 0.85 * x + 0.5 * y + (random() - 0.5) * 0.5 > 0;
          (label ? pos : neg).push(new THREE.Vector3(x * size / 2, label ? 0.62 : -0.62, y * size / 2));
        }
        addPoints(group, pos, LIME, 0.2, texture, disposables);
        addPoints(group, neg, VIOLET_LIGHT, 0.2, texture, disposables);
        // Decision boundary where σ = 0.5.
        const boundary = Array.from({ length: 30 }, (_, i) => {
          const y = -0.95 + (i / 29) * 1.9;
          const x = -0.5 * y / 0.85;
          return toWorld(x, y, 0.02);
        });
        addLine(group, boundary, new THREE.Color(0xffffff), 0.9, disposables);
      }

      if (variant === 'model-evaluation') {
        // A threshold plane sweeping across the two score hills.
        const planeGeo = new THREE.PlaneGeometry(2.6, 1.9);
        const planeMat = new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.y = Math.PI / 2;
        group.add(plane);
        const edgeGeo = new THREE.EdgesGeometry(planeGeo);
        const edgeMat = new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.6 });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.rotation.y = Math.PI / 2;
        group.add(edges);
        disposables.push(planeGeo, planeMat, edgeGeo, edgeMat);
        animate = (t) => {
          const xPos = Math.sin(t * 0.0005) * 0.8;
          plane.position.set(xPos, 0.2, 0);
          edges.position.copy(plane.position);
        };
      }
    }

    camera.lookAt(0, variant === 'path' ? -0.55 : variant === 'neural-networks' ? -0.35 : -0.62, 0);
    let width = 0;
    let height = 0;
    const resize = () => {
      width = host.clientWidth;
      height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(host);

    let pointerX = 0;
    let pointerY = 0;
    const onPointer = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    host.addEventListener('pointermove', onPointer, { passive: true });

    let visible = true;
    let frame = 0;
    const draw = (t: number) => {
      animate(t);
      group.rotation.y = (reduced ? 0.5 : t * 0.00008 + 0.5) + pointerX * 0.18;
      group.rotation.x = pointerY * 0.08;
      renderer.render(scene, camera);
    };
    const loop = (t: number) => {
      draw(t);
      if (visible && !document.hidden) frame = requestAnimationFrame(loop);
    };
    const start = () => { cancelAnimationFrame(frame); if (reduced) draw(0); else frame = requestAnimationFrame(loop); };
    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); }, { threshold: 0.01 })
      : null;
    io?.observe(host);
    const onVisibility = () => { if (!document.hidden && visible) start(); };
    document.addEventListener('visibilitychange', onVisibility);
    start();

    return () => {
      cancelAnimationFrame(frame);
      io?.disconnect();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      host.removeEventListener('pointermove', onPointer);
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [variant]);

  return (
    <div ref={hostRef} className={`scene3d ${className}`.trim()} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {failed && fallback}
    </div>
  );
}

export default Scene3D;
