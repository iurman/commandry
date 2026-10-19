import * as THREE from "three";
import { surfaceHeight } from "./model";
import type { Palette, Well } from "./model";
import type {
  ActivitySnapshot,
  Transfer,
  ActivityEvent,
} from "./activity-types";

type Position = { x: number; y: number; z: number };

export function transferMatchesSelection(
  flow: Pick<Transfer, "from" | "to">,
  selected: string,
  wells: Well[],
) {
  const subject = wells.find((well) => well.id === selected);
  return [flow.from, flow.to].some(
    (id) =>
      id === selected ||
      id.startsWith(`${selected}/`) ||
      (subject?.kind === "project" &&
        wells.find((well) => well.id === id)?.sector === subject.sector),
  );
}

export function activeTransfers(snapshot: ActivitySnapshot) {
  return snapshot.transfers.filter(
    (flow) =>
      snapshot.time >= flow.start && snapshot.time < flow.start + flow.duration,
  );
}

export function arrivalEffects(snapshot: ActivitySnapshot) {
  return snapshot.events.filter(
    (event) =>
      event.effect &&
      snapshot.time >= event.at &&
      snapshot.time - event.at < 1.4,
  );
}

export function transferPoint(
  flow: Transfer,
  progress: number,
  wells: Well[],
  time = 0,
  ambient = 0,
): Position | null {
  const source = wells.find((well) => well.id === flow.from);
  const target = wells.find((well) => well.id === flow.to);
  if (!source || !target) return null;
  const t = Math.max(0, Math.min(1, progress));
  if (flow.phase === "processing") {
    const host = wells.find((well) => well.id === target.hostId) ?? target;
    const angle = t * Math.PI * 2 - Math.PI / 2;
    const localX = Math.cos(angle) * host.radius * host.aspect * 1.3;
    const localZ = Math.sin(angle) * host.radius * 1.3;
    const x =
      host.x + localX * Math.cos(host.angle) - localZ * Math.sin(host.angle);
    const z =
      host.z + localX * Math.sin(host.angle) + localZ * Math.cos(host.angle);
    return { x, y: surfaceHeight(x, z, wells, time, ambient) + 0.3, z };
  }
  // Canonical endpoint ordering makes a response retrace the same corridor.
  const forward = source.id < target.id;
  const a = forward ? source : target;
  const b = forward ? target : source;
  const u = forward ? t : 1 - t;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const distance = Math.max(0.1, Math.hypot(dx, dz));
  const arch = Math.sin(u * Math.PI);
  const bend = arch * Math.min(distance * 0.12, 1.8);
  const x = a.x + dx * u - (dz / distance) * bend;
  const z = a.z + dz * u + (dx / distance) * bend;
  const fromHeight = surfaceHeight(a.x, a.z, wells, time, ambient);
  const toHeight = surfaceHeight(b.x, b.z, wells, time, ambient);
  return {
    x,
    y: Math.max(
      surfaceHeight(x, z, wells, time, ambient) + 0.22,
      fromHeight +
        (toHeight - fromHeight) * u +
        0.22 +
        arch * Math.min(4, 0.9 + distance * 0.18),
    ),
    z,
  };
}

const vertexShader = `
  attribute vec4 tint;
  varying vec4 vTint;
  void main() {
    vTint = tint;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = `
  varying vec4 vTint;
  void main() { gl_FragColor = vTint; }
