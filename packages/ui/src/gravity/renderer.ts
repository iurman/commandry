import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { parentWellId, surfaceHeight } from "./model";
import type { CameraMode, Palette, SurfaceTheme, Well } from "./model";
import type { ActivitySnapshot, ActivitySource } from "./activity-types";
import { ActivityRenderer, activeTransfers } from "./activity-renderer";
import {
  terrainVertex,
  terrainFragment,
  skyVertex,
  skyFragment,
} from "./materials";
import {
  fittedLandscapePose,
  focusedLandscapePose,
  frameOfPose,
  hostTourStops,
  ORBIT_ELEVATION,
  ORBIT_RATE,
  orbitFrame,
  orbitPose,
  presentationPose,
  travelFrame,
  type OrbitFrame,
} from "./presentation";
import { PresentationTour, type TourStop } from "./tour";
import {
  CalloutLayout,
  LabelLayout,
  labelHeight,
  poolLabelPoint,
  type LabelRect,
} from "./labels";
import { TetherRenderer } from "./tethers";
import {
  fieldBounds,
  fieldRefinement,
  fieldTransition,
  packField,
} from "./field";
import {
  basinGeometry,
  basinGeometryWindow,
  type BasinGeometry,
} from "./basin-geometry";
import type { FieldColor, PackedField } from "./field";

/** Seconds a watch travels from the current pose to its orbit. */
const WATCH_TRAVEL = 2.6;
/** Compact label width, in CSS pixels, that member spacing is compared with. */
const CALLOUT_LABEL = 120;
/** Callout columns start below 0.9 of a label width and stop above 1.2. */
const CALLOUT_ENTER = CALLOUT_LABEL * 0.9;
const CALLOUT_EXIT = CALLOUT_LABEL * 1.2;
const CALLOUT_MINIMUM = 3;
/** Share of the stage width a dense framed group fills. */
const CALLOUT_FRAMING = 0.62;

export type RenderStats = {
  fps: number;
  calls: number;
  triangles: number;
  frameMs: number;
  contributions?: number;
  terrainVertices?: number;
  geometryBytes?: number;
  geometries?: number;
  textures?: number;
  activeBasins?: number;
  detailScale?: number;
  planningCandidates?: number;
  planningVisits?: number;
  planningBudget?: number;
  planningPasses?: number;
  geometryQuality?: BasinGeometry["quality"];
  focusVertices?: number;
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
  /** A member shown inside or around a visible parent; it uses a compact label. */
  nested?: boolean;
  /** A parent whose members are named; its own label steps back to compact. */
  open?: boolean;
  rank?: number;
  leash?: number;
  /** Placed in a callout column; the layout keeps its position. */
  fixed?: boolean;
  /** A callout column label and its leader line to the member. */
  callout?: {
    side: "left" | "right";
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  };
  /** Members of the framed group a full callout column could not name. */
  overflow?: number;
};
export type RendererSettings = {
  theme: SurfaceTheme;
  palette: Palette;
  motion: boolean;
  cameraMode: CameraMode;
  ambient: boolean;
  selected: string | null;
  focus: boolean;
  /** The subject a `watch` camera orbits. */
  watch?: string | null;
  /** Presentation stops in visiting order. Without them the tour visits
   * top-level hosts around the landscape. */
  stops?: string[];
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
  /** Automatic tour context only; it must not activate direct camera focus.
   * Consumers without this hook retain the legacy select notification.
   */
  featured?: (id: string) => void;
  /** Each presentation stop as it begins, with its timing and reason. */
  tour?: (stop: TourStop) => void;
  interrupted: () => void;
  unavailable: (message: string) => void;
  viewport: (portrait: boolean) => void;
  lens: (amount: number) => void;
  activity: (snapshot: ActivitySnapshot) => void;
  visibility: (visible: boolean) => void;
};

/** Closest member spacing for each visible parent, outermost parents first. */
export function memberSpacing(wells: readonly Well[]) {
  const byId = new Map(wells.map((well) => [well.id, well]));
  const groups = new Map<string, Well[]>();
  for (const well of wells) {
    const parent = parentWellId(well);
    if (!parent || !byId.has(parent)) continue;
    const members = groups.get(parent) ?? [];
    members.push(well);
    groups.set(parent, members);
  }
  const depth = (well: Well) => {
    let level = 0;
    for (
      let parent = parentWellId(well);
      parent && byId.has(parent) && level < 64;
      parent = parentWellId(byId.get(parent)!)
    )
      level++;
    return level;
  };
  return [...groups]
    .map(([id, members]) => {
      const parent = byId.get(id)!;
      let spacing = Infinity;
      members.forEach((a, index) => {
        const fromParent = Math.hypot(a.x - parent.x, a.z - parent.z);
        // A resource keeps its label at its centre; an open pool names itself on
        // its rim, and a member at a pool's centre is spaced from the ring.
        if (!parent.pool || members.length === 1)
          if (fromParent > 1e-3) spacing = Math.min(spacing, fromParent);
        for (const b of members.slice(index + 1))
          spacing = Math.min(spacing, Math.hypot(a.x - b.x, a.z - b.z));
      });
      return {
        id,
        depth: depth(parent),
        spacing: Number.isFinite(spacing) ? spacing : parent.radius,
      };
    })
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
    .map(({ id, spacing }) => ({ id, spacing }));
}

