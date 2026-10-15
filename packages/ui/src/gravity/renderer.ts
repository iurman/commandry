import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { surfaceHeight } from "./model";
import type { CameraMode, Palette, SurfaceTheme, Well } from "./model";
import type { ActivitySnapshot, ActivitySource } from "./activity-types";
import { ActivityRenderer } from "./activity-renderer";
import {
  capacity,
  terrainVertex,
  terrainFragment,
  skyVertex,
  skyFragment,
} from "./materials";
import { fittedLandscapePose, presentationPose } from "./presentation";
import { LabelLayout, labelHeight } from "./labels";

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
  opacity: number;
  attention: boolean;
  sector: string;
};
export type RendererSettings = {
  theme: SurfaceTheme;
  palette: Palette;
  motion: boolean;
  cameraMode: CameraMode;
  ambient: boolean;
  selected: string | null;
  focus: boolean;
  activity: {
    source: ActivitySource;
    running: boolean;
    follow: boolean;
    trace: string | null;
  };
};
export type RendererHooks = {
  anchors: (anchors: Anchor[]) => void;
  stats: (stats: RenderStats) => void;
  select: (id: string) => void;
  interrupted: () => void;
  unavailable: (message: string) => void;
  viewport: (portrait: boolean) => void;
  lens: (amount: number) => void;
  activity: (snapshot: ActivitySnapshot) => void;
  visibility: (visible: boolean) => void;
};

