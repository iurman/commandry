import type { JSHandle, Locator } from "@playwright/test";

export type OutlineObservation = {
  dispatches: {
    id: string;
    dispatchedAt: number;
    committedAt: number | null;
    trusted: boolean;
    detail: number;
  }[];
  committedIds: string[];
  pendingId: string | null;
  violations: {
    code: string;
    id: string | null;
    at: number;
    detail: string;
  }[];
  violationCount: number;
  disposed: boolean;
};

export type OutlineObserver = {
  discover(): {
    targets: { id: string; selector: string }[];
    observation: OutlineObservation;
  };
  settle(): Promise<OutlineObservation>;
  snapshot(): OutlineObservation;
  dispose(): OutlineObservation;
};

// This probe only observes product events and DOM commits. Pointer dispatch stays
// with Playwright, and one probe retains history across every mounted-tree pass.
export async function installOutlineObserver(
  outline: Locator,
  maxTargets: number,
): Promise<JSHandle<OutlineObserver>> {
  return outline.evaluateHandle((root, limit) => {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error("Outline observation requires a positive target bound");
    const dispatches: OutlineObservation["dispatches"] = [];
    const byId = new Map<string, OutlineObservation["dispatches"][number]>();
    const knownButtons = new WeakMap<Element, string>();
    const committed = new Set<string>();
    const violations: OutlineObservation["violations"] = [];
    const recordedViolations = new Set<string>();
    let violationCount = 0;
    let pendingId: string | null = null;
    let disposed = false;
    let passTargets: string[] = [];
    let passDispatches = 0;
    let settlement: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function violate(code: string, id: string | null, detail: string) {
      const key = JSON.stringify([code, id, detail]);
      if (recordedViolations.has(key)) return;
      // Once the bounded evidence fills, one overflow receipt is sufficient;
      // violationCount remains nonzero and no later state can restore success.
      if (violations.length > limit) return;
      recordedViolations.add(key);
      violationCount++;
      violations.push({ code, id, at: performance.now(), detail });
    }

    function identity(button: Element) {
      const row = button.parentElement;
      const item = row?.parentElement;
      const id = item?.getAttribute("data-representation-id") ?? null;
      if (!row?.matches(".cmd-op-outline-row") || !item?.matches("li") || !id) {
        violate("missing-target-id", id, "Toggle has no own representation ID");
        return null;
      }
      knownButtons.set(button, id);
      return id;
    }

    function controls() {
      const result = new Map<string, Element>();
      for (const button of root.querySelectorAll("button.cmd-op-expand")) {
        const id = identity(button);
        if (id === null) continue;
        if (result.has(id))
          violate(
            "duplicate-target-id",
            id,
            "Multiple own toggles are mounted",
          );
        result.set(id, button);
        if (
          !["true", "false"].includes(
            button.getAttribute("aria-expanded") ?? "",
          )
        )
          violate(
            "missing-expanded-state",
            id,
            "Toggle has no boolean aria state",
          );
      }
      return result;
    }

    function commit(id: string) {
      const dispatch = byId.get(id);
      if (!dispatch || dispatch.committedAt !== null) return;
      dispatch.committedAt = performance.now();
      committed.add(id);
      if (dispatch.committedAt - dispatch.dispatchedAt > 5000)
        violate(
          "late-commit",
          id,
          "Local commit exceeded the existing 5000ms guard",
        );
      if (pendingId === id) pendingId = null;
    }

    function current() {
      if (!root.isConnected)
        violate("missing-outline", null, "The observed outline was detached");
      const mounted = controls();
      for (const id of passTargets)
        if (!mounted.has(id))
          violate("missing-target", id, "A discovered target disappeared");
      for (const id of committed) {
        if (mounted.get(id)?.getAttribute("aria-expanded") !== "true")
          violate(
            "lost-expansion",
            id,
            "A committed target is absent or collapsed",
          );
      }
      if (pendingId !== null) {
        const button = mounted.get(pendingId);
        if (!button)
          violate(
            "missing-target",
            pendingId,
            "The dispatched target disappeared",
          );
        else if (button.getAttribute("aria-expanded") === "true")
          commit(pendingId);
      }
      return mounted;
    }

    function mutations(records: MutationRecord[]) {
      const nextValues = new Map<Element, string | null>();
      const transitions: {
        target: Element;
        before: string | null;
        after: string | null;
      }[] = [];
      // Reconstruct each value from the next oldValue, not only the eventual
      // DOM state: true -> false -> true must remain a permanent violation.
      for (const record of [...records].reverse()) {
        if (record.type !== "attributes" || !(record.target instanceof Element))
          continue;
        const target = record.target;
        transitions.push({
          target,
          before: record.oldValue,
          after: nextValues.has(target)
            ? nextValues.get(target)!
            : target.getAttribute("aria-expanded"),
        });
        nextValues.set(target, record.oldValue);
      }
      for (const { target, before, after } of transitions.reverse()) {
        const id = knownButtons.get(target);
        if (!id || !byId.has(id)) continue;
        if (before === "true") commit(id);
        if (committed.has(id) && after !== "true")
          violate(
            "lost-expansion",
            id,
            "A committed aria state changed away from true",
          );
        if (after === "true") commit(id);
      }
    }

    const observer = new MutationObserver((records) => {
      mutations(records);
      current();
      settlement?.();
    });
    function drain() {
      mutations(observer.takeRecords());
      return current();
    }
    function observation(): OutlineObservation {
      return {
        dispatches: dispatches.map((dispatch) => ({ ...dispatch })),
        committedIds: [...committed],
        pendingId,
        violations: violations.map((violation) => ({ ...violation })),
        violationCount,
        disposed,
      };
    }
    function capture(event: MouseEvent) {
      const button =
        event.target instanceof Element
          ? event.target.closest("button.cmd-op-expand")
          : null;
      if (!button || !root.contains(button)) return;
      const mounted = drain();
      const id = identity(button);
      if (pendingId !== null)
        violate(
          "uncommitted-prior-target",
          pendingId,
          "A later pointer dispatch preceded its local commit",
        );
      if (id === null) return;
      if (!event.isTrusted || event.detail < 1)
        violate(
          "non-pointer-dispatch",
          id,
          "Expansion was not a trusted pointer click",
        );
      if (mounted.get(id) !== button)
        violate(
          "missing-target",
          id,
          "The pointer target is not its unique own toggle",
        );
      if (passTargets[passDispatches] !== id)
        violate(
          "unexpected-target-order",
          id,
          "Pointer order differs from mounted discovery",
        );
      passDispatches++;
      if (button.getAttribute("aria-expanded") !== "false")
        violate(
          "target-not-collapsed",
          id,
          "Pointer dispatch would toggle an expanded target",
        );
      if (byId.has(id))
        violate(
          "duplicate-dispatch",
          id,
          "A representation received more than one pointer dispatch",
        );
      if (dispatches.length >= limit) {
        violate(
          "target-bound",
          id,
          "Pointer dispatches exceeded the original attempt bound",
        );
        return;
      }
      const dispatch = {
        id,
        dispatchedAt: performance.now(),
        committedAt: null,
        trusted: event.isTrusted,
        detail: event.detail,
      };
      dispatches.push(dispatch);
      if (!byId.has(id)) byId.set(id, dispatch);
      pendingId = id;
    }
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-expanded"],
      attributeOldValue: true,
    });
    root.addEventListener("click", capture as EventListener, true);

    return {
      discover() {
        const mounted = drain();
        if (disposed)
          violate("disposed-probe", null, "Discovery after disposal");
        if (pendingId !== null)
          violate(
            "uncommitted-prior-target",
            pendingId,
            "A new pass preceded its local commit",
          );
        const targets = [...mounted]
          .filter(
            ([, button]) => button.getAttribute("aria-expanded") === "false",
          )
          .map(([id]) => ({
            id,
            selector: `li[data-representation-id="${CSS.escape(id)}"] > .cmd-op-outline-row > button.cmd-op-expand`,
          }));
        for (const { id } of targets)
          if (byId.has(id))
            violate(
              "duplicate-target",
              id,
              "A dispatched representation was rediscovered collapsed",
            );
        if (dispatches.length + targets.length > limit)
          violate(
            "target-bound",
            null,
            "Mounted targets exceed the original attempt bound",
          );
        passTargets = targets.map(({ id }) => id);
        passDispatches = 0;
        return { targets, observation: observation() };
      },
      async settle() {
        drain();
        if (disposed)
          violate("disposed-probe", null, "Settlement after disposal");
        if (passDispatches !== passTargets.length)
          violate(
            "missing-dispatch",
            null,
            "Not every discovered target received its pointer click",
          );
        if (violationCount || pendingId === null) return observation();
        return new Promise<OutlineObservation>((resolve) => {
          const finish = () => {
            drain();
            if (!violationCount && pendingId !== null) return;
            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
            settlement = null;
            resolve(observation());
          };
          settlement = finish;
          const pending = byId.get(pendingId!)!;
          const deadline = pending.dispatchedAt + 5000;
          const checkDeadline = () => {
            drain();
            if (violationCount || pendingId === null) {
              finish();
              return;
            }
            // Timer conversion can truncate fractional delays. The absolute
            // dispatch deadline, rather than an early callback, owns failure.
            const remaining = deadline - performance.now();
            if (remaining > 0) {
              timer = setTimeout(checkDeadline, remaining);
              return;
            }
            violate(
              "missing-commit",
              pendingId,
              "Local commit did not arrive within the existing 5000ms guard",
            );
            finish();
          };
          timer = setTimeout(
            checkDeadline,
            Math.max(0, deadline - performance.now()),
          );
          finish();
        });
      },
      snapshot() {
        if (disposed) return observation();
        drain();
        return observation();
      },
      dispose() {
        if (disposed) return observation();
        try {
          drain();
        } finally {
          observer.disconnect();
          root.removeEventListener("click", capture as EventListener, true);
          if (timer !== undefined) clearTimeout(timer);
          disposed = true;
          if (pendingId !== null)
            violate(
              "unsettled-disposal",
              pendingId,
              "Probe disposed with an uncommitted target",
            );
          settlement?.();
        }
        return observation();
      },
    };
  }, maxTargets);
}
