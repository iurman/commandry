/** A presentation stop in visiting order. Attention is the group's current
 * impact or exposure, as its pin and roster chip show it. */
export type TourStopInput = { id: string; attention: boolean };
export type TourReason = "sequence" | "attention";
export type TourStop = {
  id: string;
  reason: TourReason;
  /** Seconds travelling from the previous framing to this one. */
  travel: number;
  /** Seconds orbiting this group after arriving. */
  dwell: number;
  /** Increments for every stop begun, including a repeated group. */
  sequence: number;
};
export type TourTiming = {
  travel: number;
  dwell: number;
  attentionDwell: number;
};
export const tourTiming: TourTiming = {
  travel: 4.5,
  dwell: 24,
  attentionDwell: 36,
};

/** Visits primary groups in order: travel, then dwell while orbiting, then the
 * next. A group whose attention is newly raised while the tour runs preempts
 * the current stop immediately; the tour then continues after it. Attention
 * already present when the tour starts only decides where the tour begins.
 * The renderer owns the camera; this owns only which stop it frames.
 */
export class PresentationTour {
  private stops: TourStopInput[] = [];
  private attention = new Map<string, boolean>();
  private stop: TourStop | null = null;
  private elapsed = 0;
  private sequence = 0;

  constructor(private timing: TourTiming = tourTiming) {}

  /** Replace the visiting order. Returns the stop a newly raised attention
   * preempted to, if any. */
  setStops(stops: TourStopInput[]): TourStop | null {
    const raised = this.stop
      ? stops.find((stop) => stop.attention && !this.attention.get(stop.id))
      : undefined;
    const previous = this.stops;
    this.stops = stops;
    this.attention = new Map(stops.map((stop) => [stop.id, stop.attention]));
    if (!this.stop) return null;
    if (raised) {
      if (raised.id !== this.stop.id) return this.begin(raised.id, "attention");
      // Already here: stay for the longer dwell from now.
      this.stop = {
        ...this.stop,
        reason: "attention",
        dwell: this.timing.attentionDwell,
      };
      this.elapsed = Math.min(this.elapsed, this.stop.travel);
      return null;
    }
    if (!stops.length) {
      this.stop = null;
      return null;
    }
    if (!stops.some((stop) => stop.id === this.stop!.id)) {
      // The framed group left the scene: continue where it stood.
      const index = previous.findIndex((stop) => stop.id === this.stop!.id);
      const next = stops[Math.max(0, Math.min(index, stops.length - 1))]!;
      this.begin(next.id, "sequence");
    }
    return null;
  }

  /** Forget the current stop; the next advance starts a fresh tour. */
  reset() {
    this.stop = null;
    this.elapsed = 0;
  }

  current() {
    return this.stop ? { stop: this.stop, elapsed: this.elapsed } : null;
  }

  /** Advance by `dt` seconds. `changed` is true when a new stop began. */
  advance(
    dt: number,
  ): { stop: TourStop; elapsed: number; changed: boolean } | null {
    if (!this.stops.length) {
      this.stop = null;
      return null;
    }
    if (!this.stop) {
      const first = this.stops.find((stop) => stop.attention) ?? this.stops[0]!;
      this.begin(first.id, first.attention ? "attention" : "sequence");
      return { stop: this.stop!, elapsed: 0, changed: true };
    }
    this.elapsed += dt;
    if (this.elapsed < this.stop.travel + this.stop.dwell)
      return { stop: this.stop, elapsed: this.elapsed, changed: false };
    const index = this.stops.findIndex((stop) => stop.id === this.stop!.id);
    const next = this.stops[(index + 1) % this.stops.length]!;
    if (next.id === this.stop.id) {
      // A single group stays framed; keep orbiting without travelling again.
      this.elapsed = this.stop.travel;
      return { stop: this.stop, elapsed: this.elapsed, changed: false };
    }
    this.begin(next.id, next.attention ? "attention" : "sequence");
    return { stop: this.stop!, elapsed: 0, changed: true };
  }

  private begin(id: string, reason: TourReason) {
    this.stop = {
      id,
      reason,
      travel: this.timing.travel,
      dwell:
        reason === "attention" ? this.timing.attentionDwell : this.timing.dwell,
      sequence: ++this.sequence,
    };
    this.elapsed = 0;
    return this.stop;
  }
}