export class ObservatoryRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
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
    uShapes: {
      value: Array.from(
        { length: capacity },
        () => new THREE.Vector4(1, 0, 0, 1),
      ),
    },
    uAttention: { value: new Float32Array(capacity) },
    uCount: { value: 0 },
    uNight: { value: 0 },
    uWarning: { value: new THREE.Color() },
    uReporting: { value: new THREE.Color() },
    uFailure: { value: new THREE.Color() },
    uTime: { value: 0 },
    uAmbient: { value: 1 },
    uSelection: { value: new THREE.Vector4(0, 0, 1, 1) },
    uSelectedAngle: { value: 0 },
    uSelected: { value: 0 },
    uFogStart: { value: 70 },
  };
  private material = new THREE.ShaderMaterial({
    vertexShader: terrainVertex,
    fragmentShader: terrainFragment,
    uniforms: this.uniforms,
  });
  private skyGeometry = new THREE.SphereGeometry(180, 32, 16);
  private skyMaterial = new THREE.ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    uniforms: {
      uNight: this.uniforms.uNight,
      uTime: this.uniforms.uTime,
      uAmbient: this.uniforms.uAmbient,
    },
    side: THREE.BackSide,
    depthWrite: false,
  });
  private sky = new THREE.Mesh(this.skyGeometry, this.skyMaterial);
  private wells: Well[] = [];
  private targets: Well[] = [];
  private settings: RendererSettings;
  private activityRenderer = new ActivityRenderer();
  private activitySnapshot: ActivitySnapshot;
  private nextActivity = 0;
  private width = 1;
  private height = 1;
  private frame = 0;
  private previous = 0;
  private elapsed = 0;
  private presentationElapsed = 0;
  private presentationAzimuth = 0.18;
  private presentationEntry: {
    position: THREE.Vector3;
    target: THREE.Vector3;
    time: number;
  } | null = null;
  private presentationInterrupted = false;
  private featuredId: string | null = null;
  private nextStats = 0;
  private frames: number[] = [];
  private labelLayout = new LabelLayout();
  private lensAmount = 0;
  private needsDraw = true;
  private lost = false;
  private observer: ResizeObserver;
  private labelObserver: ResizeObserver;
  private labelTop = 52;
  private intersection: IntersectionObserver;
  private visible = true;
  private focusCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private focusCenter = new THREE.Vector3();
  private focusDistance = 0;
  private focusReady = false;
  private focusChanging = false;
  private target = new THREE.WebGLRenderTarget(640, 640, { depthBuffer: true });
  private overlayScene = new THREE.Scene();
  private overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 5);
  private lensGeometry = new THREE.CircleGeometry(1, 100);
  private lensMaterial: THREE.MeshBasicMaterial;
  private lens: THREE.Mesh;
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
    settings: RendererSettings,
    private hooks: RendererHooks,
  ) {
    this.settings = settings;
    this.activitySnapshot = settings.activity.source.snapshot();
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
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 220;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.update();
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.lensMaterial = new THREE.MeshBasicMaterial({
      map: this.target.texture,
      depthTest: false,
      toneMapped: false,
    });
    this.lens = new THREE.Mesh(this.lensGeometry, this.lensMaterial);
    this.lens.position.z = -1;
    this.overlayScene.add(this.lens);
    this.scene.add(this.activityRenderer.group);
    const change = () => {
      this.needsDraw = true;
    };
    const start = () => {
      this.cameraTween = null;
      this.presentationInterrupted = true;
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
        "The graphics context was interrupted. Reload this view to restore the terrain. Resource controls remain available.",
      );
    });
    this.listen(document, "visibilitychange", () => {
      cancelAnimationFrame(this.frame);
      this.hooks.visibility?.(this.visible && !document.hidden);
      if (!document.hidden) {
        this.previous = 0;
        this.needsDraw = true;
        this.frame = requestAnimationFrame(this.animate);
      }
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    const toolbar = container.parentElement?.querySelector<HTMLElement>(
      ".gravity-activity-bar, [data-gravity-label-inset]",
    );
    const measureToolbar = () => {
      this.labelTop = toolbar
        ? toolbar.offsetTop + toolbar.offsetHeight + 12
        : 52;
      this.needsDraw = true;
    };
    this.labelObserver = new ResizeObserver(measureToolbar);
    if (toolbar) this.labelObserver.observe(toolbar);
    measureToolbar();
    this.intersection = new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? false;
      this.hooks.visibility?.(this.visible && !document.hidden);
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

  update(wells: Well[], settings: RendererSettings) {
    if (wells.length > capacity)
      throw new Error(
        `This viewport supports ${capacity} surface contributions; it does not truncate resources.`,
      );
    const layoutChanged =
      wells.length !== this.targets.length ||
      wells.some((well, index) => {
        const previous = this.targets[index];
        return (
          !previous ||
          well.id !== previous.id ||
          (
            [
              "x",
              "z",
              "radius",
              "depth",
              "aspect",
              "angle",
              "elevation",
              "profile",
            ] as const
          ).some((key) => well[key] !== previous[key])
        );
      });
    const cameraChanged = settings.cameraMode !== this.settings.cameraMode;
    const activityChanged =
      settings.activity.source !== this.settings.activity.source ||
      settings.activity.trace !== this.settings.activity.trace;
    this.targets = wells;
    this.settings = settings;
    if (activityChanged) this.refreshActivity();
    if (cameraChanged) {
      this.presentationInterrupted = false;
      this.presentationElapsed = 0;
      this.presentationAzimuth = Math.atan2(
        this.camera.position.x - this.controls.target.x,
        this.camera.position.z - this.controls.target.z,
      );
      this.presentationEntry = {
        position: this.camera.position.clone(),
        target: this.controls.target.clone(),
        time: 0,
      };
      this.featuredId = null;
    }
    if (settings.cameraMode === "composed" && (layoutChanged || cameraChanged))
      this.preset("overview");
    if (settings.cameraMode === "orbit" || settings.cameraMode === "tour")
      this.cameraTween = null;
    this.uniforms.uWarning.value.set(settings.palette.attention);
    this.uniforms.uReporting.value.set(settings.palette.reporting);
    this.uniforms.uFailure.value.set(settings.palette.unhealthy);
    this.needsDraw = true;
  }

  preset(preset: "overview" | "top" | "angle") {
    const pose = fittedLandscapePose(
      this.targets,
      this.camera.aspect,
      preset === "angle" ? -0.65 : 0.18,
      preset === "top" ? 1.55 : preset === "angle" ? 0.72 : 0.95,
    );
    this.cameraTween = {
      from: this.camera.position.clone(),
      to: new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z),
      targetFrom: this.controls.target.clone(),
      targetTo: new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z),
      time: 0,
    };
    this.needsDraw = true;
  }

  refreshActivity() {
    this.activitySnapshot = this.settings.activity.source.snapshot();
    this.hooks.activity?.(this.activitySnapshot);
    this.nextActivity = 0;
    this.needsDraw = true;
  }

  measureAnchor(id: string, width: number, height: number) {
    if (this.labelLayout.measure(id, width, height)) this.needsDraw = true;
  }

  private resize() {
    this.width = Math.max(this.container.clientWidth, 1);
    this.height = Math.max(this.container.clientHeight, 1);
    this.hooks.viewport(this.width / this.height < 0.9);
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.overlayCamera.left = -this.width / 2;
    this.overlayCamera.right = this.width / 2;
    this.overlayCamera.top = this.height / 2;
    this.overlayCamera.bottom = -this.height / 2;
    this.overlayCamera.updateProjectionMatrix();
    if (this.settings.cameraMode === "composed") this.preset("overview");
    this.needsDraw = true;
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
        this.heightAt(well.x, well.z) + 0.4,
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

  private heightAt(x: number, z: number) {
    return surfaceHeight(
      x,
      z,
      this.wells,
      this.uniforms.uTime.value,
      this.uniforms.uAmbient.value,
    );
  }

  private animate = (now: number) => {
    if (document.hidden || !this.visible || this.lost) return;
    const interval = this.previous ? now - this.previous : 1000 / 60;
    const dt = Math.min(interval / 1000, 0.05);
    this.previous = now;
    const moving = this.settings.motion;
    const simulating =
      moving &&
      this.settings.activity.running &&
      (this.settings.activity.source.active?.() ?? true);
    if (simulating) this.settings.activity.source.advance?.(dt);
    this.activitySnapshot = this.settings.activity.source.snapshot();
    if (now >= this.nextActivity) {
      this.hooks.activity?.(this.activitySnapshot);
      this.nextActivity = now + 250;
    }
    if (moving) this.elapsed += dt;
    this.uniforms.uTime.value = this.elapsed;
    this.uniforms.uAmbient.value = this.settings.ambient ? 1 : 0;
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
        for (const key of [
          "x",
          "z",
          "radius",
          "depth",
          "aspect",
          "angle",
          "elevation",
          "profile",
        ] as const) {
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
      this.uniforms.uColors.value[i]!.set(
        this.settings.palette[well.sector] ?? this.settings.palette.reporting,
      );
      this.uniforms.uShapes.value[i]!.set(
        well.aspect,
        well.angle,
        well.elevation,
        well.profile,
      );
      this.uniforms.uAttention.value[i] =
        this.settings.activity.source.attention?.(well.id) ??
        (well.attention ? 0.5 : 0);
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
    if (selected) {
      this.uniforms.uSelection.value.set(
        selected.x,
        selected.z,
        selected.radius,
        selected.aspect,
      );
      this.uniforms.uSelectedAngle.value = selected.angle;
    }
    const targetLens = this.settings.focus && selected ? 1 : 0;
    this.lensAmount = THREE.MathUtils.lerp(this.lensAmount, targetLens, factor);
    if (Math.abs(this.lensAmount - targetLens) < 0.002)
      this.lensAmount = targetLens;
    changing ||= Math.abs(this.lensAmount - targetLens) > 0.002;
    if (this.cameraTween) {
      this.cameraTween.time = moving
        ? Math.min(1, this.cameraTween.time + dt / 1.1)
        : 1;
      const t = this.cameraTween.time;
      const ease = t * t * t * (t * (t * 6 - 15) + 10);
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
    const automatic =
      !this.presentationInterrupted &&
      (this.settings.cameraMode === "orbit" ||
        this.settings.cameraMode === "tour");
    if (automatic && moving) {
      this.presentationElapsed += dt;
      const pose = presentationPose(
        this.targets,
        this.camera.aspect,
        this.presentationElapsed,
        this.settings.cameraMode === "tour",
        this.presentationAzimuth,
      );
      if (this.presentationEntry) {
        const entry = this.presentationEntry;
        entry.time = Math.min(1, entry.time + dt / 2.2);
        const t = entry.time;
        const ease = t * t * t * (t * (t * 6 - 15) + 10);
        for (const axis of ["x", "y", "z"] as const) {
          pose.position[axis] = THREE.MathUtils.lerp(
            entry.position[axis],
            pose.position[axis],
            ease,
          );
          pose.target[axis] = THREE.MathUtils.lerp(
            entry.target[axis],
            pose.target[axis],
            ease,
          );
        }
        if (t === 1) this.presentationEntry = null;
      }
      const smoothing = 1 - Math.exp(-dt * 2.5);
      this.camera.position.lerp(
        new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z),
        smoothing,
      );
      this.controls.target.lerp(
        new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z),
        smoothing,
      );
      if (pose.featured && pose.featured !== this.featuredId) {
        this.featuredId = pose.featured;
        this.hooks.select(pose.featured);
      }
      changing = true;
    }
    this.controls.enableDamping =
      moving && this.settings.cameraMode === "manual";
    changing = this.controls.update(dt) || changing;
    this.uniforms.uFogStart.value =
      this.camera.position.distanceTo(this.controls.target) + 18;
    if (
      this.needsDraw ||
      changing ||
      (this.settings.ambient && moving) ||
      simulating
    ) {
      const activity = this.settings.activity;
      this.activityRenderer.update(
        this.activitySnapshot,
        this.wells,
        this.settings.palette,
        this.settings.selected,
        activity.trace,
        activity.follow,
        this.elapsed,
        this.settings.ambient,
        this.settings.theme === "midnight",
        this.renderer.getPixelRatio(),
      );
      this.renderer.info.reset();
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(
        this.settings.theme === "midnight" ? 0x08101a : 0xf6f5f0,
      );
      this.sky.position.copy(this.camera.position);
      this.renderer.render(this.scene, this.camera);
      if (this.lensAmount > 0.005 && selected) this.renderLens(selected, dt);
      else {
        this.focusReady = false;
        this.focusChanging = false;
      }
      this.needsDraw = false;
      this.publishAnchors(dt);
      this.needsDraw = this.labelLayout.changing || this.focusChanging;
      this.hooks.lens(this.lensAmount);
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

  private anchorHeight(well: Well) {
    return labelHeight(
      well,
      well.kind === "service"
        ? this.targets.find((target) => target.id === well.hostId)
        : undefined,
    );
  }

  private publishAnchors(dt: number) {
    const anchors: Anchor[] = this.wells
      .filter(
        (w) =>
          this.targets.some((target) => target.id === w.id) &&
          w.kind !== "service",
      )
      .map((well) => ({
        id: well.id,
        label: well.label,
        kind: well.kind,
        attention: well.attention,
        sector: well.sector,
        opacity: 0,
        ...this.project(well.x, this.anchorHeight(well), well.z),
      }));
    for (const anchor of anchors)
      if (anchor.kind === "project" && this.settings.focus)
        anchor.visible = false;
    if (this.lensAmount > 0.4) {
      for (const anchor of anchors) {
        if (
          Math.hypot(
            anchor.x - this.width * 0.43,
            anchor.y - this.height * 0.48,
          ) <
          this.lensRadius() * this.lensAmount + 35
        )
          anchor.visible = false;
      }
    }
    if (this.settings.selected) {
      const radius = this.lensRadius() * this.lensAmount;
      for (const well of this.wells.filter(
        (w) => w.kind === "service" && w.hostId === this.settings.selected,
      )) {
        const p = new THREE.Vector3(
          well.x,
          this.anchorHeight(well),
          well.z,
        ).project(this.focusCamera);
        anchors.push({
          id: `lens-${well.id}`,
          label: well.label,
          kind: "service",
          attention: false,
          sector: well.sector,
          opacity: 0,
          x: this.width * 0.43 + p.x * radius,
          y: this.height * 0.48 - p.y * radius,
          visible: this.lensAmount > 0.95 && p.x * p.x + p.y * p.y < 0.79,
        });
      }
    }
    this.hooks.anchors(
      this.labelLayout.layout(
        anchors,
        this.width,
        this.height,
        dt,
        this.settings.motion,
        this.labelTop,
      ),
    );
  }

  private lensRadius() {
    return Math.min(this.height * 0.36, this.width * 0.31);
  }

  private renderLens(selected: Well, dt: number) {
    const center = new THREE.Vector3(selected.x, 0.4, selected.z);
    const distance =
      selected.kind === "project"
        ? 22
        : Math.max(10, selected.radius * Math.max(1, selected.aspect) * 5);
    const smoothing =
      this.settings.motion && this.focusReady ? 1 - Math.exp(-dt * 5) : 1;
    this.focusCenter.lerp(center, smoothing);
    this.focusDistance = THREE.MathUtils.lerp(
      this.focusDistance,
      distance,
      smoothing,
    );
    this.focusChanging =
      this.focusCenter.distanceTo(center) > 0.002 ||
      Math.abs(this.focusDistance - distance) > 0.002;
    this.focusReady = true;
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    this.focusCamera.position
      .copy(this.focusCenter)
      .addScaledVector(direction, this.focusDistance);
    this.focusCamera.lookAt(this.focusCenter);
    this.focusCamera.updateMatrixWorld();
    this.renderer.setRenderTarget(this.target);
    this.sky.position.copy(this.focusCamera.position);
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

  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.labelObserver.disconnect();
    this.intersection.disconnect();
    this.listeners.forEach((remove) => remove());
    this.controls.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.skyGeometry.dispose();
    this.skyMaterial.dispose();
    this.activityRenderer.dispose();
    this.lensGeometry.dispose();
    this.lensMaterial.dispose();
    this.target.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
