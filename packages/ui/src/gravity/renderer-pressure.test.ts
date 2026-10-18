// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { BufferGeometry, PerspectiveCamera, Vector3 } from "three";
import {
  ObservatoryRenderer,
  type RendererSettings,
  type RendererHooks,
} from "./renderer";
import { surfaceHeight, type Well } from "./model";
import * as basinPlanning from "./basin-geometry";
import { tourTiming } from "./tour";

vi.mock("three", async (original) => {
  const actual = await original<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement("canvas");
      capabilities = { maxTextureSize: 4096 };
      info = {
        autoReset: false,
        render: { calls: 1, triangles: 0 },
        memory: { geometries: 2, textures: 1 },
        reset() {},
      };
      setPixelRatio() {}
      getPixelRatio() {
        return 1;
      }
      setSize() {}
      setRenderTarget() {}
      setClearColor() {}
      clearDepth() {}
      render() {}
      dispose() {}
    },
  };
});

const wells: Well[] = Array.from({ length: 257 }, (_, i) => ({
  id: "active-" + i,
  label: "active-" + i,
  kind: "host",
  hostId: null,
  sector: "test",
  x: (i % 17) * 9,
  z: Math.floor(i / 17) * 9,
  radius: 2,
  depth: 4,
  aspect: 1,
  angle: 0,
  elevation: 0.7,
  profile: 1.1,
  attention: false,
}));
const settings: RendererSettings = {
  theme: "porcelain",
  palette: { reporting: "#2288bb", attention: "#cc8800", unhealthy: "#cc2200" },
  motion: false,
  cameraMode: "manual",
  ambient: false,
  selected: null,
  focus: false,
  activity: {
    source: { snapshot: () => ({ time: 0, transfers: [], events: [] }) },
    running: false,
    follow: false,
    trace: null,
  },
};
type Internals = {
  camera: PerspectiveCamera;
  presentationElapsed: number;
  presentationInterrupted: boolean;
  presentationMoved: boolean;
  focusedSubject: string | null;
  savedFocusPoses: Map<string | null, { position: Vector3; target: Vector3 }>;
  cameraTween: unknown;
  controls: { target: Vector3; update(): void };
  geometry: BufferGeometry;
  geometryRevision: number;
  focusGeometry?: BufferGeometry;
  focusCamera: PerspectiveCamera;
  terrainDetails: {
    leaves: number;
    basins: number;
    planningPasses: number;
    planningCandidates: number;
    planningVisits: number;
    planningBudget: number;
    detailScale: number;
    quality: string;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
};

function setup(
  population = wells,
  width = 1200,
  height = 900,
  viewportHeight = height,
  extraHooks: Partial<RendererHooks> = {},
) {
  let callback: FrameRequestCallback = () => {};
  vi.stubGlobal("requestAnimationFrame", (next: FrameRequestCallback) => {
    callback = next;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", viewportHeight);
  vi.stubGlobal("devicePixelRatio", width < 400 ? 2.75 : 1);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: { value: width },
    clientHeight: { value: height },
  });
  container.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    width,
    height,
    toJSON() {},
  });
  document.body.append(container);
  const anchors = vi.fn(),
    select = vi.fn();
  const renderer = new ObservatoryRenderer(container, settings, {
    anchors,
    stats() {},
    select,
    interrupted() {},
    unavailable() {},
    viewport() {},
    lens() {},
    activity() {},
    visibility() {},
    ...extraHooks,
  });
  renderer.update(population, settings);
  const frame = (now: number) => callback(now);
  frame(0);
  const access = renderer as unknown as Internals;
  const view = (x = 18, z = 18) => {
    access.camera.position.set(x + 3, 5, z + 6);
    access.controls.target.set(x, -1, z);
    access.controls.update();
  };
  const canvas = container.querySelector("canvas")!;
  canvas.getBoundingClientRect = container.getBoundingClientRect;
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};
  return { renderer, access, frame, view, container, canvas, anchors, select };
}