export class ObservatoryRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  private controls: OrbitControls;
  private geometry: THREE.BufferGeometry = new THREE.PlaneGeometry(
    1,
    1,
    1,
    1,
  ).rotateX(-Math.PI / 2);
  private field: PackedField | undefined;
  private fieldTexture = new THREE.DataTexture(
    new Float32Array(12),
    3,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  private fieldColors = new Map<string, FieldColor>();
  private extent = fieldBounds([]);
  private terrainPlan = "";
  private terrainDetails: BasinGeometry | undefined;
  private terrainFootprints: Well[] = [];
  private pressureAppliedKey = "";
  private pressureRejectedKey: string | undefined;
  private pressurePending: { key: string; since: number } | undefined;
  private geometryTransition = false;
  private geometryRevision = 0;
  private focusGeometry: THREE.BufferGeometry | undefined;
  private focusPlan = "";
  private uniforms = {
    uField: { value: this.fieldTexture },
    uFieldSize: { value: new THREE.Vector2(3, 1) },
    uFieldColumns: { value: 1 },
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
    // Draped tethers sit on the analytic surface; the mesh yields to them.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  private terrain = new THREE.Mesh(this.geometry, this.material);
  private skyGeometry = new THREE.SphereGeometry(1, 32, 16);
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
    depthTest: false,
  });
  private sky = new THREE.Mesh(this.skyGeometry, this.skyMaterial);
  private wells: Well[] = [];
  private targets: Well[] = [];
  private settings: RendererSettings;
  private activityRenderer = new ActivityRenderer();
  private tethers = new TetherRenderer();
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
  private presentationMoved = false;
  private featuredId: string | null = null;
  private tour = new PresentationTour();
  /** The subject a tour stop or watch is framing, and where its travel began. */
  private program: {
    id: string;
    origin: OrbitFrame;
    elapsed: number;
    sequence: number;
  } | null = null;
  private orbitAzimuth = 0.18;
  private orbitFrames = new Map<string, OrbitFrame | null>();
  private nextStats = 0;
  private renderedFrames = 0;
  private frames: number[] = [];
  private labelLayout = new LabelLayout();
  /** Visible parents, outermost first, with the closest spacing (world units)
   * between their members or between a member and the parent itself. */
  private memberSpacing: { id: string; spacing: number }[] = [];
  private zoomDisclosed = new Set<string>();
  private lensAmount = 0;
  private focusedSubject: string | null = null;
  /** Camera distance of the last direct focus framing; zooming out past it
   * releases the focused group's member names. */
  private focusFraming = Infinity;
  private savedFocusPoses = new Map<
    string | null,
    { position: THREE.Vector3; target: THREE.Vector3 }
  >();
  private needsDraw = true;
  private lost = false;
  private observer: ResizeObserver;
  private labelObserver: ResizeObserver;
  private labelTop = 52;
  private obstacles: LabelRect[] = [];
  /** Re-reads stage panels; their classification depends on stage size. */
  private measurePanels: () => void = () => {};
  /** Stage space wide panels cover at the top and bottom, in CSS pixels. */
  private inset = { top: 0, bottom: 0 };
  private callouts = new CalloutLayout();
  /** The group whose members are named in callout columns, if any. */
  private calloutSubject: string | null = null;
  /** The group currently framed by focus, tour or watch. */
  private framed: string | null = null;
  private calloutsChanging = false;
  /**
   * Labels still settling over an unchanged frame. They update the DOM layer
   * only: redrawing the terrain for them costs a full WebGL frame.
   */
  private labelsChanging = false;
  /** Labels drawn last frame; a closing group's names finish fading out. */
  private shownLabels = new Set<string>();
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
    this.configureFieldTexture();
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
    this.terrain.frustumCulled = false;
    this.scene.add(this.terrain);
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
    this.scene.add(this.tethers.group);
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
      this.reconcileViewport();
      cancelAnimationFrame(this.frame);
      this.hooks.visibility?.(this.visible && !document.hidden);
      if (!document.hidden && this.visible && !this.lost) {
        this.previous = 0;
        this.needsDraw = true;
        this.frame = requestAnimationFrame(this.animate);
      }
    });
    const wakeViewport = () => this.reconcileViewport();
    document.addEventListener("scroll", wakeViewport, {
      capture: true,
      passive: true,
    });
    this.listeners.push(() =>
      document.removeEventListener("scroll", wakeViewport, true),
    );
    this.listen(window, "resize", wakeViewport);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    const toolbar = container.parentElement?.querySelector<HTMLElement>(
      ".gravity-activity-bar, [data-gravity-label-inset]",
    );
    // Overlay panels on the stage that labels avoid where they are, rather
    // than across the whole width as a top inset does.
    const panels = [
      ...(container.parentElement?.querySelectorAll<HTMLElement>(
        "[data-gravity-obstacle]",
      ) ?? []),
    ];
    const measureToolbar = (this.measurePanels = () => {
      this.labelTop = toolbar
        ? toolbar.offsetTop + toolbar.offsetHeight + 12
        : panels.length
          ? 12
          : 52;
      this.obstacles = panels
        .filter((panel) => panel.offsetWidth > 0 && panel.offsetHeight > 0)
        .map((panel) => ({
          x: panel.offsetLeft + panel.offsetWidth / 2,
          y: panel.offsetTop + panel.offsetHeight / 2,
          width: panel.offsetWidth,
          height: panel.offsetHeight,
        }));
      // A panel spanning most of the stage's top or bottom edge narrows the
      // band the camera fits subjects into.
      const inset = { top: 0, bottom: 0 };
      for (const panel of this.obstacles) {
        if (panel.width < this.width * 0.5) continue;
        if (panel.y > this.height / 2)
          inset.bottom = Math.max(
            inset.bottom,
            this.height - (panel.y - panel.height / 2) + 8,
          );
        else inset.top = Math.max(inset.top, panel.y + panel.height / 2 + 8);
      }
      if (inset.top !== this.inset.top || inset.bottom !== this.inset.bottom) {
        this.inset = inset;
        this.applyViewOffset();
      }
      this.needsDraw = true;
    });
    this.labelObserver = new ResizeObserver(measureToolbar);
    if (toolbar) this.labelObserver.observe(toolbar);
    for (const panel of panels) this.labelObserver.observe(panel);
    measureToolbar();
    this.intersection = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.target === container))
        this.reconcileViewport();
    });
    this.intersection.observe(container);
    this.resize();
    this.frame = requestAnimationFrame(this.animate);
  }

  private configureFieldTexture() {
    this.fieldTexture.minFilter = THREE.NearestFilter;
    this.fieldTexture.magFilter = THREE.NearestFilter;
    this.fieldTexture.generateMipmaps = false;
    this.fieldTexture.flipY = false;
    this.fieldTexture.colorSpace = THREE.NoColorSpace;
    this.fieldTexture.unpackAlignment = 1;
    this.fieldTexture.needsUpdate = true;
  }

  private submitField(wells: Well[], settings: RendererSettings) {
    const next = packField(
      wells,
      this.renderer.capabilities.maxTextureSize,
      (well) => {
        const hex = settings.palette[well.sector] ?? settings.palette.reporting;
        let rgb = this.fieldColors.get(hex);
        if (!rgb) {
          const color = new THREE.Color(hex);
          rgb = [color.r, color.g, color.b];
          this.fieldColors.set(hex, rgb);
        }
        return rgb;
      },
      (well) =>
        settings.activity.source.attention?.(well.id) ??
        (well.attention ? 0.5 : 0),
      this.field,
    );
    if (next.data !== this.field?.data) {
      this.fieldTexture.dispose();
      this.fieldTexture = new THREE.DataTexture(
        next.data,
        next.width,
        next.height,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      this.configureFieldTexture();
      this.uniforms.uField.value = this.fieldTexture;
      this.uniforms.uFieldSize.value.set(next.width, next.height);
      this.uniforms.uFieldColumns.value = next.columns;
    } else if (next.changed) this.fieldTexture.needsUpdate = true;
    this.field = next;
    this.uniforms.uCount.value = next.count;
  }

  private coverLandscape(wells: Well[]) {
    const transition = fieldTransition([], wells);
    const extent = transition.bounds;
    if (transition.key !== this.terrainPlan) {
      this.terrainFootprints = transition.footprints;
      this.pressureAppliedKey = "";
      this.pressureRejectedKey = undefined;
      this.pressurePending = undefined;
      this.replaceTerrain(basinGeometry(transition.footprints, extent));
      this.terrainPlan = transition.key;
    }
    this.terrain.position.set(0, 0, 0);
    this.extent = extent;
    const span = Math.hypot(extent.width, extent.depth, extent.vertical);
    const pose = fittedLandscapePose(wells, this.camera.aspect, 0.18, 0.23);
    const fittedDistance = Math.hypot(
      pose.position.x - pose.target.x,
      pose.position.y - pose.target.y,
      pose.position.z - pose.target.z,
    );
    this.controls.maxDistance = Math.max(220, fittedDistance * 1.5, span * 4);
    this.camera.far = Math.max(
      500,
      this.controls.maxDistance + span * 3 + extent.apron * 2,
    );
    this.camera.updateProjectionMatrix();
  }

  private replaceTerrain(details: BasinGeometry) {
    this.geometry.dispose();
    this.geometry = details.geometry;
    this.geometryRevision = (this.geometryRevision ?? 0) + 1;
    this.focusGeometry?.dispose();
    this.focusGeometry = undefined;
    this.focusPlan = "";
    this.terrain.geometry = this.geometry;
    this.terrainDetails = details;
    this.needsDraw = true;
  }

  private refineLandscape(now: number) {
    if (!this.terrainDetails || this.terrainDetails.detailScale <= 1) return;
    const main = fieldRefinement(
      this.wells,
      this.controls.target,
      this.camera.position.distanceTo(this.controls.target),
      this.height,
      this.camera.fov,
    );
    const selected = this.settings.focus
      ? this.wells.find((well) => well.id === this.settings.selected)
      : undefined;
    const lens = selected
      ? fieldRefinement(
          this.wells,
          selected,
          Math.max(10, selected.radius * Math.max(1, selected.aspect) * 5),
          Math.min(640, this.lensViewport().radius * 2),
          this.focusCamera.fov,
        )
      : null;
    const regions = [main, lens].filter((region) => region !== null);
    if (regions.length === 2 && JSON.stringify(main) === JSON.stringify(lens))
      regions.pop();
    const key = regions.length ? JSON.stringify(regions) : "";
    if (key === this.pressureAppliedKey) {
      this.pressureRejectedKey = undefined;
      this.pressurePending = undefined;
      return;
    }
    if (key === this.pressureRejectedKey) {
      this.pressurePending = undefined;
      return;
    }
    // Rebuild after a stable window request, never on every camera tween/frame.
    // There is one owned full mesh and one optional lens subset, with no view cache.
    if (this.pressurePending?.key !== key) {
      this.pressurePending = { key, since: now };
      return;
    }
    if (now - this.pressurePending.since < 180) return;
    const details = basinGeometry(
      this.terrainFootprints,
      this.extent,
      120_000,
      regions,
    );
    if (
      details.quality === "uniform-pressure" &&
      (this.terrainDetails.quality === "local" ||
        details.detailScale > this.terrainDetails.detailScale)
    ) {
      // A bounded attempt may fail, but it cannot flatten a usable scene.
      // Remember one rejected request without treating it as installed detail.
      details.geometry.dispose();
      this.pressureRejectedKey = key;
      this.pressurePending = undefined;
      this.needsDraw = true;
      return;
    }
    this.replaceTerrain(details);
    this.pressureAppliedKey = key;
    this.pressureRejectedKey = undefined;
    this.pressurePending = undefined;
  }

  private publishFieldDiagnostics() {
    const canvas = this.renderer.domElement;
    canvas.dataset.gravityRenderedFrames = String(++this.renderedFrames);
    const recorded = activeTransfers(this.activitySnapshot).filter(
      (flow) => flow.recorded,
    );
    canvas.dataset.gravityRecordedRequests = String(
      recorded.filter((flow) => flow.phase === "outbound").length,
    );
    canvas.dataset.gravityRecordedResponses = String(
      recorded.filter((flow) => flow.phase === "response").length,
    );
    canvas.dataset.gravityLensAmount = String(this.lensAmount);
    canvas.dataset.gravitySelectedPresent = String(
      this.wells.some((well) => well.id === this.settings.selected),
    );
    canvas.dataset.gravityContributions = String(this.uniforms.uCount.value);
    canvas.dataset.gravityLastContribution =
      this.wells[this.uniforms.uCount.value - 1]?.id ?? "";
    canvas.dataset.gravityFieldTexture = `${this.field?.width ?? 0}x${this.field?.height ?? 0}`;
    canvas.dataset.gravityTerrainVertices = String(
      this.geometry.attributes.position!.count,
    );
    canvas.dataset.gravityTerrainBounds = JSON.stringify(
      this.terrainDetails?.bounds,
    );
    canvas.dataset.gravityGeometryBytes = String(
      this.terrainDetails?.bytes ?? 0,
    );
    canvas.dataset.gravityActiveBasins = String(
      this.terrainDetails?.basins ?? 0,
    );
    canvas.dataset.gravityGeometryDetailScale = String(
      this.terrainDetails?.detailScale ?? 1,
    );
    canvas.dataset.gravityPlanningCandidates = String(
      this.terrainDetails?.planningCandidates ?? 0,
    );
    canvas.dataset.gravityPlanningVisits = String(
      this.terrainDetails?.planningVisits ?? 0,
    );
    canvas.dataset.gravityPlanningBudget = String(
      this.terrainDetails?.planningBudget ?? 0,
    );
    canvas.dataset.gravityPlanningPasses = String(
      this.terrainDetails?.planningPasses ?? 0,
    );
    canvas.dataset.gravityRefinementRejected = String(
      !!this.pressureRejectedKey,
    );
    canvas.dataset.gravityGeometryQuality =
      this.terrainDetails?.quality ?? "local";
    canvas.dataset.gravityDrawCalls = String(this.renderer.info.render.calls);
    canvas.dataset.gravityGeometries = String(
      this.renderer.info.memory.geometries,
    );
    canvas.dataset.gravityTextures = String(this.renderer.info.memory.textures);
    canvas.dataset.gravityFieldBytes = String(this.field?.data.byteLength ?? 0);
    canvas.dataset.gravityCameraFar = String(this.camera.far);
    canvas.dataset.gravityMaxDistance = String(this.controls.maxDistance);
  }

  private listen(target: EventTarget, event: string, handler: EventListener) {
    target.addEventListener(event, handler);
    this.listeners.push(() => target.removeEventListener(event, handler));
  }

  private reconcileViewport() {
    if (this.lost) return;
    const bounds = this.container.getBoundingClientRect();
    let left = Math.max(0, bounds.left);
    let right = Math.min(innerWidth, bounds.right);
    let top = Math.max(0, bounds.top);
    let bottom = Math.min(innerHeight, bounds.bottom);
    for (
      let parent = this.container.parentElement;
      parent && right > left && bottom > top;
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent);
      const clip = parent.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
        left = Math.max(left, clip.left);
        right = Math.min(right, clip.right);
      }
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
        top = Math.max(top, clip.top);
        bottom = Math.min(bottom, clip.bottom);
      }
    }
    const visible = right > left && bottom > top;
    if (this.visible === visible) return;
    // Reconcile current geometry instead of trusting an older queued notification.
    this.visible = visible;
    this.renderer.domElement.dataset.gravityVisible = String(visible);
    this.hooks.visibility?.(visible && !document.hidden);
    cancelAnimationFrame(this.frame);
    if (visible && !document.hidden) {
      this.previous = 0;
      this.needsDraw = true;
      this.frame = requestAnimationFrame(this.animate);
    }
  }

  update(wells: Well[], settings: RendererSettings) {
    const firstPopulation = this.targets.length === 0 && wells.length > 0;
    this.renderer.domElement.dataset.gravityFocusRequested = String(
      settings.focus,
    );
    this.renderer.domElement.dataset.gravitySelected = settings.selected ?? "";
    const previousTargets = new Map(
      this.targets.map((well) => [well.id, well]),
    );
    const layoutChanged =
      wells.length !== this.targets.length ||
      wells.some((well) => {
        const previous = previousTargets.get(well.id);
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
    const active = new Set(wells.map((well) => well.id));
    for (const id of this.savedFocusPoses.keys())
      if (id && !active.has(id)) this.savedFocusPoses.delete(id);
    const complete = [
      ...wells,
      ...this.wells.filter((well) => !active.has(well.id)),
    ];
    this.fieldColors.clear();
    this.submitField(complete, settings);
    this.coverLandscape([...this.wells, ...wells]);
    this.geometryTransition ||= layoutChanged;
    const cameraChanged =
      settings.cameraMode !== this.settings.cameraMode ||
      (settings.cameraMode === "watch" &&
        (settings.watch ?? null) !== (this.settings.watch ?? null));
    if (layoutChanged) this.orbitFrames.clear();
    const activityChanged =
      settings.activity.source !== this.settings.activity.source ||
      settings.activity.trace !== this.settings.activity.trace;
    this.targets = wells;
    this.settings = settings;
    this.memberSpacing = memberSpacing(wells);
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
      this.tour.reset();
      this.program = null;
      this.orbitAzimuth = this.presentationAzimuth;
    }
    const byId = new Map(wells.map((well) => [well.id, well]));
    const preempted = this.tour.setStops(
      (settings.stops ?? hostTourStops(wells))
        .filter((id) => byId.has(id))
        .map((id) => ({ id, attention: byId.get(id)!.attention })),
    );
    if (
      preempted &&
      settings.cameraMode === "tour" &&
      !this.presentationInterrupted
    )
      this.beginProgram(preempted);
    if (
      firstPopulation ||
      (settings.cameraMode === "composed" && (layoutChanged || cameraChanged))
    ) {
      if (this.focusedSubject && active.has(this.focusedSubject))
        this.focusSubject(this.focusedSubject, { refit: true });
      else this.preset("overview");
    }
    if (
      settings.cameraMode === "orbit" ||
      settings.cameraMode === "tour" ||
      settings.cameraMode === "watch"
    )
      this.cameraTween = null;
    this.uniforms.uWarning.value.set(settings.palette.attention);
    this.uniforms.uReporting.value.set(settings.palette.reporting);
    this.uniforms.uFailure.value.set(settings.palette.unhealthy);
    this.needsDraw = true;
    this.reconcileViewport();
  }

  preset(preset: "overview" | "top" | "angle") {
    this.presentationMoved = false;
    this.focusedSubject = null;
    this.focusFraming = Infinity;
    this.renderer.domElement.dataset.gravityMainFocus = "";
    const pose = fittedLandscapePose(
      this.targets,
      this.camera.aspect,
      preset === "angle" ? -0.65 : 0.18,
      preset === "top" ? 1.55 : preset === "angle" ? 0.72 : 0.95,
      this.band(),
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

  /** Accept the displayed reading pose as this active subject without fitting it. */
  adoptSubject(id: string): boolean {
    if (!this.targets.some((well) => well.id === id)) return false;
    this.focusedSubject = id;
    this.focusFraming = this.camera.position.distanceTo(this.controls.target);
    this.presentationMoved = false;
    this.presentationInterrupted = true;
    this.presentationEntry = null;
    this.featuredId = id;
    this.cameraTween = null;
    this.renderer.domElement.dataset.gravityMainFocus = id;
    this.needsDraw = true;
    return true;
  }

  focusSubject(
    id: string | null,
    options: { immediate?: boolean; restore?: boolean; refit?: boolean } = {},
  ): boolean {
    if (
      id &&
      this.settings.cameraMode === "watch" &&
      this.settings.watch === id &&
      !this.presentationInterrupted
    ) {
      // The watch orbit owns the camera; it already frames this subject.
      if (!this.targets.some((well) => well.id === id)) return false;
      this.focusedSubject = id;
      this.focusFraming = Infinity;
      this.featuredId = id;
      this.renderer.domElement.dataset.gravityMainFocus = id;
      this.needsDraw = true;
      return true;
    }
    if (
      id === this.focusedSubject &&
      !options.refit &&
      !options.restore &&
      !this.presentationMoved
    )
      return true;
    let pose = id
      ? focusedLandscapePose(
          this.targets,
          id,
          this.camera.aspect,
          1,
          this.band(),
        )
      : fittedLandscapePose(
          this.targets,
          this.camera.aspect,
          undefined,
          undefined,
          this.band(),
        );
    if (!pose) return false;
    // A dense group leaves room beside it for its callout columns.
    if (
      id &&
      this.calloutDense(
        id,
        Math.hypot(
          pose.position.x - pose.target.x,
          pose.position.y - pose.target.y,
          pose.position.z - pose.target.z,
        ),
        1,
      )
    )
      pose =
        focusedLandscapePose(
          this.targets,
          id,
          this.camera.aspect,
          CALLOUT_FRAMING,
          this.band(),
        ) ?? pose;
    if (!options.restore && !options.refit) {
      this.savedFocusPoses.set(this.focusedSubject, {
        position: this.cameraTween?.to.clone() ?? this.camera.position.clone(),
        target:
          this.cameraTween?.targetTo.clone() ?? this.controls.target.clone(),
      });
    }
    const saved = options.restore ? this.savedFocusPoses.get(id) : undefined;
    const position =
      saved?.position.clone() ??
      new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z);
    const target =
      saved?.target.clone() ??
      new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z);
    this.focusedSubject = id;
    this.focusFraming = id ? position.distanceTo(target) : Infinity;
    this.presentationMoved = false;
    this.presentationInterrupted = true;
    this.presentationEntry = null;
    this.featuredId = id;
    if (options.immediate || !this.settings.motion) {
      this.cameraTween = null;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
    } else {
      this.cameraTween = {
        from: this.camera.position.clone(),
        to: position,
        targetFrom: this.controls.target.clone(),
        targetTo: target,
        time: 0,
      };
    }
    this.renderer.domElement.dataset.gravityMainFocus = id ?? "";
    this.needsDraw = true;
    this.reconcileViewport();
    return true;
  }

  /** Share of the stage height between wide panels; subjects fit within it. */
  private band() {
    return this.height > 1
      ? Math.max(
          0.5,
          (this.height - this.inset.top - this.inset.bottom) / this.height,
        )
      : 1;
  }

  /** Centre the view on the band between wide panels. */
  private applyViewOffset() {
    if (this.width <= 1 || this.height <= 1) return;
    const shift = (this.inset.bottom - this.inset.top) / 2;
    if (shift)
      this.camera.setViewOffset(
        this.width,
        this.height,
        0,
        shift,
        this.width,
        this.height,
      );
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.orbitFrames.clear();
    this.needsDraw = true;
  }

  lensViewport() {
    return {
      x: this.width * 0.76,
      y: this.height * 0.3,
      radius: Math.min(this.height * 0.22, this.width * 0.22, 220),
    };
  }

  refreshActivity() {
    this.activitySnapshot = this.settings.activity.source.snapshot();
    this.hooks.activity?.(this.activitySnapshot);
    this.nextActivity = 0;
    this.needsDraw = true;
  }

  measureAnchor(id: string, width: number, height: number) {
    if (this.labelLayout.measure(id, width, height)) this.labelsChanging = true;
  }

  private resize() {
    this.width = Math.max(this.container.clientWidth, 1);
    this.height = Math.max(this.container.clientHeight, 1);
    this.hooks.viewport(this.width / this.height < 0.9);
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.measurePanels();
    this.applyViewOffset();
    this.coverLandscape([...this.wells, ...this.targets]);
    this.overlayCamera.left = -this.width / 2;
    this.overlayCamera.right = this.width / 2;
    this.overlayCamera.top = this.height / 2;
    this.overlayCamera.bottom = -this.height / 2;
    this.overlayCamera.updateProjectionMatrix();
    if (this.settings.cameraMode === "composed") {
      if (this.focusedSubject)
        this.focusSubject(this.focusedSubject, {
          refit: true,
          immediate: true,
        });
      else this.preset("overview");
    }
    this.needsDraw = true;
    this.reconcileViewport();
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
    if (simulating)
      this.settings.activity.source.advance?.(
        this.settings.activity.source.clock === "elapsed"
          ? interval / 1000
          : dt,
      );
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
    if (this.geometryTransition && !changing) {
      this.coverLandscape(this.targets);
      this.geometryTransition = false;
    }
    this.submitField(this.wells, this.settings);
    // Tethers follow settled basins only; before this point `changing` means
    // some basin is still moving. They join the frame that settles the layout:
    // a separate later frame would cost a whole terrain redraw.
    changing =
      this.tethers.update(
        this.targets,
        !changing,
        this.settings.palette,
        this.settings.theme === "midnight",
      ) || changing;
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
        this.settings.cameraMode === "tour" ||
        this.settings.cameraMode === "watch");
    // Automatic camera travel invalidates an earlier same-ID direct focus pose.
    if (automatic && moving && this.settings.cameraMode !== "orbit") {
      this.presentationMoved = true;
      this.presentationElapsed += dt;
      const pose = this.programPose(dt);
      if (pose) {
        const smoothing = 1 - Math.exp(-dt * 6);
        this.camera.position.lerp(
          new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z),
          smoothing,
        );
        this.controls.target.lerp(
          new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z),
          smoothing,
        );
      }
      changing = true;
    } else if (automatic && moving) {
      this.presentationMoved = true;
      this.presentationElapsed += dt;
      const pose = presentationPose(
        this.targets,
        this.camera.aspect,
        this.presentationElapsed,
        this.presentationAzimuth,
        this.band(),
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
      changing = true;
    }
    this.controls.enableDamping =
      moving && this.settings.cameraMode === "manual";
    changing = this.controls.update(dt) || changing;
    if (this.needsDraw || changing || this.pressurePending)
      this.refineLandscape(now);
    this.uniforms.uFogStart.value =
      this.camera.position.distanceTo(this.controls.target) +
      Math.max(18, Math.hypot(this.extent.width, this.extent.depth));
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
        (2 *
          this.camera.position.distanceTo(this.controls.target) *
          Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) /
          this.height,
      );
      this.renderer.info.reset();
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(
        this.settings.theme === "midnight" ? 0x08101a : 0xf6f5f0,
      );
      this.sky.position.copy(this.camera.position);
      this.renderer.render(this.scene, this.camera);
      this.renderer.domElement.dataset.gravityCameraPosition =
        this.camera.position
          .toArray()
          .map((value) => value.toFixed(3))
          .join(",");
      this.renderer.domElement.dataset.gravityCameraTarget =
        this.controls.target
          .toArray()
          .map((value) => value.toFixed(3))
          .join(",");
      if (this.lensAmount > 0.005 && selected) this.renderLens(selected, dt);
      else {
        this.focusReady = false;
        this.focusChanging = false;
      }
      this.publishFieldDiagnostics();
      this.needsDraw = false;
      this.publishAnchors(dt);
      this.needsDraw = this.focusChanging;
      this.labelsChanging = this.labelLayout.changing || this.calloutsChanging;
      this.hooks.lens(this.lensAmount);
      this.frames.push(interval);
    } else if (this.labelsChanging) {
      // The camera and terrain are unchanged, so the last frame's projection
      // still holds; only the label layer moves.
      this.publishAnchors(dt);
      this.labelsChanging = this.labelLayout.changing || this.calloutsChanging;
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
        contributions: this.uniforms.uCount.value,
        terrainVertices: this.geometry.attributes.position!.count,
        geometryBytes: this.terrainDetails?.bytes ?? 0,
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
        activeBasins: this.terrainDetails?.basins ?? 0,
        detailScale: this.terrainDetails?.detailScale ?? 1,
        planningCandidates: this.terrainDetails?.planningCandidates ?? 0,
        planningVisits: this.terrainDetails?.planningVisits ?? 0,
        planningBudget: this.terrainDetails?.planningBudget ?? 0,
        planningPasses: this.terrainDetails?.planningPasses ?? 0,
        geometryQuality: this.terrainDetails?.quality ?? "local",
        focusVertices: this.focusGeometry?.attributes.position?.count ?? 0,
      });
      this.frames = [];
      this.nextStats = now + 1200;
    }
    this.frame = requestAnimationFrame(this.animate);
  };

  /** The subject an uninterrupted tour stop or watch orbit is framing. */
  private programSubject() {
    return !this.presentationInterrupted &&
      (this.settings.cameraMode === "tour" ||
        this.settings.cameraMode === "watch")
      ? (this.program?.id ?? null)
      : null;
  }

  /** Start framing a subject from wherever the camera is now. */
  private beginProgram(stop: TourStop | { id: string; sequence: number }) {
    const current = frameOfPose(this.camera.position, this.controls.target);
    this.program = {
      id: stop.id,
      origin: current,
      elapsed: 0,
      sequence: stop.sequence,
    };
    if (!("reason" in stop)) return;
    this.hooks.tour?.(stop);
    if (stop.id !== this.featuredId) {
      this.featuredId = stop.id;
      if (this.hooks.featured) this.hooks.featured(stop.id);
      else this.hooks.select(stop.id);
    }
  }

  /** The orbit frame for a subject, narrowed for callout columns when its
   * members are too close on screen to name in place. */
  private subjectFrame(id: string): OrbitFrame | null {
    const key = `${id}|${this.camera.aspect}|${this.height}`;
    if (!this.orbitFrames.has(key)) {
      const band = this.band();
      const base = orbitFrame(
        this.targets,
        id,
        this.camera.aspect,
        1,
        ORBIT_ELEVATION,
        band,
      );
      this.orbitFrames.set(
        key,
        base && this.calloutDense(id, base.distance, 1)
          ? orbitFrame(
              this.targets,
              id,
              this.camera.aspect,
              CALLOUT_FRAMING,
              ORBIT_ELEVATION,
              band,
            )
          : base,
      );
    }
    return this.orbitFrames.get(key)!;
  }

  /** The tour or watch camera pose for this frame. */
  private programPose(dt: number) {
    let subject: string, elapsed: number, travel: number;
    if (this.settings.cameraMode === "tour") {
      const step = this.tour.advance(dt);
      if (!step) return null;
      if (step.changed || this.program?.sequence !== step.stop.sequence)
        this.beginProgram(step.stop);
      subject = step.stop.id;
      elapsed = step.elapsed;
      travel = step.stop.travel;
    } else {
      const id = this.settings.watch;
      if (!id || !this.targets.some((well) => well.id === id)) return null;
      if (this.program?.id !== id) this.beginProgram({ id, sequence: 0 });
      else this.program.elapsed += dt;
      subject = id;
      elapsed = this.program!.elapsed;
      travel = WATCH_TRAVEL;
    }
    const frame = this.subjectFrame(subject);
    if (!frame || !this.program) return null;
    this.orbitAzimuth += ORBIT_RATE * dt;
    return orbitPose(
      elapsed < travel
        ? travelFrame(this.program.origin, frame, elapsed / travel)
        : frame,
      this.orbitAzimuth,
    );
  }

  /** On-screen spacing, in CSS pixels, between a group's closest members
   * seen from `distance`; null for a group too small for callouts. */
  private memberPixels(id: string, distance: number) {
    const spacing = this.memberSpacing.find((item) => item.id === id)?.spacing;
    if (spacing === undefined) return null;
    let members = 0;
    for (const well of this.targets) if (parentWellId(well) === id) members++;
    if (members < CALLOUT_MINIMUM) return null;
    const focal =
      this.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    return (spacing / Math.max(0.001, distance)) * focal;
  }

  /** Whether a group's members sit closer on screen than a compact label,
   * seen from `distance` with the stage narrowed to `narrow`. */
  private calloutDense(id: string, distance: number, narrow: number) {
    const pixels = this.memberPixels(id, distance);
    return pixels !== null && pixels / narrow < CALLOUT_ENTER;
  }

  /** Whether the framed group names its members in callout columns now. */
  private calloutActive(id: string, byId: Map<string, Well>) {
    const well = byId.get(id)!;
    const pixels = this.memberPixels(
      id,
      this.camera.position.distanceTo(new THREE.Vector3(well.x, 0, well.z)),
    );
    return (
      pixels !== null &&
      pixels < (this.calloutSubject === id ? CALLOUT_EXIT : CALLOUT_ENTER)
    );
  }

  private anchorHeight(well: Well) {
    return labelHeight(
      well,
      well.kind === "service"
        ? this.targets.find((target) => target.id === well.hostId)
        : undefined,
    );
  }

  /** Parents whose member labels are disclosed. Disclosure follows the camera:
   * members are named once neighbours sit far enough apart on screen to hold
   * their labels, and only inside an already open parent. A directly focused
   * group is also named while the camera stays near its framing, but zooming
   * back out always returns to top-level names. Hysteresis keeps admission
   * steady; the threshold grows with large screens so an overview stays quiet.
   */
  private disclosedParents(byId: Map<string, Well>) {
    const open = new Set<string>();
    const focal =
      this.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    // About one label width, so a ring's names appear together, not piecemeal.
    const threshold = Math.max(100, Math.min(this.width, this.height) * 0.14);
    const framed =
      this.programSubject() ??
      (this.focusedSubject &&
      this.camera.position.distanceTo(this.controls.target) <=
        this.focusFraming * 1.2
        ? this.focusedSubject
        : null);
    this.framed = framed && byId.has(framed) ? framed : null;
    const center = new THREE.Vector3();
    for (const { id, spacing } of this.memberSpacing) {
      const well = byId.get(id);
      const parent = well ? parentWellId(well) : null;
      // A framed group opens even inside a closed parent: zooming into a
      // nested ring names that ring.
      if (
        !well ||
        (id !== framed && parent && byId.has(parent) && !open.has(parent))
      ) {
        this.zoomDisclosed.delete(id);
        continue;
      }
      center.set(well.x, 0, well.z);
      const pixels =
        (spacing / Math.max(0.001, this.camera.position.distanceTo(center))) *
        focal;
      if (
        id === framed ||
        pixels > threshold * (this.zoomDisclosed.has(id) ? 0.84 : 1)
      ) {
        this.zoomDisclosed.add(id);
        open.add(id);
      } else this.zoomDisclosed.delete(id);
    }
    return open;
  }

  private publishAnchors(dt: number) {
    const byId = new Map(this.targets.map((target) => [target.id, target]));
    const open = this.disclosedParents(byId);
    const forward = {
      x: this.controls.target.x - this.camera.position.x,
      z: this.controls.target.z - this.camera.position.z,
    };
    const enclosing = new Set<string>();
    for (
      let parent = this.framed ? parentWellId(byId.get(this.framed)!) : null;
      parent && byId.has(parent) && !enclosing.has(parent);
      parent = parentWellId(byId.get(parent)!)
    )
      enclosing.add(parent);
    // Services and deployments are named like any member once their host is
    // open or framed; the optional lens still names a selected host's own.
    const disclosedWell = (well: Well) => {
      const parent = parentWellId(well);
      return (
        !parent ||
        !byId.has(parent) ||
        open.has(parent) ||
        well.attention ||
        well.id === this.settings.selected
      );
    };
    // A member gets a label element only once its group opens (or while its
    // label is still fading out), so the stage holds elements only for names
    // that can be shown.
    const anchors: Anchor[] = this.wells
      .filter(
        (w) =>
          byId.has(w.id) && (disclosedWell(w) || this.shownLabels.has(w.id)),
      )
      .map((well) => {
        // An open pool names its members, so its own label moves to the rim;
        // so does a pool around a framed nested ring, which it would cover.
        const rim = well.pool && (open.has(well.id) || enclosing.has(well.id));
        const point = rim
          ? poolLabelPoint(well, forward)
          : { x: well.x, y: this.anchorHeight(well), z: well.z };
        const projected = this.project(point.x, point.y, point.z);
        // Every basin stays rendered; nested labels wait for their context.
        const parent = parentWellId(well);
        const nested = !!parent && byId.has(parent);
        const disclosed = disclosedWell(well);
        return {
          id: well.id,
          label: well.label,
          kind: well.kind,
          attention: well.attention,
          sector: well.sector,
          opacity: 0,
          nested,
          open: open.has(well.id) || enclosing.has(well.id),
          rank: nested ? (well.pool ? 20 : 0) : 40,
          ...(nested && well.id !== this.settings.selected
            ? { leash: 44 }
            : {}),
          ...projected,
          visible: projected.visible && disclosed,
        };
      });
    for (const anchor of anchors)
      if (anchor.kind === "project" && this.settings.focus)
        anchor.visible = false;
    this.placeCallouts(anchors, byId, dt);
    if (this.lensAmount > 0.4) {
      for (const anchor of anchors) {
        if (
          Math.hypot(
            anchor.x - this.lensViewport().x,
            anchor.y - this.lensViewport().y,
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
          attention: well.attention,
          sector: well.sector,
          opacity: 0,
          x: this.lensViewport().x + p.x * radius,
          y: this.lensViewport().y - p.y * radius,
          visible: this.lensAmount > 0.95 && p.x * p.x + p.y * p.y < 0.79,
        });
      }
    }
    const placed = this.labelLayout.layout(
      anchors,
      this.width,
      this.height,
      dt,
      this.settings.motion,
      this.labelTop,
      this.settings.selected,
      this.obstacles,
    );
    this.shownLabels = new Set(
      placed
        .filter((anchor) => anchor.opacity > 0.002)
        .map((anchor) => anchor.id),
    );
    this.hooks.anchors(placed);
  }

  /** Name every member of a dense framed group in callout columns. */
  private placeCallouts(
    anchors: Anchor[],
    byId: Map<string, Well>,
    dt: number,
  ) {
    const subject =
      this.framed && this.calloutActive(this.framed, byId) ? this.framed : null;
    if (subject !== this.calloutSubject) {
      this.callouts.reset();
      this.calloutSubject = subject;
    }
    this.calloutsChanging = false;
    if (!subject) return;
    const members = anchors.filter((anchor) => {
      const well = byId.get(anchor.id);
      return well && parentWellId(well) === subject;
    });
    const centreWell = byId.get(subject)!;
    const centre = this.project(
      centreWell.x,
      this.anchorHeight(centreWell),
      centreWell.z,
    );
    // Stage panels, such as the roster, shorten the columns themselves.
    const bottom = this.height - 8;
    const { placements, more, changing } = this.callouts.layout(
      members,
      (id) => this.labelLayout.size(id),
      {
        width: this.width,
        top: this.labelTop,
        bottom,
        obstacles: this.obstacles,
      },
      centre,
      dt,
      this.settings.motion,
    );
    this.calloutsChanging = changing;
    const placed = new Map(placements.map((item) => [item.id, item]));
    for (const anchor of members) {
      const placement = placed.get(anchor.id);
      delete anchor.leash;
      if (!placement) {
        anchor.visible = false;
        continue;
      }
      anchor.x = placement.x;
      anchor.y = placement.y + this.labelLayout.size(anchor.id).height / 2;
      anchor.visible = true;
      anchor.opacity = placement.opacity;
      anchor.fixed = true;
      anchor.callout = { side: placement.side, ...placement.leader };
    }
    for (const pill of more) {
      const id = `overflow-${pill.side}`;
      anchors.push({
        id,
        label: `+${pill.count}`,
        kind: "project",
        attention: false,
        sector: "",
        x: pill.x,
        y: pill.y + this.labelLayout.size(id).height / 2,
        visible: true,
        opacity: 1,
        fixed: true,
        overflow: pill.count,
      });
    }
  }

  private lensRadius() {
    return this.lensViewport().radius;
  }

  private renderLens(selected: Well, dt: number) {
    const center = new THREE.Vector3(selected.x, 0.4, selected.z);
    const distance = Math.max(
      10,
      selected.radius * Math.max(1, selected.aspect) * 5,
    );
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
    this.focusCamera.far = Math.max(
      100,
      this.focusDistance +
        this.extent.vertical * 2 +
        selected.radius * Math.max(1, selected.aspect) * 12,
    );
    this.focusCamera.updateProjectionMatrix();
    const focusPlan =
      this.geometryRevision +
      ":" +
      selected.id +
      ":" +
      (this.focusChanging || this.geometryTransition);
    if (focusPlan !== this.focusPlan || !this.focusGeometry) {
      const target =
        this.targets.find((well) => well.id === selected.id) ?? selected;
      const distance = Math.max(
        this.focusDistance,
        10,
        Math.max(selected.radius, target.radius) *
          Math.max(1, selected.aspect, target.aspect) *
          5,
      );
      this.focusGeometry?.dispose();
      this.focusGeometry = basinGeometryWindow(this.geometry, {
        minX: Math.min(this.focusCenter.x, selected.x, target.x) - distance,
        maxX: Math.max(this.focusCenter.x, selected.x, target.x) + distance,
        minZ: Math.min(this.focusCenter.z, selected.z, target.z) - distance,
        maxZ: Math.max(this.focusCenter.z, selected.z, target.z) + distance,
      });
      this.focusPlan = focusPlan;
    }
    this.renderer.domElement.dataset.gravityFocusVertices = String(
      this.focusGeometry.attributes.position!.count,
    );
    this.renderer.domElement.dataset.gravityFocusGeometryBytes = String(
      this.focusGeometry.attributes.position!.array.byteLength +
        (this.focusGeometry.index?.array.byteLength ?? 0),
    );
    this.renderer.setRenderTarget(this.target);
    this.sky.position.copy(this.focusCamera.position);
    // Crop only the index population. Local samples, full field and material match.
    this.terrain.geometry = this.focusGeometry;
    try {
      this.renderer.render(this.scene, this.focusCamera);
    } finally {
      this.terrain.geometry = this.geometry;
    }
    this.renderer.setRenderTarget(null);
    const radius = this.lensRadius() * this.lensAmount;
    this.lens.scale.set(radius, radius, 1);
    this.lens.position.x = this.lensViewport().x - this.width / 2;
    this.lens.position.y = this.height / 2 - this.lensViewport().y;
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
    this.focusGeometry?.dispose();
    this.fieldTexture.dispose();
    this.material.dispose();
    this.tethers.dispose();
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
