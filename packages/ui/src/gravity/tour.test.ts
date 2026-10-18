import { describe, expect, it } from "vitest";
import { PresentationTour, tourTiming, type TourStopInput } from "./tour";

const stops = (attention: string[] = []): TourStopInput[] =>
  ["hub", "a", "b", "c"].map((id) => ({
    id,
    attention: attention.includes(id),
  }));
const cycle = tourTiming.travel + tourTiming.dwell;

describe("presentation tour", () => {
  it("visits every stop in order, travelling then dwelling at each", () => {
    const tour = new PresentationTour();
    tour.setStops(stops());
    const first = tour.advance(0.1)!;
    expect(first).toMatchObject({ changed: true, elapsed: 0 });
    expect(first.stop).toMatchObject({
      id: "hub",
      reason: "sequence",
      travel: tourTiming.travel,
      dwell: tourTiming.dwell,
    });
    const visited = [first.stop.id];
    for (let time = 0; time < cycle * 4; time += 0.5) {
      const step = tour.advance(0.5)!;
      if (step.changed) visited.push(step.stop.id);
    }
    expect(visited).toEqual(["hub", "a", "b", "c", "hub"]);
  });

  it("starts at a group already in attention and gives it the longer dwell", () => {
    const tour = new PresentationTour();
    tour.setStops(stops(["b"]));
    const first = tour.advance(0.1)!.stop;
    expect(first).toMatchObject({
      id: "b",
      reason: "attention",
      dwell: tourTiming.attentionDwell,
    });
    // Existing attention is not a new raise.
    expect(tour.setStops(stops(["b"]))).toBeNull();
  });

  it("preempts to a newly raised attention, then continues after it", () => {
    const tour = new PresentationTour();
    tour.setStops(stops());
    tour.advance(0.1);
    tour.advance(5);
    expect(tour.current()!.stop.id).toBe("hub");
    const preempted = tour.setStops(stops(["c"]))!;
    expect(preempted).toMatchObject({ id: "c", reason: "attention" });
    expect(tour.current()).toMatchObject({ elapsed: 0 });
    // Persistent attention does not preempt again.
    expect(tour.setStops(stops(["c"]))).toBeNull();
    const next = tour.advance(tourTiming.travel + tourTiming.attentionDwell)!;
    expect(next).toMatchObject({ changed: true });
    expect(next.stop.id).toBe("hub");
    // Clearing and raising again is a new raise.
    tour.setStops(stops());
    expect(tour.setStops(stops(["a"]))?.id).toBe("a");
  });

  it("extends the current stop when its own attention is raised", () => {
    const tour = new PresentationTour();
    tour.setStops(stops());
    tour.advance(0.1);
    tour.advance(tourTiming.travel + 10);
    expect(tour.setStops(stops(["hub"]))).toBeNull();
    expect(tour.current()).toMatchObject({
      elapsed: tourTiming.travel,
      stop: {
        id: "hub",
        reason: "attention",
        dwell: tourTiming.attentionDwell,
      },
    });
  });

  it("does not preempt while not running and records attention as a baseline", () => {
    const tour = new PresentationTour();
    expect(tour.setStops(stops())).toBeNull();
    expect(tour.setStops(stops(["a"]))).toBeNull();
    expect(tour.advance(0.1)!.stop.id).toBe("a");
    tour.reset();
    expect(tour.current()).toBeNull();
  });

  it("continues where a removed stop stood and holds a single stop without travelling again", () => {
    const tour = new PresentationTour();
    tour.setStops(stops());
    tour.advance(0.1);
    tour.advance(cycle);
    expect(tour.current()!.stop.id).toBe("a");
    tour.setStops(stops().filter((stop) => stop.id !== "a"));
    expect(tour.current()).toMatchObject({ elapsed: 0, stop: { id: "b" } });
    const single = new PresentationTour();
    single.setStops([{ id: "only", attention: false }]);
    single.advance(0.1);
    const held = single.advance(cycle + 1)!;
    expect(held).toMatchObject({ changed: false, elapsed: tourTiming.travel });
    expect(single.setStops([])).toBeNull();
    expect(single.advance(1)).toBeNull();
  });
});