// Interpolate only queried triangles and lazily evaluate their full analytic field.
// This is the disclosed projected diagnostic, not raster silhouette extraction.
function deviation(
  geometry: BufferGeometry,
  subject: Well,
  camera: PerspectiveCamera,
  width = 1200,
  heightPixels = 900,
) {
  const position = geometry.attributes.position!,
    index = geometry.index!;
  const local: {
    a: number;
    b: number;
    c: number;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2);
    const minX = Math.min(position.getX(a), position.getX(b), position.getX(c)),
      maxX = Math.max(position.getX(a), position.getX(b), position.getX(c));
    const minZ = Math.min(position.getZ(a), position.getZ(b), position.getZ(c)),
      maxZ = Math.max(position.getZ(a), position.getZ(b), position.getZ(c));
    if (
      maxX >= subject.x - 7 &&
      minX <= subject.x + 7 &&
      maxZ >= subject.z - 7 &&
      minZ <= subject.z + 7
    )
      local.push({ a, b, c, minX, maxX, minZ, maxZ });
  }
  const heights = new Map<number, number>();
  const height = (i: number) => {
    if (!heights.has(i))
      heights.set(i, surfaceHeight(position.getX(i), position.getZ(i), wells));
    return heights.get(i)!;
  };
  let maximum = 0,
    compared = 0;
  camera.updateMatrixWorld();
  for (const radius of [
    0, 0.2, 0.45, 0.7, 0.9, 1, 1.05, 1.08, 1.2, 1.5, 1.8, 2.5, 3.5,
  ])
    for (let i = 0; i < 64; i++) {
      const angle = (i * Math.PI * 2) / 64;
      const x = subject.x + Math.cos(angle) * radius * subject.radius;
      const z = subject.z + Math.sin(angle) * radius * subject.radius;
      const expected = new Vector3(x, surfaceHeight(x, z, wells), z).project(
        camera,
      );
      if (
        expected.z < -1 ||
        expected.z > 1 ||
        Math.abs(expected.x) > 1 ||
        Math.abs(expected.y) > 1
      )
        continue;
      let sampled: number | undefined;
      for (const { a, b, c, minX, maxX, minZ, maxZ } of local) {
        if (
          x < minX - 1e-6 ||
          x > maxX + 1e-6 ||
          z < minZ - 1e-6 ||
          z > maxZ + 1e-6
        )
          continue;
        const ax = position.getX(a),
          az = position.getZ(a),
          bx = position.getX(b),
          bz = position.getZ(b),
          cx = position.getX(c),
          cz = position.getZ(c);
        const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / determinant;
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / determinant;
        if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) {
          sampled = u * height(a) + v * height(b) + (1 - u - v) * height(c);
          break;
        }
      }
      if (sampled === undefined)
        throw new Error("Sample fell through the joined pressure floor");
      const actual = new Vector3(x, sampled, z).project(camera);
      maximum = Math.max(
        maximum,
        Math.hypot(
          ((actual.x - expected.x) * width) / 2,
          ((actual.y - expected.y) * heightPixels) / 2,
        ),
      );
      compared++;
    }
  expect(compared).toBeGreaterThan(64);
  return maximum;
}

function joined(
  geometry: BufferGeometry,
  bounds: Internals["terrainDetails"]["bounds"],
) {
  const position = geometry.attributes.position!,
    index = geometry.index!;
  const edges = new Map<string, number>();
  let area = 0,
    reversed = 0,
    seams = 0;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2);
    const signed =
      (position.getZ(b) - position.getZ(a)) *
        (position.getX(c) - position.getX(a)) -
      (position.getX(b) - position.getX(a)) *
        (position.getZ(c) - position.getZ(a));
    if (signed <= 0) reversed++;
    area += signed / 2;
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = Math.min(from!, to!) + ":" + Math.max(from!, to!);
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of edges) {
    if (count === 2) continue;
    const [a, b] = key.split(":").map(Number);
    const x = position.getX(a!),
      z = position.getZ(a!);
    const border =
      (x === position.getX(b!) &&
        (Math.abs(x - bounds.minX) < 1e-4 ||
          Math.abs(x - bounds.maxX) < 1e-4)) ||
      (z === position.getZ(b!) &&
        (Math.abs(z - bounds.minZ) < 1e-4 || Math.abs(z - bounds.maxZ) < 1e-4));
    if (count !== 1 || !border) seams++;
  }
  expect(reversed).toBe(0);
  expect(seams).toBe(0);
  expect(area).toBeCloseTo(
    (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ),
    2,
  );
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("shared pressure terrain camera lifecycle", () => {
  it.each([1, 7])(
    "preserves ordinary %i-basin geometry during close viewing",
    (count) => {
      const { renderer, access, frame, view } = setup(wells.slice(0, count));
      try {
        const original = access.geometry;
        expect(access.terrainDetails.detailScale).toBe(1);
        view(0, 0);
        frame(20);
        frame(220);
        frame(500);
        expect(access.geometry).toBe(original);
      } finally {
        renderer.dispose();
      }
    },
  );
  it("corrects the reproduced manual close view while retaining the complete joined field and bounded planning", () => {
    const { renderer, access, frame, view, container } = setup();
    try {
      const base = access.geometry;
      view();
      expect(deviation(base, wells[36]!, access.camera)).toBeGreaterThan(10);
      frame(20);
      frame(100);
      expect(access.geometry).toBe(base);
      frame(220);
      expect(
        deviation(access.geometry, wells[36]!, access.camera),
      ).toBeLessThanOrEqual(2);
      expect(access.geometry).not.toBe(base);
      const details = access.terrainDetails;
      expect(details.basins).toBe(257);
      expect(details.leaves).toBeLessThanOrEqual(120_000);
      expect(details.planningPasses).toBe(1);
      expect(details.planningCandidates).toBeLessThanOrEqual(
        details.planningBudget,
      );
      expect(details.planningVisits).toBeLessThanOrEqual(
        details.planningBudget,
      );
      expect(details.quality).toBe("local");
      const canvas = container.querySelector("canvas")!;
      expect(canvas.dataset.gravityContributions).toBe("257");
      expect(canvas.dataset.gravityLastContribution).toBe("active-256");
      joined(access.geometry, details.bounds);
      const refined = access.geometry,
        revision = access.geometryRevision;
      frame(400);
      frame(600);
      frame(900);
      expect(access.geometry).toBe(refined);
      expect(access.geometryRevision).toBe(revision);
      const draws = canvas.dataset.gravityRenderedFrames;
      frame(1200);
      frame(1400);
      expect(canvas.dataset.gravityRenderedFrames).toBe(draws);
      view(20, 18);
      frame(1500);
      frame(1600);
      expect(access.geometry).toBe(refined);
      frame(1700);
      expect(access.geometry).not.toBe(refined);
      expect(access.geometryRevision).toBe(revision + 1);
    } finally {
      renderer.dispose();
    }
  });
  it("refines selected main focus, preserves lens subsets, and disposes old meshes across focus changes", () => {
    const { renderer, access, frame } = setup();
    try {
      const base = access.geometry;
      const disposed = vi.fn();
      base.addEventListener("dispose", disposed);
      expect(renderer.focusSubject("active-36", { immediate: true })).toBe(
        true,
      );
      frame(20);
      frame(220);
      expect(access.geometry).not.toBe(base);
      expect(disposed).toHaveBeenCalledTimes(1);
      expect(access.terrainDetails.quality).toBe("local");
      expect(
        deviation(access.geometry, wells[36]!, access.camera),
      ).toBeLessThanOrEqual(2);
      renderer.update(wells, {
        ...settings,
        selected: "active-36",
        focus: true,
      });
      frame(240);
      frame(440);
      expect(access.focusGeometry).toBeDefined();
      expect(access.focusGeometry!.attributes.position!.count).toBeLessThan(
        access.geometry.attributes.position!.count,
      );
      const prior = access.geometry,
        priorLens = access.focusGeometry!;
      const terrainDisposed = vi.fn(),
        lensDisposed = vi.fn();
      prior.addEventListener("dispose", terrainDisposed);
      priorLens.addEventListener("dispose", lensDisposed);
      renderer.focusSubject("active-72", { immediate: true });
      renderer.update(wells, {
        ...settings,
        selected: "active-72",
        focus: true,
      });
      frame(460);
      frame(660);
      expect(access.terrainDetails.quality).toBe("local");
      expect(
        deviation(access.geometry, wells[72]!, access.camera),
      ).toBeLessThanOrEqual(2);
      expect(terrainDisposed).toHaveBeenCalledTimes(1);
      expect(lensDisposed).toHaveBeenCalledTimes(1);
      expect(access.terrainDetails.leaves).toBeLessThanOrEqual(120_000);
      const retained = access.geometry;
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      frame(900);
      expect(access.geometry).toBe(retained);
    } finally {
      renderer.dispose();
    }
  });
});

