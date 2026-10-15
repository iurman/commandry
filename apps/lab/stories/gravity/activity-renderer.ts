import * as THREE from "three";
import { surfaceHeight } from "./model";
import type { Palette, Well } from "./model";
import type { ActivitySnapshot, Transfer } from "./activity";

export function transferMatchesSelection(
  flow: Transfer,
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

export function transferPoint(
  flow: Transfer,
  progress: number,
  wells: Well[],
  time = 0,
  ambient = 0,
) {
  const source = wells.find((well) => well.id === flow.from);
  const target = wells.find((well) => well.id === flow.to);
  if (!source || !target) return null;
  const t = Math.max(0, Math.min(1, progress));
  let x: number, z: number;
  if (flow.phase === "processing") {
    const angle = t * Math.PI * 4;
    const radius = target.radius * 2 + 0.5;
    x = target.x + Math.cos(angle) * radius;
    z = target.z + Math.sin(angle) * radius;
  } else {
    const dx = target.x - source.x,
      dz = target.z - source.z;
    const distance = Math.max(1, Math.hypot(dx, dz));
    const bend = Math.sin(t * Math.PI) * Math.min(distance * 0.22, 3);
    const spiral = Math.sin(t * Math.PI) * target.radius * 0.5;
    x =
      source.x +
      dx * t -
      (dz / distance) * bend +
      Math.sin(t * Math.PI * 4) * spiral;
    z =
      source.z +
      dz * t +
      (dx / distance) * bend +
      Math.cos(t * Math.PI * 4) * spiral;
  }
  return {
    x,
    y:
      surfaceHeight(x, z, wells, time, ambient) +
      0.18 +
      (flow.phase === "processing" ? 0.08 : Math.sin(t * Math.PI) * 0.55),
    z,
  };
}

export class ActivityRenderer {
  readonly group = new THREE.Group();
  private linesGeometry = new THREE.BufferGeometry();
  private pointsGeometry = new THREE.BufferGeometry();
  private linesMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  private pointsMaterial = new THREE.PointsMaterial({
    vertexColors: true,
    size: 0.14,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
  });
  private lines = new THREE.LineSegments(
    this.linesGeometry,
    this.linesMaterial,
  );
  private points = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
  private capacity = 0;

  constructor() {
    this.lines.frustumCulled = false;
    this.points.frustumCulled = false;
    this.group.add(this.lines, this.points);
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
  ) {
    const flows = snapshot.transfers;
    if (flows.length > this.capacity) {
      this.linesGeometry.dispose();
      this.pointsGeometry.dispose();
      this.capacity = Math.max(16, flows.length * 2);
      this.linesGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array(this.capacity * 24 * 2 * 3),
          3,
        ),
      );
      this.linesGeometry.setAttribute(
        "color",
        new THREE.BufferAttribute(
          new Float32Array(this.capacity * 24 * 2 * 3),
          3,
        ),
      );
      this.pointsGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(this.capacity * 7 * 3), 3),
      );
      this.pointsGeometry.setAttribute(
        "color",
        new THREE.BufferAttribute(new Float32Array(this.capacity * 7 * 3), 3),
      );
    }
    let lineIndex = 0,
      pointIndex = 0;
    const color = new THREE.Color();
    const at = (flow: Transfer, t: number) =>
      transferPoint(flow, t, wells, elapsed, ambient ? 1 : 0);
    for (const flow of flows) {
      const progress = Math.max(
        0,
        Math.min(1, (snapshot.time - flow.start) / flow.duration),
      );
      const faded = trace
        ? flow.correlationId !== trace
        : follow && selected
          ? !transferMatchesSelection(flow, selected, wells)
          : false;
      color.set(
        flow.outcome === "timeout"
          ? palette.unhealthy
          : flow.outcome === "slow"
            ? palette.attention
            : flow.kind === "probe"
              ? palette.reporting
              : flow.kind === "job"
                ? "#bb97e4"
                : flow.kind === "artifact"
                  ? "#d4af6d"
                  : "#53b5e2",
      );
      color.multiplyScalar(faded ? 0.12 : night ? 1.6 : 0.7);
      const end = flow.outcome === "timeout" ? progress * 0.84 : progress;
      const tail = flow.phase === "processing" ? 0.2 : 0.34;
      for (let segment = 0; segment < 24; segment++) {
        // Health probes are dotted; traffic is a short travelling stream, never a permanent edge.
        if (flow.kind === "probe" && segment % 3 === 0) continue;
        const a = at(flow, Math.max(0, end - tail + (tail * segment) / 24));
        const b = at(
          flow,
          Math.max(0, end - tail + (tail * (segment + 1)) / 24),
        );
        if (!a || !b) continue;
        for (const point of [a, b]) {
          this.linesGeometry.attributes.position!.setXYZ(
            lineIndex,
            point.x,
            point.y,
            point.z,
          );
          this.linesGeometry.attributes.color!.setXYZ(
            lineIndex++,
            color.r,
            color.g,
            color.b,
          );
        }
      }
      for (let bead = 0; bead < 7; bead++) {
        const point = at(flow, Math.max(0, end - bead * 0.018));
        if (!point) continue;
        this.pointsGeometry.attributes.position!.setXYZ(
          pointIndex,
          point.x,
          point.y + 0.04,
          point.z,
        );
        const brightness =
          (1 - bead / 8) *
          (flow.outcome === "timeout" ? 1 - progress * 0.8 : 1);
        this.pointsGeometry.attributes.color!.setXYZ(
          pointIndex++,
          color.r * brightness,
          color.g * brightness,
          color.b * brightness,
        );
      }
    }
    this.group.visible = flows.length > 0;
    if (this.capacity) {
      this.linesGeometry.setDrawRange(0, lineIndex);
      this.pointsGeometry.setDrawRange(0, pointIndex);
      for (const geometry of [this.linesGeometry, this.pointsGeometry]) {
        geometry.attributes.position!.needsUpdate = true;
        geometry.attributes.color!.needsUpdate = true;
      }
    }
  }

  dispose() {
    this.linesGeometry.dispose();
    this.pointsGeometry.dispose();
    this.linesMaterial.dispose();
    this.pointsMaterial.dispose();
  }
}
