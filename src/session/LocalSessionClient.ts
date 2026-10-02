import { buildAar } from "../engine/aar";
import {
  advanceTo,
  applyIntent,
  computeBelief,
  createSession,
  evaluateDecision,
  netVoi,
  projectTraineeView,
  scenarioHash,
} from "../engine";
import { readEvent } from "../engine/events";
import type {
  EngineErrorCode,
  Intent,
  Rationale,
  ScenarioDef,
  SessionLog,
  SimState,
} from "../engine";
import type { TraineeView } from "../engine/view";
import type {
  InstructorDiagnostics,
  SessionClient,
  SessionCommand,
} from "./SessionClient";

export interface LocalSessionOptions {
  seed: number;
  difficultyLevel: number;
  aidMode: "ALWAYS" | "AFTER_ESTIMATE";
  speedSecPerMin: number;
}

function makeIntent(command: SessionCommand, t: number): Intent {
  switch (command.type) {
    case "START":
    case "PAUSE":
    case "RESUME":
    case "RESET":
      return { type: command.type, t, role: "SOLO" };
    case "OPEN_REPORT":
      return { ...command, t, role: "SOLO" };
    case "SET_ESTIMATE":
      return { ...command, t, role: "SOLO" };
    case "VERIFY":
      return { ...command, t, role: "SOLO" };
    case "INJECT":
      return { ...command, t, role: "INSTRUCTOR" };
    case "DECIDE":
      return { ...command, t, role: "SOLO" };
  }
}

export class LocalSessionClient implements SessionClient {
  private state: SimState;
  private readonly listeners = new Set<() => void>();
  private readonly interval: ReturnType<typeof setInterval>;
  private readonly log: SessionLog;
  private view: TraineeView;
  private engineError: { code: EngineErrorCode; message: string } | undefined;
  private completedAtIso: string | null = null;
  private lastWallTime = Date.now();
  private fractionalSeconds = 0;
  private disposed = false;

  constructor(
    private readonly scenario: ScenarioDef,
    private readonly options: LocalSessionOptions,
  ) {
    this.state = createSession(scenario, {
      seed: options.seed,
      difficultyLevel: options.difficultyLevel,
      mode: "LOCAL",
      aidMode: options.aidMode,
    });
    this.log = {
      logVersion: 1,
      scenarioId: scenario.meta.id,
      scenarioVersion: scenario.meta.version,
      scenarioHash: scenarioHash(scenario),
      seed: options.seed,
      difficultyLevel: options.difficultyLevel,
      mode: "LOCAL",
      aidMode: options.aidMode,
      intents: [],
    };
    this.view = projectTraineeView(scenario, this.state, "SOLO");
    this.interval = setInterval(() => this.tick(), 100);
  }