function visibleCenter(
  geometry: BufferGeometry,
  subject: Well,
  camera: PerspectiveCamera,
  width: number,
  height: number,
) {
  const position = geometry.attributes.position!,
    index = geometry.index!;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2);
    const ax = position.getX(a),
      az = position.getZ(a),
      bx = position.getX(b),
      bz = position.getZ(b),
      cx = position.getX(c),
      cz = position.getZ(c);
    if (
      subject.x < Math.min(ax, bx, cx) - 1e-6 ||
      subject.x > Math.max(ax, bx, cx) + 1e-6 ||
      subject.z < Math.min(az, bz, cz) - 1e-6 ||
      subject.z > Math.max(az, bz, cz) + 1e-6
    )
      continue;
    const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    const u =
      ((bz - cz) * (subject.x - cx) + (cx - bx) * (subject.z - cz)) /
      determinant;
    const v =
      ((cz - az) * (subject.x - cx) + (ax - cx) * (subject.z - cz)) /
      determinant;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
    const y =
      u * surfaceHeight(ax, az, wells) +
      v * surfaceHeight(bx, bz, wells) +
      (1 - u - v) * surfaceHeight(cx, cz, wells);
    camera.updateMatrixWorld();
    const point = new Vector3(subject.x, y, subject.z).project(camera);
    return { x: ((point.x + 1) * width) / 2, y: ((1 - point.y) * height) / 2 };
  }
  throw new Error("Visible center fell through the complete floor");
}

