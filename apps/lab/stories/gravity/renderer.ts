import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { sectors, surfaceHeight } from "./model";
import type { Palette, SurfaceTheme, Well } from "./model";

export type RenderStats = {
  fps: number;
  calls: number;
  triangles: number;
  frameMs: number;
};
export type Anchor = {
  id: string;
  label: string;
  kind: Well["kind"];
  x: number;
  y: number;
  visible: boolean;
  attention: boolean;
  sector: string;
};
type Settings = {
  theme: SurfaceTheme;
  palette: Palette;
  motion: boolean;
  orbit: boolean;
  selected: string | null;
  focus: boolean;
};
type Hooks = {
  anchors: (anchors: Anchor[]) => void;
  stats: (stats: RenderStats) => void;
  select: (id: string) => void;
  interrupted: () => void;
  unavailable: (message: string) => void;
};

const capacity = 64;
const field = `
uniform vec4 uWells[${capacity}];
uniform vec3 uColors[${capacity}];
uniform float uAttention[${capacity}];
uniform int uCount;
float heightAt(vec2 p) {
  float h = sin(p.x * 0.32 + p.y * 0.17) * 0.035 + cos(p.y * 0.42 - p.x * 0.12) * 0.02;
  for (int i = 0; i < ${capacity}; i++) {
    if (i >= uCount) break;
    vec4 w = uWells[i];
    float r2 = dot(p - w.xy, p - w.xy) / (w.z * w.z);
    h -= w.w * exp(-r2 * 1.5);
    h += 0.13 * w.z * exp(-pow(sqrt(r2) - 1.05, 2.0) * 12.0) * min(1.0, w.w);
  }
  return h;
}`;
const vertexShader = `${field}
varying vec3 vWorld;
varying vec3 vColor;
varying float vRim;
varying float vAlert;
varying float vDash;
void main() {
  vec3 p = position;
  p.y = heightAt(p.xz);
  vWorld = p;
  vec3 tint = vec3(0.25, 0.55, 0.8) * 0.04;
  float weight = 0.04;
  vRim = 0.0; vAlert = 0.0; vDash = 0.0;
  for (int i = 0; i < ${capacity}; i++) {
    if (i >= uCount) break;
    vec4 w = uWells[i];
    vec2 d = p.xz - w.xy;
    float r = length(d) / w.z;
    float influence = exp(-r * r * 0.55) * min(1.0, w.w);
    tint += uColors[i] * influence;
    weight += influence;
    float rim = exp(-pow((r - 1.08) * 28.0, 2.0)) * min(1.0, w.w);
    vRim = max(vRim, rim);
    vAlert = max(vAlert, uAttention[i] * exp(-r * r * 0.25) * min(1.0, w.w));
    vDash = max(vDash, rim * uAttention[i] * step(0.0, sin(atan(d.y, d.x) * 28.0)));
  }
  vColor = tint / weight;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const fragmentShader = `