  getSnapshot(): TraineeView {
    return this.view;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(command: SessionCommand): void {
    const intent = makeIntent(command, this.state.nowSec);
    const result = applyIntent(this.state, this.scenario, intent);
    this.state = result.state;
    if (command.type === "RESET" && result.result.ok) {
      this.log.intents.length = 0;
      this.fractionalSeconds = 0;
      this.lastWallTime = Date.now();
      this.completedAtIso = null;
    } else if (result.result.ok) {
      this.log.intents.push(structuredClone(intent));
    }
    this.captureCompletionTime();
    this.engineError = result.result.ok
      ? undefined
      : { code: result.result.error, message: result.result.message };
    this.publish();
  }

  advanceToSeconds(tSec: number): void {
    const result = advanceTo(this.state, this.scenario, tSec);
    this.state = result.state;
    this.captureCompletionTime();
    this.engineError = result.error
      ? { code: result.error.code, message: result.error.message }
      : undefined;
    this.lastWallTime = Date.now();
    this.fractionalSeconds = 0;
    this.publish();
  }

  getNextScheduledEventAtSec(): number | null {
    return (
      this.state.eventTimeline[this.state.processedEventCursor]?.atSec ?? null
    );
  }

  getLog(): SessionLog {
    return structuredClone(this.log);
  }

  getAar() {
    const aar = buildAar(this.scenario, this.log);
    return this.completedAtIso
      ? {
          ...aar,
          header: { ...aar.header, completedAtIso: this.completedAtIso },
        }
      : aar;
  }

  getInstructorDiagnostics(showTruth = false): InstructorDiagnostics {
    const dp =
      this.scenario.decisionPoints[this.state.currentDecisionPointIndex];
    const visibleChannels = this.scenario.channels
      .filter((channel) => channel.visibleTo.includes("SOLO"))
      .map((channel) => channel.id);
    const belief = computeBelief(this.scenario, this.state, this.state.nowSec, {
      visibleChannels,
    });
    const evaluation =
      dp && dp.actions.length > 0
        ? evaluateDecision(
            dp,
            belief,
            this.state.nowSec,
            this.scenario.hypotheses,
            dp.timeoutActionId,
            this.scenario.model,
          )
        : null;
    const assets = dp
      ? dp.assets.map((assetId) => {
          const asset = this.scenario.assets.find(
            (candidate) => candidate.id === assetId,
          );
          if (!asset) throw new Error(`Unknown verification asset ${assetId}`);
          const used = this.state.verifications.filter(
            (record) =>
              record.assetId === assetId && record.decisionPointId === dp.id,
          ).length;
          const feasible =
            this.state.phase === "RUNNING" &&
            this.state.nowSec >= dp.openSec &&
            this.state.nowSec < dp.closeSec &&
            used < asset.capacity &&
            this.state.nowSec + asset.delaySec < dp.closeSec;
          const value = feasible
            ? netVoi(
                dp,
                belief,
                this.state.nowSec,
                asset,
                this.scenario.hypotheses,
              )
            : null;
          return {
            id: asset.id,
            label: asset.label,
            feasible,
            evsi: value?.evsi ?? null,
            net: value?.net ?? null,
          };
        })
      : [];
    const events: InstructorDiagnostics["events"] =
      this.state.eventTimeline.map((internal) => {
        const event = readEvent(internal);
        let summary = event.kind.replaceAll("_", " ").toLowerCase();
        if (event.kind === "REPORT_ISSUE" || event.kind === "REPORT_DELIVER") {
          summary = `${event.kind === "REPORT_ISSUE" ? "Issued" : "Delivered"} report ${event.reportId}`;
        } else if (
          event.kind === "CHANNEL_DEGRADE" ||
          event.kind === "CHANNEL_RESTORE" ||
          event.kind === "CHANNEL_FORCE_RESTORE"
        ) {
          summary = `${event.channel} ${event.kind.replace("CHANNEL_", "").replaceAll("_", " ").toLowerCase()}`;
        } else if (event.kind === "TRUTH_CHANGE") {
          summary = `Truth changed for ${event.hypothesisId}`;
        }
        return { atSec: event.atSec, kind: event.kind, summary };
      });
    for (const intent of this.log.intents) {
      if (intent.type !== "INJECT") continue;
      const preset = this.scenario.injectPresets.find(
        (candidate) => candidate.id === intent.presetId,
      );
      events.push({
        atSec: intent.t,
        kind: "INJECT",
        summary: preset
          ? `Instructor injected ${preset.label}`
          : `Unknown preset ${intent.presetId}`,
      });
    }
    return {
      phase: this.state.phase,
      nowSec: this.state.nowSec,
      presets: this.scenario.injectPresets.map((preset) =>
        structuredClone(preset),
      ),
      channels: this.scenario.channels.map((channel) => ({
        id: channel.id,
        health: this.state.channels[channel.id].health,
        mode: this.state.channels[channel.id].mode,
      })),
      decision: evaluation
        ? {
            expectedUtilities: evaluation.eu,
            bestActionId: evaluation.bestActionId,
            isTie: evaluation.isTie,
            evpi: evaluation.evpi,
          }
        : null,
      assets,
      events: events.sort((left, right) => left.atSec - right.atSec),
      ...(showTruth ? { truth: { ...this.state.truth } } : {}),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.interval);
    this.listeners.clear();
  }

  private tick(): void {
    if (this.disposed) return;
    const wallNow = Date.now();
    const elapsedMs = Math.max(0, wallNow - this.lastWallTime);
    this.lastWallTime = wallNow;
    if (this.state.phase !== "RUNNING" && this.state.phase !== "CONSEQUENCE") {
      return;
    }
    this.fractionalSeconds +=
      (elapsedMs / 1000) * (60 / this.options.speedSecPerMin);
    const wholeSeconds = Math.floor(this.fractionalSeconds);
    if (wholeSeconds === 0) return;
    this.fractionalSeconds -= wholeSeconds;
    const result = advanceTo(
      this.state,
      this.scenario,
      this.state.nowSec + wholeSeconds,
    );
    this.state = result.state;
    this.captureCompletionTime();
    this.engineError = result.error
      ? { code: result.error.code, message: result.error.message }
      : undefined;
    this.publish();
  }

  private publish(): void {
    this.view = projectTraineeView(
      this.scenario,
      this.state,
      "SOLO",
      this.engineError,
    );
    this.listeners.forEach((listener) => listener());
  }

  private captureCompletionTime(): void {
    if (this.state.phase === "COMPLETE" && this.completedAtIso === null) {
      this.completedAtIso = new Date().toISOString();
    }
  }
}

export function createLocalSession(
  scenario: ScenarioDef,
  options: LocalSessionOptions,
): LocalSessionClient {
  return new LocalSessionClient(scenario, options);
}