describe("portrait pressure focus and lens", () => {
  it.each([
    [390, 844, 36],
    [390, 844, 256],
    [320, 720, 36],
    [320, 720, 256],
  ] as const)(
    "retains useful local detail and actual visible-center picking at %ix%i for active-%i",
    (width, viewportHeight, subjectIndex) => {
      const height = 620,
        subject = wells[subjectIndex]!;
      const { renderer, access, frame, view, canvas, anchors, select } = setup(
        wells,
        width,
        height,
        viewportHeight,
      );
      const owned = new Map<BufferGeometry, ReturnType<typeof vi.fn>>();
      const remember = () => {
        for (const geometry of [access.geometry, access.focusGeometry])
          if (geometry && !owned.has(geometry)) {
            const disposed = vi.fn();
            geometry.addEventListener("dispose", disposed);
            owned.set(geometry, disposed);
          }
      };
      const pickCenter = () => {
        const point = visibleCenter(
          access.geometry,
          subject,
          access.camera,
          width,
          height,
        );
        expect(point.x).toBeGreaterThan(0);
        expect(point.x).toBeLessThan(width);
        expect(point.y).toBeGreaterThan(0);
        expect(point.y).toBeLessThan(height);
        for (const type of ["pointerdown", "pointerup"])
          canvas.dispatchEvent(
            Object.assign(
              new MouseEvent(type, {
                clientX: point.x,
                clientY: point.y,
                button: 0,
                bubbles: true,
              }),
              { pointerId: 1, pointerType: "mouse" },
            ),
          );
        expect(select).toHaveBeenLastCalledWith(subject.id);
      };
      const bounded = () => {
        const details = access.terrainDetails;
        expect(details.quality).toBe("local");
        expect(details.basins).toBe(257);
        expect(details.leaves).toBeLessThanOrEqual(120_000);
        expect(details.planningPasses).toBe(1);
        expect(details.planningCandidates).toBeLessThanOrEqual(
          details.planningBudget,
        );
        expect(details.planningVisits).toBeLessThanOrEqual(
          details.planningBudget,
        );
        expect(canvas.dataset.gravityContributions).toBe("257");
        expect(canvas.dataset.gravityLastContribution).toBe("active-256");
      };
      try {
        remember();
        view(subject.x, subject.z);
        frame(20);
        frame(220);
        remember();
        expect(
          deviation(access.geometry, subject, access.camera, width, height),
        ).toBeLessThanOrEqual(2);
        renderer.update(wells, { ...settings, selected: subject.id });
        renderer.focusSubject(subject.id, { immediate: true });
        frame(240);
        const beforeAnchor = anchors.mock.lastCall![0].find(
          (anchor: { id: string }) => anchor.id === subject.id,
        )!;
        frame(440);
        remember();
        expect(
          deviation(access.geometry, subject, access.camera, width, height),
        ).toBeLessThanOrEqual(2);
        bounded();
        pickCenter();
        const afterAnchor = anchors.mock.lastCall![0].find(
          (anchor: { id: string }) => anchor.id === subject.id,
        )!;
        // OrbitControls normalizes the settled pose at floating-point precision.
        expect(afterAnchor.x).toBeCloseTo(beforeAnchor.x, 9);
        expect(afterAnchor.y).toBeCloseTo(beforeAnchor.y, 9);
        joined(access.geometry, access.terrainDetails.bounds);
        renderer.update(wells, {
          ...settings,
          selected: subject.id,
          focus: true,
        });
        frame(460);
        remember();
        frame(660);
        remember();
        bounded();
        expect(
          deviation(access.geometry, subject, access.camera, width, height),
        ).toBeLessThanOrEqual(2);
        const diameter = renderer.lensViewport().radius * 2;
        expect(access.focusGeometry).toBeDefined();
        expect(
          deviation(
            access.focusGeometry!,
            subject,
            access.focusCamera,
            diameter,
            diameter,
          ),
        ).toBeLessThanOrEqual(2);
        pickCenter();
        const stable = access.geometry,
          lens = access.focusGeometry,
          revision = access.geometryRevision;
        frame(900);
        frame(1200);
        expect(access.geometry).toBe(stable);
        expect(access.focusGeometry).toBe(lens);
        expect(access.geometryRevision).toBe(revision);
        const draws = canvas.dataset.gravityRenderedFrames;
        frame(1400);
        expect(canvas.dataset.gravityRenderedFrames).toBe(draws);
      } finally {
        renderer.dispose();
        for (const disposed of owned.values())
          expect(disposed).toHaveBeenCalledTimes(1);
      }
    },
  );
});

it("retains a usable mesh and disposes an exhausted local request without retrying it every frame", () => {
  const { renderer, access, frame, view, canvas } = setup();
  const fallback = basinPlanning.basinGeometry(wells, undefined, 4);
  const rejectedDispose = vi.fn();
  fallback.geometry.addEventListener("dispose", rejectedDispose);
  const attempt = vi
    .spyOn(basinPlanning, "basinGeometry")
    .mockReturnValueOnce(fallback);
  try {
    const usable = access.geometry;
    view();
    frame(20);
    frame(220);
    expect(access.geometry).toBe(usable);
    expect(rejectedDispose).toHaveBeenCalledTimes(1);
    expect(canvas.dataset.gravityRefinementRejected).toBe("true");
    renderer.refreshActivity();
    frame(400);
    renderer.refreshActivity();
    frame(600);
    expect(attempt).toHaveBeenCalledTimes(1);
    view(20, 18);
    frame(800);
    frame(1000);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(access.geometry).not.toBe(usable);
    expect(access.terrainDetails.quality).toBe("local");
    expect(canvas.dataset.gravityRefinementRejected).toBe("false");
  } finally {
    renderer.dispose();
  }
});

