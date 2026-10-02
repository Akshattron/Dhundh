import type { ScenarioDef } from "@/engine";
import { createLocalSession } from "@/session/LocalSessionClient";
import type { SessionClient } from "@/session/SessionClient";
import type { TraineeView } from "@/engine/view";

export const DEMO_SCENARIO_ID = "kestrel-relief-corridor";
export const DEMO_SPEED_SEC_PER_MIN = 2;

export interface DemoActionResult {
  ok: boolean;
  message: string;
  complete?: boolean;
  wowBaselineFog?: number;
}

export class DemoController {
  constructor(private readonly scenario: ScenarioDef) {
    if (scenario.meta.id !== DEMO_SCENARIO_ID) {
      throw new Error(`Demo requires the ${DEMO_SCENARIO_ID} scenario`);
    }
  }

  createSession(): SessionClient {
    const client = createLocalSession(this.scenario, {
      seed: 0,
      difficultyLevel: 3,
      aidMode: "ALWAYS",
      speedSecPerMin: DEMO_SPEED_SEC_PER_MIN,
    });
    client.dispatch({ type: "START" });
    if (client.getSnapshot().phase !== "RUNNING") {
      client.dispose();
      throw new Error("The deterministic flagship demo could not start.");
    }
    return client;
  }

  start(client: SessionClient): DemoActionResult {
    const phase = client.getSnapshot().phase;
    if (phase === "IDLE") {
      client.dispatch({ type: "START" });
      return {
        ok: client.getSnapshot().phase === "RUNNING",
        message: "Demo started.",
      };
    }
    if (phase === "PAUSED") {
      return this.resume(client);
    }
    if (phase === "RUNNING" || phase === "CONSEQUENCE") {
      return { ok: true, message: "The simulation is already active." };
    }
    return {
      ok: false,
      message: "The demo is complete. Reset to run it again.",
    };
  }

  pause(client: SessionClient): DemoActionResult {
    if (client.getSnapshot().phase !== "RUNNING") {
      return {
        ok: false,
        message: "Pause is available while the exercise is running.",
      };
    }
    client.dispatch({ type: "PAUSE" });
    return {
      ok: client.getSnapshot().phase === "PAUSED",
      message: "Simulation paused.",
    };
  }

  resume(client: SessionClient): DemoActionResult {
    if (client.getSnapshot().phase !== "PAUSED") {
      return {
        ok: false,
        message: "Resume is available while the exercise is paused.",
      };
    }
    client.dispatch({ type: "RESUME" });
    return {
      ok: client.getSnapshot().phase === "RUNNING",
      message: "Simulation resumed.",
    };
  }

  stepForward(client: SessionClient): DemoActionResult {
    const view = client.getSnapshot();
    if (!this.canAdvance(view)) return this.notAdvancing(view);
    const nextEvent = client.getNextScheduledEventAtSec();
    const target =
      nextEvent !== null && nextEvent >= view.nowSec
        ? nextEvent
        : view.nowSec + 60;
    client.advanceToSeconds(target);
    return {
      ok: true,
      message: `Stepped to ${this.clock(client.getSnapshot().nowSec)}.`,
    };
  }

  skipToWow(client: SessionClient): DemoActionResult {
    let view = client.getSnapshot();
    if (this.isWow(view)) {
      return {
        ok: true,
        message: `The information shift is already visible at ${this.clock(view.nowSec)}.`,
      };
    }
    if (view.phase !== "RUNNING") return this.notAdvancing(view);

    for (let step = 0; step < 256; step += 1) {
      const nextEvent = client.getNextScheduledEventAtSec();
      if (nextEvent === null) break;
      const priorFog = view.belief?.fogIndex;
      client.advanceToSeconds(nextEvent);
      view = client.getSnapshot();
      if (this.isWow(view)) {
        return {
          ok: true,
          message: `The information shift is visible at ${this.clock(view.nowSec)}.`,
          ...(priorFog !== undefined ? { wowBaselineFog: priorFog } : {}),
        };
      }
      if (view.phase !== "RUNNING") break;
    }
    return {
      ok: false,
      message:
        "The scripted information shift was not reached; reset the demo to retry.",
    };
  }

