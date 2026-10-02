import type { Aar } from "../engine/aar";
import type { TraineeView } from "../engine/view";
import type {
  InjectPresetDef,
  Rationale,
  SessionLog,
  SimState,
} from "../engine/types";

export type SessionCommand =
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RESET" }
  | { type: "OPEN_REPORT"; reportId: string }
  | { type: "SET_ESTIMATE"; hypothesisId: string; p: number }
  | { type: "VERIFY"; assetId: string }
  | { type: "INJECT"; presetId: string }
  | { type: "DECIDE"; actionId: string; rationale: Rationale | null };

export interface InstructorDiagnostics {
  phase: SimState["phase"];
  nowSec: number;
  presets: InjectPresetDef[];
  channels: Array<{
    id: string;
    health: SimState["channels"][keyof SimState["channels"]]["health"];
    mode: SimState["channels"][keyof SimState["channels"]]["mode"];
  }>;
  decision: null | {
    expectedUtilities: Record<string, number>;
    bestActionId: string;
    isTie: boolean;
    evpi: number;
  };
  assets: Array<{
    id: string;
    label: string;
    feasible: boolean;
    evsi: number | null;
    net: number | null;
  }>;
  events: Array<{ atSec: number; kind: string; summary: string }>;
  truth?: Record<string, boolean>;
}

export interface SessionClient {
  getSnapshot(): TraineeView;
  subscribe(listener: () => void): () => void;
  dispatch(command: SessionCommand): void;
  advanceToSeconds(tSec: number): void;
  getNextScheduledEventAtSec(): number | null;
  getLog(): SessionLog;
  getAar(): Aar;
  getInstructorDiagnostics(showTruth?: boolean): InstructorDiagnostics;
  dispose(): void;
}