uniform float uNight;
uniform vec3 uWarning;
uniform vec3 uReporting;
uniform float uContour;
uniform vec2 uSelection;
uniform float uSelected;
varying vec3 vWorld;
varying vec3 vColor;
varying float vRim;
varying float vAlert;
varying float vDash;
void main() {
  vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (normal.y < 0.0) normal = -normal;
  vec3 light = normalize(vec3(-0.5, 1.0, 0.65));
  float diffuse = max(dot(normal, light), 0.0);
  float depth = clamp(-vWorld.y / 3.6, 0.0, 1.0);
  vec3 color = mix(vec3(0.94, 0.945, 0.93), vec3(0.012, 0.025, 0.041), uNight);
  vec3 core = mix(vec3(0.012, 0.105, 0.29), vColor * 0.18, 0.25);
  color = mix(color, core, smoothstep(0.0, 0.77, depth));
  color *= 0.40 + diffuse * 0.65;
  color += vColor * exp(-pow((depth - 0.28) * 9.0, 2.0)) * mix(0.03, 0.10, uNight);
  float band = vWorld.y * 13.5;
  float contour = 1.0 - smoothstep(0.0, max(fwidth(band) * 1.2, 0.045), abs(fract(band - 0.5) - 0.5));
  vec3 ink = mix(vColor * 0.30, vColor * 0.9, uNight);
  color = mix(color, ink, contour * uContour * mix(0.72, 0.83, uNight) * smoothstep(0.02, 0.28, -vWorld.y));
  vec2 grid = abs(fract(vWorld.xz * 1.0 - 0.5) - 0.5) / max(fwidth(vWorld.xz), vec2(0.001));
  float line = 1.0 - min(min(grid.x, grid.y), 1.0);
  color = mix(color, mix(vec3(0.49, 0.58, 0.62), vec3(0.16, 0.23, 0.28), uNight), line * 0.12);
  vec3 rimColor = mix(mix(vColor, uReporting, 0.25), uWarning, smoothstep(0.15, 0.55, vAlert));
  color += rimColor * vRim * mix(0.24, 0.65, uNight);
  color = mix(color, uWarning * 1.2, vDash * 0.9);
  float selection = exp(-pow((length(vWorld.xz - uSelection) - 3.45) * 12.0, 2.0)) * uSelected;
  color += vec3(0.15, 0.43, 0.62) * selection * 0.6;
  float distanceFade = smoothstep(20.0, 32.0, length(vWorld.xz));
  color = mix(color, mix(vec3(0.95, 0.95, 0.935), vec3(0.025, 0.045, 0.07), uNight), distanceFade);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class ObservatoryRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  private controls: OrbitControls;
  private geometry = new THREE.PlaneGeometry(68, 58, 400, 340).rotateX(
    -Math.PI / 2,
  );
  private uniforms = {
    uWells: {
      value: Array.from(
        { length: capacity },
        () => new THREE.Vector4(0, 0, 1, 0),
      ),
    },
    uColors: {
      value: Array.from({ length: capacity }, () => new THREE.Color()),
    },
    uAttention: { value: new Float32Array(capacity) },
    uCount: { value: 0 },
    uNight: { value: 0 },
    uWarning: { value: new THREE.Color() },
    uReporting: { value: new THREE.Color() },
    uContour: { value: 1 },
    uSelection: { value: new THREE.Vector2() },
    uSelected: { value: 0 },
  };
  private material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: this.uniforms,
  });
  private wells: Well[] = [];
  private targets: Well[] = [];
  private settings: Settings;
  private width = 1;
  private height = 1;
  private frame = 0;
  private previous = 0;
  private elapsed = 0;
  private nextStats = 0;
  private frames: number[] = [];
  private lastAnchors = 0;
  private lensAmount = 0;
  private needsDraw = true;
  private lost = false;
  private observer: ResizeObserver;
  private intersection: IntersectionObserver;
  private visible = true;
  private focusCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private target = new THREE.WebGLRenderTarget(640, 640, { depthBuffer: true });
  private overlayScene = new THREE.Scene();
  private overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 5);
  private lensGeometry = new THREE.CircleGeometry(1, 100);
  private lensMaterial: THREE.MeshBasicMaterial;
  private lens: THREE.Mesh;
  private particlesGeometry = new THREE.BufferGeometry();
  private particlesMaterial = new THREE.PointsMaterial({
    size: 0.12,
    color: 0x7ad8f6,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private particles: THREE.Points;
  private event: { wellId: string; start: number } | null = null;
  private positions = new Float32Array(80 * 3);
  private cameraTween: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    targetFrom: THREE.Vector3;
    targetTo: THREE.Vector3;
    time: number;
  } | null = null;
  private pointerStart = { x: 0, y: 0 };
  private listeners: (() => void)[] = [];

  constructor(
    private container: HTMLElement,
    settings: Settings,
    private hooks: Hooks,
  ) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive gravity terrain. Select resources using the resource buttons.",
    );
    this.renderer.domElement.setAttribute("role", "img");
    container.append(this.renderer.domElement);
    const vertices = this.geometry.attributes.position!;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i);
      const z = vertices.getZ(i);
      vertices.setX(i, x + Math.sign(x) * (Math.abs(x) / 34) ** 8 * 90);
      vertices.setZ(i, z + Math.sign(z) * (Math.abs(z) / 29) ** 8 * 90);
    }
    this.camera.position.set(9, 20, 26);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, -0.6, 0);
    this.controls.enableDamping = false;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 90;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = Math.PI * 0.43;
    this.controls.autoRotateSpeed = 0.32;
    this.controls.update();
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
    this.lensMaterial = new THREE.MeshBasicMaterial({
      map: this.target.texture,
      depthTest: false,
      toneMapped: false,
    });
    this.lens = new THREE.Mesh(this.lensGeometry, this.lensMaterial);
    this.lens.position.z = -1;
    this.overlayScene.add(this.lens);
    this.particlesGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.particles = new THREE.Points(
      this.particlesGeometry,
      this.particlesMaterial,
    );
    this.particles.visible = false;
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    const change = () => {
      this.needsDraw = true;
    };
    const start = () => {
      this.cameraTween = null;
      this.hooks.interrupted();
    };
    this.controls.addEventListener("change", change);
    this.controls.addEventListener("start", start);
    this.listeners.push(() => {
      this.controls.removeEventListener("change", change);
      this.controls.removeEventListener("start", start);
    });
    this.listen(this.renderer.domElement, "pointerdown", (e) => {
      const p = e as PointerEvent;
      this.pointerStart = { x: p.clientX, y: p.clientY };
    });
    this.listen(this.renderer.domElement, "pointerup", (e) =>
      this.pick(e as PointerEvent),
    );
    this.listen(this.renderer.domElement, "webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
      this.hooks.unavailable(
        "The graphics context was interrupted. Reload the study to restore the terrain. Resource controls remain available.",
      );
    });
    this.listen(document, "visibilitychange", () => {
      cancelAnimationFrame(this.frame);
      if (!document.hidden) {
        this.previous = 0;
        this.needsDraw = true;
        this.frame = requestAnimationFrame(this.animate);
      }
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.intersection = new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? false;
      cancelAnimationFrame(this.frame);
      if (this.visible && !document.hidden) {
        this.previous = 0;
        this.needsDraw = true;
        this.frame = requestAnimationFrame(this.animate);
      }
    });
    this.intersection.observe(container);
    this.resize();
    this.frame = requestAnimationFrame(this.animate);
  }

  private listen(target: EventTarget, event: string, handler: EventListener) {
    target.addEventListener(event, handler);
    this.listeners.push(() => target.removeEventListener(event, handler));
  }

  update(wells: Well[], settings: Settings) {
    if (wells.length > capacity)
      throw new Error(
        `This finite study supports ${capacity} surface contributions; it does not truncate resources.`,
      );
    this.targets = wells;
    this.settings = settings;
    this.controls.autoRotate = settings.orbit && settings.motion;
    this.uniforms.uWarning.value.set(settings.palette.attention);
    this.uniforms.uReporting.value.set(settings.palette.reporting);
    this.needsDraw = true;
  }

  preset(preset: "overview" | "top" | "angle") {
    const positions = {
      overview: new THREE.Vector3(9, 20, 26).multiplyScalar(this.fitScale()),
      top: new THREE.Vector3(0, 33, 0.1).multiplyScalar(this.fitScale()),
      angle: new THREE.Vector3(-20, 16, 25).multiplyScalar(this.fitScale()),
    };
    this.cameraTween = {
      from: this.camera.position.clone(),
      to: positions[preset],
      targetFrom: this.controls.target.clone(),
      targetTo: new THREE.Vector3(0, -0.6, 0),
      time: 0,
    };
    this.needsDraw = true;
  }

  emit(wellId: string) {
    this.event = { wellId, start: this.elapsed };
    this.needsDraw = true;
  }

  private resize() {
    const previousScale = this.fitScale();
    this.width = Math.max(this.container.clientWidth, 1);
    this.height = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.position
      .sub(this.controls.target)
      .multiplyScalar(this.fitScale() / previousScale)
      .add(this.controls.target);
    this.camera.updateProjectionMatrix();
    this.overlayCamera.left = -this.width / 2;
    this.overlayCamera.right = this.width / 2;
    this.overlayCamera.top = this.height / 2;
    this.overlayCamera.bottom = -this.height / 2;
    this.overlayCamera.updateProjectionMatrix();
    this.needsDraw = true;
  }

  private fitScale() {
    return Math.max(0.85, Math.min(2, 1.15 / this.camera.aspect));
  }

  private pick(e: PointerEvent) {
    if (
      Math.hypot(
        e.clientX - this.pointerStart.x,
        e.clientY - this.pointerStart.y,
      ) > 5
    )
      return;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;
    let best: Well | undefined;
    let distance = 48;
    for (const well of this.wells.filter((w) => w.kind !== "service")) {
      const p = this.project(
        well.x,
        surfaceHeight(well.x, well.z, this.wells) + 0.4,
        well.z,
      );
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < distance) {
        distance = d;
        best = well;
      }
    }
    if (best) this.hooks.select(best.id);
  }

  private project(x: number, y: number, z: number, camera = this.camera) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.width,
      y: (-v.y * 0.5 + 0.5) * this.height,
      visible:
        v.z > -1 && v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95,
    };
  }

  private animate = (now: number) => {
    if (document.hidden || !this.visible || this.lost) return;
    const interval = this.previous ? now - this.previous : 1000 / 60;
    const dt = Math.min(interval / 1000, 0.05);
    this.previous = now;
    const moving = this.settings.motion;
    if (moving) this.elapsed += dt;
    let changing = false;
    const factor = moving ? 1 - Math.exp(-dt * 4) : 1;
    const existing = new Map(this.wells.map((w) => [w.id, w]));
    const activeIds = new Set(this.targets.map((well) => well.id));
    const transitions = [
      ...this.targets,
      ...this.wells
        .filter((well) => !activeIds.has(well.id))
        .map((well) => ({ ...well, depth: 0 })),
    ];
    this.wells = transitions
      .map((target) => {
        const current = existing.get(target.id) ?? {
          ...target,
          depth: 0,
          radius: target.radius * 1.3,
        };
        const value = { ...target };
        for (const key of ["x", "z", "radius", "depth"] as const) {
          value[key] = THREE.MathUtils.lerp(current[key], target[key], factor);
          if (Math.abs(value[key] - target[key]) > 0.002) changing = true;
          else value[key] = target[key];
        }
        return value;
      })
      .filter((well) => activeIds.has(well.id) || well.depth > 0.002);
    this.uniforms.uCount.value = this.wells.length;
    this.wells.forEach((well, i) => {
      this.uniforms.uWells.value[i]!.set(
        well.x,
        well.z,
        well.radius,
        well.depth,
      );
      this.uniforms.uColors.value[i]!.set(this.settings.palette[well.sector]);
      this.uniforms.uAttention.value[i] = well.attention ? 1 : 0;
    });
    const targetNight = this.settings.theme === "midnight" ? 1 : 0;
    const oldNight = this.uniforms.uNight.value;
    this.uniforms.uNight.value = THREE.MathUtils.lerp(
      oldNight,
      targetNight,
      factor,
    );
    changing ||= Math.abs(oldNight - targetNight) > 0.002;
    const selected = this.wells.find((w) => w.id === this.settings.selected);
    this.uniforms.uSelected.value = selected ? 1 : 0;
    if (selected) this.uniforms.uSelection.value.set(selected.x, selected.z);
    const targetLens = this.settings.focus && selected ? 1 : 0;
    this.lensAmount = THREE.MathUtils.lerp(this.lensAmount, targetLens, factor);
    changing ||= Math.abs(this.lensAmount - targetLens) > 0.002;
    if (this.cameraTween) {
      this.cameraTween.time = moving
        ? Math.min(1, this.cameraTween.time + dt / 1.1)
        : 1;
      const t = this.cameraTween.time;
      const ease = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(
        this.cameraTween.from,
        this.cameraTween.to,
        ease,
      );
      this.controls.target.lerpVectors(
        this.cameraTween.targetFrom,
        this.cameraTween.targetTo,
        ease,
      );
      if (t === 1) this.cameraTween = null;
      changing = true;
    }
    this.controls.update(dt);
    this.updateParticles();
    if (
      this.needsDraw ||
      changing ||
      this.controls.autoRotate ||
      (this.event && moving)
    ) {
      this.renderer.info.reset();
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(
        this.settings.theme === "midnight" ? 0x08101a : 0xf6f5f0,
      );
      this.renderer.render(this.scene, this.camera);
      if (this.lensAmount > 0.005 && selected) this.renderLens(selected);
      this.needsDraw = false;
      if (now > this.lastAnchors + 45) {
        this.publishAnchors();
        this.lastAnchors = now;
      }
      this.frames.push(interval);
    }
    if (now > this.nextStats) {
      const mean =
        this.frames.reduce((sum, n) => sum + n, 0) /
        Math.max(1, this.frames.length);
      this.hooks.stats({
        fps: this.frames.length ? Math.round(1000 / mean) : 0,
        frameMs: Math.round(mean * 10) / 10,
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
      });
      this.frames = [];
      this.nextStats = now + 1200;
    }
    this.frame = requestAnimationFrame(this.animate);
  };

  private publishAnchors() {
    const anchors: Anchor[] = this.wells
      .filter(
        (w) =>
          this.targets.some((target) => target.id === w.id) &&
          (w.kind !== "service" ||
            (this.settings.selected === w.hostId && !this.settings.focus)),
      )
      .map((well) => ({
        id: well.id,
        label: well.label,
        kind: well.kind,
        attention: well.attention,
        sector: well.sector,
        ...this.project(
          well.x,
          well.kind === "service" ? 0.5 : 0.8,
          well.kind === "project" ? well.z - 4.2 : well.z,
        ),
      }));
    if (this.settings.focus) {
      for (const anchor of anchors) {
        if (
          Math.hypot(
            anchor.x - this.width * 0.43,
            anchor.y - this.height * 0.48,
          ) <
          this.lensRadius() + 35
        )
          anchor.visible = false;
      }
    }
    if (this.settings.focus && this.settings.selected) {
      const radius = this.lensRadius();
      for (const well of this.wells.filter(
        (w) => w.kind === "service" && w.hostId === this.settings.selected,
      )) {
        const p = new THREE.Vector3(
          well.x,
          surfaceHeight(well.x, well.z, this.wells) + 0.3,
          well.z,
        ).project(this.focusCamera);
        anchors.push({
          id: `lens-${well.id}`,
          label: well.label,
          kind: "service",
          attention: false,
          sector: well.sector,
          x: this.width * 0.43 + p.x * radius,
          y: this.height * 0.48 - p.y * radius,
          visible: p.x * p.x + p.y * p.y < 0.79,
        });
      }
    }
    for (const sector of this.wells.some((well) => well.kind === "project")
      ? []
      : sectors) {
      anchors.push({
        id: `label-${sector.id}`,
        label: sector.label,
        kind: "project",
        attention: false,
        sector: sector.id,
        ...this.project(sector.center.x - 1, 0.3, sector.center.z - 4.8),
      });
    }
    this.hooks.anchors(anchors);
  }

  private lensRadius() {
    return Math.min(this.height * 0.36, this.width * 0.31);
  }

  private renderLens(selected: Well) {
    const center = new THREE.Vector3(selected.x, -0.5, selected.z);
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    this.focusCamera.position
      .copy(center)
      .addScaledVector(direction, selected.kind === "project" ? 17 : 14);
    this.focusCamera.lookAt(center);
    this.focusCamera.updateMatrixWorld();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.focusCamera);
    this.renderer.setRenderTarget(null);
    const radius = this.lensRadius() * this.lensAmount;
    this.lens.scale.set(radius, radius, 1);
    this.lens.position.x = -this.width * 0.07;
    this.lens.position.y = this.height * 0.02;
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.overlayScene, this.overlayCamera);
    this.renderer.autoClear = true;
  }

  private updateParticles() {
    if (!this.event) {
      this.particles.visible = false;
      return;
    }
    const destination = this.wells.find((w) => w.id === this.event!.wellId);
    if (!destination || this.elapsed - this.event.start > 5.5) {
      this.event = null;
      this.particles.visible = false;
      this.needsDraw = true;
      return;
    }
    const age = this.elapsed - this.event.start;
    for (let i = 0; i < 80; i++) {
      const t = Math.max(0, Math.min(1, (age - i * 0.018) / 3.3));
      const angle = t * Math.PI * 5 + i * 0.017;
      const radius = (1 - t) * 5.5;
      const x = destination.x + Math.cos(angle) * radius;
      const z = destination.z + Math.sin(angle) * radius;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] =
        surfaceHeight(x, z, this.wells) + 0.14 + (1 - t) * 0.3;
      this.positions[i * 3 + 2] = z;
    }
    this.particlesGeometry.attributes.position!.needsUpdate = true;
    this.particles.visible = true;
    this.particlesMaterial.opacity = Math.min(0.95, (5.5 - age) * 0.6);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.intersection.disconnect();
    this.listeners.forEach((remove) => remove());
    this.controls.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.particlesGeometry.dispose();
    this.particlesMaterial.dispose();
    this.lensGeometry.dispose();
    this.lensMaterial.dispose();
    this.target.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