  skipToDecision(client: SessionClient): DemoActionResult {
    const view = client.getSnapshot();
    if (view.phase !== "RUNNING") return this.notAdvancing(view);
    const point = view.decisionPoint;
    if (!point)
      return {
        ok: false,
        message: "No decision point is available in this scenario.",
      };
    if (point.status === "OPEN") {
      return {
        ok: true,
        message: `Decision window is open at ${this.clock(view.nowSec)}.`,
      };
    }
    if (point.status === "CLOSED") {
      return {
        ok: false,
        message:
          "The decision window has closed; continue to the after-action review.",
      };
    }
    client.advanceToSeconds(Math.max(view.nowSec, point.openSec));
    const next = client.getSnapshot();
    return next.decisionPoint?.status === "OPEN"
      ? {
          ok: true,
          message: `Decision window opened at ${this.clock(next.nowSec)}. Choose an action when ready.`,
        }
      : {
          ok: false,
          message: "The decision window did not open; reset the demo to retry.",
        };
  }

  skipToAar(client: SessionClient): DemoActionResult {
    let view = client.getSnapshot();
    if (view.phase === "PAUSED") {
      return {
        ok: false,
        message:
          "Resume the simulation before skipping to the after-action review.",
      };
    }
    if (view.phase === "COMPLETE") {
      return {
        ok: true,
        complete: true,
        message: "After-action review is ready.",
      };
    }

    if (view.phase === "RUNNING") {
      const point = view.decisionPoint;
      if (!point)
        return { ok: false, message: "No legal decision point is available." };
      client.advanceToSeconds(Math.max(view.nowSec, point.closeSec));
      view = client.getSnapshot();
    }

    for (let step = 0; step < 256 && view.phase === "CONSEQUENCE"; step += 1) {
      const revealAt = view.pendingConsequence?.revealAtSec;
      const nextEvent = client.getNextScheduledEventAtSec();
      const target = revealAt ?? nextEvent;
      if (target === null || target === undefined) break;
      client.advanceToSeconds(Math.max(view.nowSec, target));
      view = client.getSnapshot();
    }

    return view.phase === "COMPLETE"
      ? {
          ok: true,
          complete: true,
          message:
            "The real engine completed the consequence; the after-action review is ready.",
        }
      : {
          ok: false,
          message:
            "The engine did not reach a completed consequence. Reset the demo to retry.",
        };
  }

  isWow(view: TraineeView): boolean {
    const degraded = view.channels.some(
      (channel) => channel.health !== "HEALTHY",
    );
    if (!degraded || !view.belief) return false;

    const delayedEvidenceArrived = view.reports.some(
      (report) => report.delaySec > 0 && report.deliveredAtSec <= view.nowSec,
    );
    if (!delayedEvidenceArrived) return false;

    return Object.entries(view.belief.perHypothesis).some(([id, belief]) => {
      const prior = view.referenceModel.hypotheses.find(
        (hypothesis) => hypothesis.id === id,
      )?.prior;
      return (
        belief.contradicted &&
        prior !== undefined &&
        Math.abs(belief.p - prior) > 0.001
      );
    });
  }

  private canAdvance(view: TraineeView): boolean {
    return view.phase === "RUNNING" || view.phase === "CONSEQUENCE";
  }

  private notAdvancing(view: TraineeView): DemoActionResult {
    return {
      ok: false,
      message:
        view.phase === "PAUSED"
          ? "Resume the simulation before advancing presenter steps."
          : `Presenter stepping is unavailable during ${view.phase.toLowerCase()}.`,
    };
  }

  private clock(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
}