/** Milliseconds from one presentation stop to the next. */
const cycle = (tourTiming.travel + tourTiming.dwell) * 1000;
const tourWells: Well[] = [
  { ...wells[0]!, x: -12, z: -5 },
  { ...wells[1]!, x: 16, z: 9 },
  { ...wells[2]!, kind: "project", x: 8, z: -10 },
];
describe("natural guided-tour feature lifecycle", () => {
  it("naturally features distinct valid hosts without direct activation and keeps progression across unchanged refresh", () => {
    let state: RendererSettings = {
      ...settings,
      motion: true,
      cameraMode: "tour",
    };
    const direct = vi.fn((id: string) => {
      state = { ...state, selected: id, cameraMode: "manual" };
      fixture.renderer.update(tourWells, state);
    });
    const featured = vi.fn((id: string) => {
      state = { ...state, selected: id };
      fixture.renderer.update(tourWells, state);
    });
    const fixture = setup(tourWells, 1200, 900, 900, {
      select: direct,
      featured,
    });
    try {
      fixture.renderer.update(tourWells, state);
      for (let now = 50; now <= 9000; now += 50) fixture.frame(now);
      expect(featured).toHaveBeenCalledTimes(1);
      const first = featured.mock.calls[0]![0];
      expect(tourWells.find((well) => well.id === first)?.kind).toBe("host");
      expect(state.cameraMode).toBe("tour");
      expect(state.selected).toBe(first);
      expect(direct).not.toHaveBeenCalled();
      const elapsed = fixture.access.presentationElapsed,
        position = fixture.access.camera.position.clone();
      fixture.renderer.update(
        tourWells.map((well) => ({ ...well })),
        { ...state },
      );
      expect(fixture.access.presentationElapsed).toBe(elapsed);
      for (let now = 9050; now <= cycle + 2000; now += 50) fixture.frame(now);
      expect(featured).toHaveBeenCalledTimes(2);
      const later = featured.mock.calls[1]![0];
      expect(later).not.toBe(first);
      expect(tourWells.find((well) => well.id === later)?.kind).toBe("host");
      expect(state.cameraMode).toBe("tour");
      expect(state.selected).toBe(later);
      expect(direct).not.toHaveBeenCalled();
      expect(fixture.access.presentationElapsed).toBeGreaterThan(cycle / 1000);
      expect(fixture.access.presentationInterrupted).toBe(false);
      expect(
        fixture.access.camera.position.distanceTo(position),
      ).toBeGreaterThan(1);
      expect(fixture.canvas.dataset.gravitySelected).toBe(later);
    } finally {
      fixture.renderer.dispose();
    }
  });
});

describe("deliberate presentation interruption and compatibility", () => {
  it("stops on actual control drag and never restarts until a deliberate mode transition", () => {
    let state: RendererSettings = {
      ...settings,
      motion: true,
      cameraMode: "tour",
    };
    const featured = vi.fn();
    const interrupted = vi.fn(() => {
      state = { ...state, cameraMode: "manual" };
      fixture.renderer.update(tourWells, state);
    });
    const fixture = setup(tourWells, 1200, 900, 900, { featured, interrupted });
    const pointer = (type: string, x: number, y: number) =>
      fixture.canvas.dispatchEvent(
        Object.assign(
          new MouseEvent(type, {
            clientX: x,
            clientY: y,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            bubbles: true,
          }),
          { pointerId: 1, pointerType: "mouse" },
        ),
      );
    try {
      fixture.renderer.update(tourWells, state);
      for (let now = 50; now <= 4000; now += 50) fixture.frame(now);
      expect(featured).toHaveBeenCalledTimes(1);
      pointer("pointerdown", 300, 200);
      pointer("pointermove", 350, 230);
      pointer("pointerup", 350, 230);
      expect(interrupted).toHaveBeenCalled();
      expect(state.cameraMode).toBe("manual");
      const calls = featured.mock.calls.length;
      for (let now = 4050; now <= 22000; now += 50) fixture.frame(now);
      fixture.renderer.update([...tourWells], { ...state });
      for (let now = 22050; now <= 25000; now += 50) fixture.frame(now);
      expect(featured).toHaveBeenCalledTimes(calls);
      state = { ...state, cameraMode: "tour" };
      fixture.renderer.update(tourWells, state);
      expect(fixture.access.presentationElapsed).toBe(0);
      for (let now = 25050; now <= 29000; now += 50) fixture.frame(now);
      expect(featured).toHaveBeenCalledTimes(calls + 1);
      expect(fixture.access.presentationInterrupted).toBe(false);
    } finally {
      fixture.renderer.dispose();
    }
  });
  it("keeps direct subject focus interrupting a tour through refresh without silently resuming", () => {
    const featured = vi.fn(),
      fixture = setup(tourWells, 1200, 900, 900, { featured });
    const tour: RendererSettings = {
      ...settings,
      motion: true,
      cameraMode: "tour",
    };
    try {
      fixture.renderer.update(tourWells, tour);
      for (let now = 50; now <= 4000; now += 50) fixture.frame(now);
      expect(featured).toHaveBeenCalledTimes(1);
      expect(
        fixture.renderer.focusSubject(tourWells[1]!.id, { immediate: true }),
      ).toBe(true);
      const elapsed = fixture.access.presentationElapsed;
      fixture.renderer.update([...tourWells], {
        ...tour,
        selected: tourWells[1]!.id,
      });
      for (let now = 4050; now <= 22000; now += 50) fixture.frame(now);
      expect(fixture.access.presentationElapsed).toBe(elapsed);
      expect(fixture.access.presentationInterrupted).toBe(true);
      expect(featured).toHaveBeenCalledTimes(1);
    } finally {
      fixture.renderer.dispose();
    }
  });
  it("keeps motion-disabled tour static and preserves legacy one-argument selection consumers", () => {
    const fixture = setup(tourWells),
      tour: RendererSettings = {
        ...settings,
        cameraMode: "tour",
        motion: false,
      };
    try {
      fixture.renderer.update(tourWells, tour);
      for (let now = 50; now <= 5000; now += 50) fixture.frame(now);
      expect(fixture.select).not.toHaveBeenCalled();
      expect(fixture.access.presentationElapsed).toBe(0);
      fixture.renderer.update(tourWells, { ...tour, motion: true });
      for (let now = 5050; now <= 9000; now += 50) fixture.frame(now);
      expect(fixture.select).toHaveBeenCalledTimes(1);
      expect(fixture.select.mock.calls[0]).toHaveLength(1);
      expect(
        tourWells.find((well) => well.id === fixture.select.mock.calls[0]![0])
          ?.kind,
      ).toBe("host");
    } finally {
      fixture.renderer.dispose();
    }
  });
});