`;

export class ActivityRenderer {
  readonly group = new THREE.Group();
  private linesGeometry = new THREE.BufferGeometry();
  private ribbonsGeometry = new THREE.BufferGeometry();
  private pointsGeometry = new THREE.BufferGeometry();
  private linesMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  private ribbonsMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private pointsMaterial = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader: `
      attribute vec4 tint;
      attribute float size;
      uniform float uPixelRatio;
      varying vec4 vTint;
      void main() {
        vTint = tint;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio;
      }
    `,
    fragmentShader: `
      varying vec4 vTint;
      void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        if (radius > 1.0) discard;
        float glow = pow(1.0 - radius, 1.5);
        vec3 core = mix(vTint.rgb, vec3(1.0), (1.0 - smoothstep(0.0, 0.28, radius)) * 0.65);
        gl_FragColor = vec4(core, vTint.a * glow);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  private lines = new THREE.LineSegments(
    this.linesGeometry,
    this.linesMaterial,
  );
  private ribbons = new THREE.Mesh(this.ribbonsGeometry, this.ribbonsMaterial);
  private points = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
  private capacity = 0;

  constructor() {
    for (const object of [this.lines, this.ribbons, this.points]) {
      object.frustumCulled = false;
      this.group.add(object);
    }
  }

  update(
    snapshot: ActivitySnapshot,
    wells: Well[],
    palette: Palette,
    selected: string | null,
    trace: string | null,
    follow: boolean,
    elapsed: number,
    ambient: boolean,
    night: boolean,
    pixelRatio = 1,
  ) {
    const flows = activeTransfers(snapshot);
    const effects = arrivalEffects(snapshot);
    const population = flows.length + effects.length;
    if (population > this.capacity) {
      this.capacity = Math.max(16, population * 2);
      for (const [geometry, vertices, colorSize] of [
        [this.linesGeometry, 128, 3],
        [this.ribbonsGeometry, 1024, 4],
        [this.pointsGeometry, 16, 4],
      ] as const) {
        geometry.dispose();
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(
            new Float32Array(this.capacity * vertices * 3),
            3,
          ),
        );
        geometry.setAttribute(
          colorSize === 3 ? "color" : "tint",
          new THREE.BufferAttribute(
            new Float32Array(this.capacity * vertices * colorSize),
            colorSize,
          ),
        );
      }
      this.pointsGeometry.setAttribute(
        "size",
        new THREE.BufferAttribute(new Float32Array(this.capacity * 16), 1),
      );
    }
    this.pointsMaterial.uniforms.uPixelRatio!.value = pixelRatio;
    let lineIndex = 0,
      ribbonIndex = 0,
      pointIndex = 0;
    const color = new THREE.Color();
    const at = (flow: Transfer, t: number) =>
      transferPoint(flow, t, wells, elapsed, ambient ? 1 : 0);
    const fadeFor = (item: {
      correlationId: string;
      from: string;
      to: string;
    }) =>
      (
        trace
          ? item.correlationId !== trace
          : follow && selected
            ? !transferMatchesSelection(item, selected, wells)
            : false
      )
        ? 0.08
        : 1;
    const tintFor = (item: Pick<ActivityEvent, "kind" | "outcome">) => {
      color.set(
        item.outcome === "timeout" || item.outcome === "failed"
          ? palette.unhealthy
          : item.outcome === "slow"
            ? palette.attention
            : item.kind === "probe" || item.kind === "observation"
              ? palette.reporting
              : item.kind === "job"
                ? "#bb97e4"
                : item.kind === "artifact"
                  ? "#d4af6d"
                  : "#53b5e2",
      );
      color.multiplyScalar(night ? 1.25 : 0.65);
    };
    const line = (a: Position, b: Position, alpha: number) => {
      for (const point of [a, b]) {
        this.linesGeometry.attributes.position!.setXYZ(
          lineIndex,
          point.x,
          point.y,
          point.z,
        );
        this.linesGeometry.attributes.color!.setXYZ(
          lineIndex++,
          color.r * alpha,
          color.g * alpha,
          color.b * alpha,
        );
      }
    };
    const ribbon = (
      a: Position,
      b: Position,
      widthA: number,
      widthB: number,
      alphaA: number,
      alphaB: number,
    ) => {
      const length = Math.max(0.0001, Math.hypot(b.x - a.x, b.z - a.z));
      const nx = -(b.z - a.z) / length;
      const nz = (b.x - a.x) / length;
      for (const [point, side, width, alpha] of [
        [a, -1, widthA, alphaA],
        [a, 1, widthA, alphaA],
        [b, -1, widthB, alphaB],
        [b, -1, widthB, alphaB],
        [a, 1, widthA, alphaA],
        [b, 1, widthB, alphaB],
      ] as const) {
        this.ribbonsGeometry.attributes.position!.setXYZ(
          ribbonIndex,
          point.x + nx * width * side,
          point.y,
          point.z + nz * width * side,
        );
        this.ribbonsGeometry.attributes.tint!.setXYZW(
          ribbonIndex++,
          color.r,
          color.g,
          color.b,
          alpha,
        );
      }
    };
    const point = (position: Position, size: number, alpha: number) => {
      this.pointsGeometry.attributes.position!.setXYZ(
        pointIndex,
        position.x,
        position.y + 0.02,
        position.z,
      );
      this.pointsGeometry.attributes.tint!.setXYZW(
        pointIndex,
        color.r,
        color.g,
        color.b,
        alpha,
      );
      this.pointsGeometry.attributes.size!.setX(pointIndex++, size);
    };
    const pulse = (
      well: Well,
      radius: number,
      alpha: number,
      broken = false,
    ) => {
      const ringPoint = (t: number) => {
        const angle = t * Math.PI * 2;
        const x = well.x + Math.cos(angle) * radius;
        const z = well.z + Math.sin(angle) * radius;
        return {
          x,
          y: surfaceHeight(x, z, wells, elapsed, ambient ? 1 : 0) + 0.26,
          z,
        };
      };
      for (let segment = 0; segment < 48; segment++) {
        if (broken && segment % 6 < 2) continue;
        ribbon(
          ringPoint(segment / 48),
          ringPoint((segment + 1) / 48),
          0.035,
          0.035,
          alpha,
          alpha,
        );
      }
    };
    for (const flow of flows) {
      const quietProbe = flow.kind === "probe" && !flow.recorded;
      tintFor(flow);
      const fade = fadeFor(flow);
      const progress = Math.max(
        0,
        Math.min(1, (snapshot.time - flow.start) / flow.duration),
      );
      const processing = flow.phase === "processing";
      if (processing) {
        for (let segment = 0; segment < 64; segment++) {
          const a = at(flow, segment / 64),
            b = at(flow, (segment + 1) / 64);
          if (!a || !b) continue;
          line(a, b, fade);
          const end = Math.min(progress, (segment + 1) / 64);
          if (end > segment / 64) {
            const finish = at(flow, end)!;
            ribbon(a, finish, 0.075, 0.075, fade * 0.85, fade * 0.85);
          }
        }
        const head = at(flow, progress);
        if (head) point(head, 11, fade);
        continue;
      }
      // Quiet lanes exist only for live transfers. The tapered body and bright nose carry direction.
      if (!quietProbe)
        for (let segment = 0; segment < 32; segment++) {
          const a = at(flow, segment / 32),
            b = at(flow, (segment + 1) / 32);
          if (a && b) line(a, b, fade * (flow.phase === "response" ? 0.5 : 1));
        }
      const stalled = flow.outcome === "timeout";
      const headAt = stalled ? Math.min(1, progress / 0.6) * 0.85 : progress;
      const opacity =
        fade * (stalled ? 1 - Math.max(0, (progress - 0.6) / 0.4) * 0.9 : 1);
      const tail = quietProbe ? 0.1 : 0.2;
      const width =
        flow.kind === "artifact" ? 0.12 : flow.kind === "job" ? 0.09 : 0.065;
      for (let segment = 0; segment < 24; segment++) {
        const u = segment / 24,
          v = (segment + 1) / 24;
        const a = at(flow, Math.max(0, headAt - tail + tail * u));
        const b = at(flow, Math.max(0, headAt - tail + tail * v));
        if (!a || !b) continue;
        if (quietProbe) {
          if (segment % 6 === 0) point(b, 3, opacity * v * 0.6);
        } else
          ribbon(
            a,
            b,
            width * u,
            width * v,
            opacity * u * 0.1,
            opacity * v * 0.9,
          );
      }
      const head = at(flow, headAt);
      if (head)
        point(
          head,
          quietProbe ? 5 : flow.kind === "artifact" ? 12 : 10,
          opacity,
        );
      if (flow.kind === "artifact")
        for (const offset of [0.02, 0.04]) {
          const cargo = at(flow, Math.max(0, headAt - offset));
          if (cargo) point(cargo, 6, opacity * 0.75);
        }
      const source = wells.find((well) => well.id === flow.from);
      const departure = (snapshot.time - flow.start) / 0.85;
      if (source && departure < 1)
        pulse(
          source,
          0.3 + departure * 1.1,
          (1 - departure) * fade * (quietProbe ? 0.2 : 0.7),
        );
    }
    for (const event of effects) {
      const target = wells.find((well) => well.id === event.to);
      if (!target) continue;
      tintFor(event);
      const age = (snapshot.time - event.at) / 1.4;
      const alpha =
        (1 - age) ** 2 * fadeFor(event) * (event.kind === "probe" ? 0.25 : 0.9);
      pulse(target, 0.35 + age * 1.8, alpha, event.effect === "failure");
    }
    this.group.visible = population > 0;
    if (this.capacity) {
      for (const [geometry, count] of [
        [this.linesGeometry, lineIndex],
        [this.ribbonsGeometry, ribbonIndex],
        [this.pointsGeometry, pointIndex],
      ] as const) {
        geometry.setDrawRange(0, count);
        for (const attribute of Object.values(geometry.attributes))
          attribute.needsUpdate = true;
      }
    }
  }

  dispose() {
    for (const geometry of [
      this.linesGeometry,
      this.ribbonsGeometry,
      this.pointsGeometry,
    ])
      geometry.dispose();
    for (const material of [
      this.linesMaterial,
      this.ribbonsMaterial,
      this.pointsMaterial,
    ])
      material.dispose();
  }
}
