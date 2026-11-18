import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const PARTICLE_COUNT = 700;
const SAMPLE_COUNT = 60;
const TRAIN_COUNT = 46;

function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createRadialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,.7)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// The same two-input linear model taught in the regression chapter.
function predict(x: number, z: number) {
  return 0.34 * x - 0.22 * z;
}

const surfaceVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  void main() {
    vUv = uv;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

// Flowing caustics move across the fitted plane without changing its geometry:
// the model stays linear while the visualization makes optimization feel alive.
const surfaceFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec2 uPointer;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  void main() {
    vec2 uv = vUv;
    float time = uTime * 0.72;
    float primaryWave = sin(
      uv.x * 13.0 + uv.y * 7.0 - time * 2.2
      + sin(uv.y * 11.0 + time) * 0.75 + uPointer.x * 1.2
    );
    float ribbonBase = smoothstep(0.72, 1.0, 0.5 + 0.5 * primaryWave);
    float ribbon = ribbonBase * ribbonBase;
    float causticBase = smoothstep(
      0.76, 1.0,
      0.5 + 0.5 * sin(uv.y * 34.0 - time * 3.0 + sin(uv.x * 12.0 + time) * 1.6)
    );
    float caustic = causticBase * causticBase;
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float rim = 1.0 - smoothstep(0.0, 0.035, edge);
    vec3 normal = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    float fresnelBase = 1.0 - abs(dot(normal, normalize(vViewDirection)));
    float fresnel = fresnelBase * fresnelBase;

    vec3 deep = vec3(0.12, 0.09, 0.29);
    vec3 violet = vec3(0.43, 0.30, 0.95);
    vec3 cyan = vec3(0.24, 0.62, 0.78);
    vec3 lime = vec3(0.82, 1.0, 0.58);
    vec3 color = mix(deep, violet, 0.48 + sin(uv.x * 5.0 + time * 0.35) * 0.16);
    color = mix(color, cyan, caustic * 0.55);
    color += lime * ribbon * 0.75 + violet * rim * 0.55 + violet * fresnel * 0.35;
    float alpha = uOpacity + ribbon * 0.28 + caustic * 0.13 + rim * 0.25 + fresnel * 0.16;
    gl_FragColor = vec4(color, min(alpha, 0.88));
  }
`;

export function LandingScene({ exiting = false }: { exiting?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(exiting);
  const exitStartedRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    exitingRef.current = exiting;
    if (exiting && !exitStartedRef.current) exitStartedRef.current = performance.now();
  }, [exiting]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: window.devicePixelRatio <= 2,
        powerPreference: 'high-performance',
      });
    } catch {
      setFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.5 : 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.className = 'landing-webgl-canvas';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 4.3, 8.2);

    const world = new THREE.Group();
    world.rotation.set(-0.08, -0.38, 0.035);
    scene.add(world);

    const glowTexture = createRadialTexture();
    const glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x7358ff,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(6.4, 5.4, 1);
    glow.position.set(0, 0, -1.6);
    world.add(glow);

    // A translucent prediction plane: ŷ = 0.34x₁ - 0.22x₂.
    const surfaceGeometry = new THREE.PlaneGeometry(4.5, 3.4, 26, 20);
    surfaceGeometry.rotateX(-Math.PI / 2);
    const surfacePositions = surfaceGeometry.getAttribute('position');
    for (let index = 0; index < surfacePositions.count; index += 1) {
      const x = surfacePositions.getX(index);
      const z = surfacePositions.getZ(index);
      surfacePositions.setY(index, predict(x, z));
    }
    surfaceGeometry.computeVertexNormals();
    const surfaceMaterial = new THREE.ShaderMaterial({
      vertexShader: surfaceVertexShader,
      fragmentShader: surfaceFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.38 },
        uPointer: { value: new THREE.Vector2() },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    surface.renderOrder = 1;
    world.add(surface);

    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0xc5b8ff,
      wireframe: true,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const wire = new THREE.Mesh(surfaceGeometry, wireMaterial);
    wire.scale.set(1.002, 1.002, 1.002);
    wire.renderOrder = 2;
    world.add(wire);

    // The bright regression rule sits on the fitted plane.
    const predictionGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2.2, predict(-2.2, 0) + 0.035, 0),
      new THREE.Vector3(2.2, predict(2.2, 0) + 0.035, 0),
    ]);
    const predictionMaterial = new THREE.LineBasicMaterial({
      color: 0xe3ffae,
      transparent: true,
      opacity: 0.94,
      toneMapped: false,
    });
    const predictionLine = new THREE.Line(predictionGeometry, predictionMaterial);
    predictionLine.renderOrder = 4;
    world.add(predictionLine);
    const predictionGlow = new THREE.Line(
      predictionGeometry,
      new THREE.LineBasicMaterial({
        color: 0xdff18f,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    world.add(predictionGlow);

    // Deterministic observations, their vertical residuals, and a held-out set.
    const random = createRandom(202611);
    const samplePositions = new Float32Array(SAMPLE_COUNT * 3);
    const sampleColors = new Float32Array(SAMPLE_COUNT * 3);
    const residualPositions = new Float32Array(SAMPLE_COUNT * 6);
    const residualColors = new Float32Array(SAMPLE_COUNT * 6);
    const trainColor = new THREE.Color(0xb9a8ff);
    const validationColor = new THREE.Color(0xdff18f);
    const trainResidual = new THREE.Color(0x75659f);
    const validationResidual = new THREE.Color(0x71834f);
    const sampleGeometry = new THREE.SphereGeometry(0.057, 12, 12);
    const sampleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const samples = new THREE.InstancedMesh(sampleGeometry, sampleMaterial, SAMPLE_COUNT);
    const transform = new THREE.Object3D();
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const x = (random() - 0.5) * 4.2;
      const z = (random() - 0.5) * 3.1;
      const noise = (random() + random() + random() - 1.5) * 0.72;
      const fitted = predict(x, z);
      const y = fitted + noise;
      const color = index < TRAIN_COUNT ? trainColor : validationColor;
      const residualColor = index < TRAIN_COUNT ? trainResidual : validationResidual;
      samplePositions.set([x, y, z], index * 3);
      sampleColors.set([color.r, color.g, color.b], index * 3);
      residualPositions.set([x, fitted, z, x, y, z], index * 6);
      residualColors.set([residualColor.r, residualColor.g, residualColor.b, residualColor.r, residualColor.g, residualColor.b], index * 6);
      transform.position.set(x, y, z);
      transform.scale.setScalar(index < TRAIN_COUNT ? 1 : 1.28);
      transform.updateMatrix();
      samples.setMatrixAt(index, transform.matrix);
      samples.setColorAt(index, color);
    }
    samples.instanceMatrix.needsUpdate = true;
    if (samples.instanceColor) samples.instanceColor.needsUpdate = true;
    samples.renderOrder = 5;
    world.add(samples);

    const residualGeometry = new THREE.BufferGeometry();
    residualGeometry.setAttribute('position', new THREE.BufferAttribute(residualPositions, 3));
    residualGeometry.setAttribute('color', new THREE.BufferAttribute(residualColors, 3));
    const residuals = new THREE.LineSegments(residualGeometry, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    }));
    world.add(residuals);

    const haloGeometry = new THREE.BufferGeometry();
    haloGeometry.setAttribute('position', new THREE.BufferAttribute(samplePositions, 3));
    haloGeometry.setAttribute('color', new THREE.BufferAttribute(sampleColors, 3));
    const halos = new THREE.Points(haloGeometry, new THREE.PointsMaterial({
      size: 0.2,
      map: glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    halos.renderOrder = 3;
    world.add(halos);

    // Axes ground the scene as a data space rather than an abstract sculpture.
    const axis: number[] = [];
    const base = -1.42;
    const corners = [
      [-2.4, -1.9], [2.4, -1.9], [2.4, 1.9], [-2.4, 1.9],
    ];
    corners.forEach((corner, index) => {
      const next = corners[(index + 1) % corners.length];
      axis.push(corner[0], base, corner[1], next[0], base, next[1]);
    });
    axis.push(-2.4, base, 1.9, -2.4, 1.55, 1.9);
    for (let index = 0; index <= 6; index += 1) {
      const x = -2.4 + index * 0.8;
      axis.push(x, base, 1.9, x, base + 0.09, 1.9);
    }
    const axisGeometry = new THREE.BufferGeometry();
    axisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(axis, 3));
    const axes = new THREE.LineSegments(axisGeometry, new THREE.LineBasicMaterial({
      color: 0xb9c0bb,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }));
    world.add(axes);

    // A quiet fit → evaluate → refine loop connects the learning workflow.
    const loopPoints: THREE.Vector3[] = [];
    for (let index = 0; index < 180; index += 1) {
      const angle = (index / 180) * Math.PI * 2;
      loopPoints.push(new THREE.Vector3(Math.cos(angle) * 2.95, base - 0.04, Math.sin(angle) * 2.25));
    }
    const learningLoop = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(loopPoints),
      new THREE.LineBasicMaterial({ color: 0x9e8de0, transparent: true, opacity: 0.2, depthWrite: false }),
    );
    world.add(learningLoop);
    const iterationNodes: THREE.Mesh[] = [];
    const iterationGeometry = new THREE.SphereGeometry(0.045, 10, 10);
    for (let index = 0; index < 3; index += 1) {
      const node = new THREE.Mesh(iterationGeometry, new THREE.MeshBasicMaterial({
        color: index === 1 ? 0xdff18f : 0xc3b6ff,
        toneMapped: false,
      }));
      node.userData.offset = (index / 3) * Math.PI * 2;
      world.add(node);
      iterationNodes.push(node);
    }

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const particleRandom = createRandom(72);
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const radius = 3 + particleRandom() * 4.5;
      const theta = particleRandom() * Math.PI * 2;
      const phi = Math.acos(2 * particleRandom() - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.7;
      positions[index * 3 + 2] = radius * Math.cos(phi) - 1;
      const color = index % 5 === 0 ? validationColor : trainColor;
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
      size: 0.026,
      map: glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }));
    scene.add(particles);

    const pointer = new THREE.Vector2();
    const pointerTarget = new THREE.Vector2();
    let width = 0;
    let height = 0;
    let renderStatic = () => {};
    const resize = () => {
      width = host.clientWidth;
      height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width < 520 ? 43 : 34;
      camera.updateProjectionMatrix();
      const scale = width < 520 ? 0.8 : Math.min(1.05, Math.max(0.84, width / 850));
      world.scale.setScalar(scale);
      particles.scale.setScalar(width < 520 ? 0.75 : 1);
      renderStatic();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const onPointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerTarget.set(
        THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1),
        THREE.MathUtils.clamp(-((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1),
      );
    };
    const onPointerLeave = () => pointerTarget.set(0, 0);
    if (!reducedMotion && window.matchMedia('(pointer: fine)').matches) {
      host.addEventListener('pointermove', onPointerMove, { passive: true });
      host.addEventListener('pointerleave', onPointerLeave);
    }

    const clock = new THREE.Clock();
    let animationFrame = 0;
    let firstFrame = true;
    let pageVisible = !document.hidden;
    const render = () => {
      if (!reducedMotion) animationFrame = requestAnimationFrame(render);
      if (!pageVisible) return;
      const time = clock.getElapsedTime();
      pointer.lerp(pointerTarget, 0.035);

      let exitProgress = 0;
      if (exitStartedRef.current) {
        exitProgress = Math.min(1, (performance.now() - exitStartedRef.current) / (reducedMotion ? 1 : 850));
      }
      const exitEase = exitProgress * exitProgress * (3 - 2 * exitProgress);
      const motionTime = reducedMotion ? 0.8 : time;
      world.rotation.y = -0.38 + Math.sin(motionTime * 0.18) * 0.16 + pointer.x * 0.24 + exitEase * 0.7;
      world.rotation.x = -0.08 + Math.sin(motionTime * 0.3) * 0.035 - pointer.y * 0.1;
      world.rotation.z = 0.035 + Math.cos(motionTime * 0.22) * 0.018;
      world.position.y = reducedMotion ? 0 : Math.sin(time * 0.55) * 0.06;
      world.position.z = exitEase * 2.2;
      surfaceMaterial.uniforms.uTime.value = motionTime;
      surfaceMaterial.uniforms.uOpacity.value = 0.38 + (reducedMotion ? 0 : Math.sin(time * 0.65) * 0.045);
      surfaceMaterial.uniforms.uPointer.value.copy(pointer);
      predictionMaterial.opacity = 0.88 + (reducedMotion ? 0 : Math.sin(time * 1.2) * 0.1);
      particles.rotation.y = motionTime * 0.012 + pointer.x * 0.045;
      particles.rotation.x = pointer.y * 0.025;
      glowMaterial.opacity = 0.19 + (reducedMotion ? 0 : Math.sin(time * 0.8) * 0.025) + exitEase * 0.22;
      camera.position.x = pointer.x * 0.15;
      camera.position.y = 4.3 + pointer.y * 0.1;
      camera.position.z = 8.2;
      camera.lookAt(0, 0, 0);

      iterationNodes.forEach((node) => {
        const angle = node.userData.offset + motionTime * 0.12;
        node.position.set(Math.cos(angle) * 2.95, base + 0.015, Math.sin(angle) * 2.25);
        const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 1.7 + node.userData.offset) * 0.24;
        node.scale.setScalar(pulse);
      });

      renderer.render(scene, camera);
      if (firstFrame) {
        firstFrame = false;
        setReady(true);
      }
    };
    renderStatic = () => {
      if (reducedMotion && pageVisible) render();
    };
    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (pageVisible) {
        clock.getDelta();
        renderStatic();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    render();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        } else if (object instanceof THREE.Sprite) {
          object.material.dispose();
        }
      });
      glowTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={`landing-scene ${ready ? 'is-webgl-ready' : ''} ${failed ? 'has-webgl-fallback' : ''}`}
      aria-hidden="true"
    >
      <div className="scene-fallback">
        <span className="fallback-plane" />
        <span className="fallback-regression" />
        <span className="fallback-samples" />
      </div>
    </div>
  );
}