it("refocuses an already-selected host after automatic camera movement when the same direct request is repeated", () => {
  const featured = vi.fn(),
    fixture = setup(tourWells, 1200, 900, 900, { featured }),
    subject = tourWells[0]!;
  try {
    fixture.renderer.update(tourWells, {
      ...settings,
      motion: true,
      selected: subject.id,
    });
    fixture.renderer.focusSubject(subject.id, { immediate: true });
    const position = fixture.access.camera.position.clone(),
      target = fixture.access.controls.target.clone();
    fixture.renderer.update(tourWells, {
      ...settings,
      motion: true,
      cameraMode: "tour",
      selected: subject.id,
    });
    for (let now = 50; now <= cycle + 2000; now += 50) fixture.frame(now);
    expect(featured.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fixture.access.controls.target.distanceTo(target)).toBeGreaterThan(
      1,
    );
    fixture.renderer.update(tourWells, {
      ...settings,
      motion: true,
      cameraMode: "manual",
      selected: subject.id,
    });
    expect(fixture.renderer.focusSubject(subject.id, { immediate: true })).toBe(
      true,
    );
    expect(fixture.access.camera.position.distanceTo(position)).toBeLessThan(
      1e-8,
    );
    expect(fixture.access.controls.target.distanceTo(target)).toBeLessThan(
      1e-8,
    );
    const elapsed = fixture.access.presentationElapsed,
      calls = featured.mock.calls.length;
    for (let now = cycle + 2050; now <= cycle + 6000; now += 50)
      fixture.frame(now);
    expect(featured).toHaveBeenCalledTimes(calls);
    expect(fixture.access.presentationElapsed).toBe(elapsed);
  } finally {
    fixture.renderer.dispose();
  }
});

it("adopts a naturally featured host without a fit and retains its shown pose through child focus and restoration", () => {
  const population = tourWells.flatMap((parent) => [
    parent,
    ...(parent.kind === "host"
      ? [
          {
            ...parent,
            id: parent.id + ":child",
            kind: "service" as const,
            hostId: parent.id,
            x: parent.x + 2,
            z: parent.z + 1,
            radius: 1,
          },
        ]
      : []),
  ]);
  const featured = vi.fn(),
    fixture = setup(population, 1200, 900, 900, { featured });
  try {
    fixture.renderer.focusSubject(tourWells[0]!.id, { immediate: true });
    fixture.renderer.update(population, {
      ...settings,
      motion: true,
      cameraMode: "tour",
    });
    for (let now = 50; now <= cycle + 2000; now += 50) fixture.frame(now);
    expect(featured.mock.calls.length).toBeGreaterThanOrEqual(2);
    const subject = featured.mock.lastCall![0] as string,
      child = population.find((well) => well.hostId === subject)!,
      position = fixture.access.camera.position.clone(),
      target = fixture.access.controls.target.clone(),
      geometry = fixture.access.geometry,
      revision = fixture.access.geometryRevision,
      saved = [...fixture.access.savedFocusPoses.entries()],
      previousSubject = fixture.access.focusedSubject,
      focus = vi.spyOn(fixture.renderer, "focusSubject");
    expect(fixture.access.presentationMoved).toBe(true);
    expect(fixture.renderer.adoptSubject("unavailable-subject")).toBe(false);
    expect(fixture.access.focusedSubject).toBe(previousSubject);
    expect(fixture.access.presentationMoved).toBe(true);
    expect(fixture.renderer.adoptSubject(subject)).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    expect(fixture.access.camera.position.toArray()).toEqual(
      position.toArray(),
    );
    expect(fixture.access.controls.target.toArray()).toEqual(target.toArray());
    expect(fixture.access.focusedSubject).toBe(subject);
    expect(fixture.access.presentationMoved).toBe(false);
    expect(fixture.access.presentationInterrupted).toBe(true);
    expect(fixture.access.cameraTween).toBeNull();
    expect([...fixture.access.savedFocusPoses.entries()]).toEqual(saved);
    expect(fixture.access.geometry).toBe(geometry);
    expect(fixture.access.geometryRevision).toBe(revision);
    expect(fixture.canvas.dataset.gravityMainFocus).toBe(subject);
    fixture.renderer.update(population, {
      ...settings,
      motion: true,
      selected: subject,
    });
    // The component may resolve the collapsed child to its visible parent first.
    fixture.renderer.focusSubject(subject, { immediate: true });
    expect(fixture.access.camera.position.toArray()).toEqual(
      position.toArray(),
    );
    expect(fixture.access.controls.target.toArray()).toEqual(target.toArray());
    fixture.renderer.focusSubject(child.id, { immediate: true });
    const retained = fixture.access.savedFocusPoses.get(subject)!;
    expect(retained.position.toArray()).toEqual(position.toArray());
    expect(retained.target.toArray()).toEqual(target.toArray());
    fixture.renderer.focusSubject(subject, { immediate: true, restore: true });
    expect(fixture.access.camera.position.distanceTo(position)).toBeLessThan(
      1e-8,
    );
    expect(fixture.access.controls.target.distanceTo(target)).toBeLessThan(
      1e-8,
    );
    const calls = featured.mock.calls.length;
    for (let now = cycle + 2050; now <= cycle + 6000; now += 50)
      fixture.frame(now);
    expect(featured).toHaveBeenCalledTimes(calls);
    expect(fixture.access.presentationElapsed).toBe(0);
  } finally {
    fixture.renderer.dispose();
  }
});

it("adopts the visible in-flight pose instead of retaining a stale focus tween destination", () => {
  const fixture = setup(tourWells);
  try {
    fixture.renderer.update(tourWells, { ...settings, motion: true });
    fixture.renderer.focusSubject(tourWells[0]!.id);
    fixture.frame(50);
    expect(fixture.access.cameraTween).not.toBeNull();
    const position = fixture.access.camera.position.toArray(),
      target = fixture.access.controls.target.toArray();
    expect(fixture.renderer.adoptSubject(tourWells[0]!.id)).toBe(true);
    expect(fixture.access.cameraTween).toBeNull();
    expect(fixture.access.camera.position.toArray()).toEqual(position);
    expect(fixture.access.controls.target.toArray()).toEqual(target);
    fixture.renderer.focusSubject(tourWells[1]!.id, { immediate: true });
    const saved = fixture.access.savedFocusPoses.get(tourWells[0]!.id)!;
    expect(saved.position.toArray()).toEqual(position);
    expect(saved.target.toArray()).toEqual(target);
    fixture.renderer.focusSubject(tourWells[0]!.id, {
      immediate: true,
      restore: true,
    });
    expect(
      fixture.access.camera.position.distanceTo(new Vector3(...position)),
    ).toBeLessThan(1e-8);
    expect(
      fixture.access.controls.target.distanceTo(new Vector3(...target)),
    ).toBeLessThan(1e-8);
  } finally {
    fixture.renderer.dispose();
  }
});

describe("nested label disclosure", () => {
  const pool: Well = {
    id: "pool",
    label: "Pool",
    kind: "project",
    hostId: null,
    sector: "pool",
    x: 0,
    z: 0,
    radius: 4,
    depth: 0.45,
    aspect: 1,
    angle: 0,
    elevation: 0,
    profile: 2.4,
    attention: false,
    pool: true,
  };
  const members: Well[] = [-1.5, 0, 1.5].map((x, index) => ({
    ...pool,
    id: `member-${index}`,
    label: `Member ${index}`,
    hostId: "pool",
    x,
    z: 0.5,
    radius: 0.5,
    depth: 0.4,
    profile: 1,
    attention: index === 2,
    pool: false,
  }));
  const host: Well = {
    ...pool,
    id: "host",
    label: "Host",
    kind: "host",
    x: 24,
    radius: 2,
    depth: 2.3,
    elevation: 0.7,
    profile: 1,
    pool: false,
  };
  const population = [pool, ...members, host];
  type Published = {
    id: string;
    visible: boolean;
    nested?: boolean;
    open?: boolean;
  };
  const latest = (anchors: ReturnType<typeof vi.fn>) =>
    new Map(
      (anchors.mock.lastCall![0] as Published[]).map((anchor) => [
        anchor.id,
        anchor,
      ]),
    );
  it("names members only when the camera spreads them apart or they need attention", () => {
    const { renderer, frame, anchors, view } = setup(population);
    try {
      frame(20);
      let shown = latest(anchors);
      expect(shown.get("pool")).toMatchObject({
        visible: true,
        nested: false,
        open: false,
      });
      expect(shown.get("host")).toMatchObject({ visible: true });
      // An undisclosed member has no label element until its group opens.
      expect(shown.has("member-0")).toBe(false);
      // A member that needs attention is never hidden by disclosure.
      expect(shown.get("member-2")?.visible).toBe(true);
      // Selecting a distant group does not pin its members' names.
      renderer.update(population, { ...settings, selected: "pool" });
      frame(40);
      shown = latest(anchors);
      expect(shown.get("member-0")?.visible ?? false).toBe(false);
      expect(shown.get("member-1")?.visible ?? false).toBe(false);
      // A selected member is still named itself.
      renderer.update(population, { ...settings, selected: "member-1" });
      frame(60);
      shown = latest(anchors);
      expect(shown.get("member-1")?.visible).toBe(true);
      expect(shown.get("member-0")?.visible ?? false).toBe(false);
      renderer.update(population, settings);
      frame(80);
      expect(latest(anchors).get("member-1")?.visible ?? false).toBe(false);
      // Zooming in until neighbours are far apart names every member and
      // steps the parent's own label back.
      view(0, 0);
      frame(100);
      shown = latest(anchors);
      expect(shown.get("member-1")?.visible).toBe(true);
      expect(shown.get("pool")?.open).toBe(true);
    } finally {
      renderer.dispose();
    }
  });
  it("keeps a closing group's member names until they have faded out", () => {
    const { renderer, frame, anchors, view, access } = setup(population);
    const moving = { ...settings, motion: true };
    try {
      renderer.update(population, moving);
      view(0, 0);
      for (let now = 20; now <= 1500; now += 20) frame(now);
      expect(latest(anchors).get("member-1")?.visible).toBe(true);
      // Zoom back out: the names fade out before their elements go.
      access.camera.position.set(9, 60, 80);
      access.controls.target.set(0, -0.6, 0);
      access.controls.update();
      frame(1520);
      const fading = latest(anchors).get("member-1") as Published & {
        opacity: number;
      };
      expect(fading.visible).toBe(false);
      expect(fading.opacity).toBeGreaterThan(0.05);
      for (let now = 1540; now <= 4000; now += 20) frame(now);
      expect(latest(anchors).has("member-1")).toBe(false);
    } finally {
      renderer.dispose();
    }
  });
  it("re-places labels over the frame already drawn without redrawing the terrain", () => {
    const { renderer, frame, anchors, canvas } = setup(population);
    try {
      renderer.update(population, { ...settings, motion: true });
      for (let now = 20; now <= 1500; now += 20) frame(now);
      const draws = canvas.dataset.gravityRenderedFrames;
      const published = anchors.mock.calls.length;
      // A label that measures larger moves its neighbours; the camera has not.
      renderer.measureAnchor("pool", 520, 64);
      for (let now = 1520; now <= 2000; now += 20) frame(now);
      expect(anchors.mock.calls.length).toBeGreaterThan(published);
      expect(canvas.dataset.gravityRenderedFrames).toBe(draws);
    } finally {
      renderer.dispose();
    }
  });
});

describe("watch orbit and presentation stops", () => {
  it("orbits a watched subject at a constant distance once it arrives, without a direct-focus tween", () => {
    const fixture = setup(tourWells);
    const subject = tourWells[1]!;
    const watch: RendererSettings = {
      ...settings,
      motion: true,
      cameraMode: "watch",
      watch: subject.id,
      selected: subject.id,
    };
    try {
      fixture.renderer.update(tourWells, watch);
      expect(fixture.renderer.focusSubject(subject.id)).toBe(true);
      expect(fixture.access.cameraTween).toBeNull();
      expect(fixture.access.focusedSubject).toBe(subject.id);
      for (let now = 50; now <= 6000; now += 50) fixture.frame(now);
      const distance = () =>
        fixture.access.camera.position.distanceTo(
          fixture.access.controls.target,
        );
      const settled = distance(),
        position = fixture.access.camera.position.clone();
      expect(
        Math.hypot(
          fixture.access.controls.target.x - subject.x,
          fixture.access.controls.target.z - subject.z,
        ),
      ).toBeLessThan(subject.radius * 2);
      for (let now = 6050; now <= 12000; now += 50) fixture.frame(now);
      expect(distance()).toBeCloseTo(settled, 1);
      expect(
        fixture.access.camera.position.distanceTo(position),
      ).toBeGreaterThan(0.5);
      expect(fixture.access.presentationInterrupted).toBe(false);
      // Watching another subject travels there from the current pose.
      fixture.renderer.update(tourWells, {
        ...watch,
        watch: tourWells[0]!.id,
        selected: tourWells[0]!.id,
      });
      const before = fixture.access.camera.position.clone();
      fixture.frame(12050);
      expect(fixture.access.camera.position.distanceTo(before)).toBeLessThan(1);
    } finally {
      fixture.renderer.dispose();
    }
  });

  it("visits named stops in order and moves at once to a group whose attention is raised", () => {
    const groups: Well[] = [
      { ...wells[0]!, id: "group-a", x: -20, z: 0 },
      { ...wells[1]!, id: "group-b", kind: "project", x: 0, z: 20 },
      { ...wells[2]!, id: "group-c", x: 20, z: 0 },
    ];
    const featured = vi.fn(),
      tour = vi.fn();
    const fixture = setup(groups, 1200, 900, 900, { featured, tour });
    const state: RendererSettings = {
      ...settings,
      motion: true,
      cameraMode: "tour",
      stops: ["group-b", "group-c", "group-a"],
    };
    try {
      fixture.renderer.update(groups, state);
      fixture.frame(50);
      expect(featured).toHaveBeenLastCalledWith("group-b");
      expect(tour.mock.lastCall?.[0]).toMatchObject({
        id: "group-b",
        reason: "sequence",
      });
      for (let now = 100; now <= cycle + 1000; now += 50) fixture.frame(now);
      expect(featured).toHaveBeenLastCalledWith("group-c");
      fixture.renderer.update(
        groups.map((well) =>
          well.id === "group-a" ? { ...well, attention: true } : well,
        ),
        state,
      );
      expect(featured).toHaveBeenLastCalledWith("group-a");
      expect(tour.mock.lastCall?.[0]).toMatchObject({
        id: "group-a",
        reason: "attention",
        dwell: tourTiming.attentionDwell,
      });
    } finally {
      fixture.renderer.dispose();
    }
  });
});
