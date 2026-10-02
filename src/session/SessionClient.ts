import type { Aar } from "../engine/aar";
import type { TraineeView } from "../engine/view";
import type { Rationale, SessionLog } from "../engine/types";

export type SessionCommand =
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RESET" }
  | { type: "OPEN_REPORT"; reportId: string }
  | { type: "SET_ESTIMATE"; hypothesisId: string; p: number }
  | { type: "VERIFY"; assetId: string }
  | { type: "DECIDE"; actionId: string; rationale: Rationale | null };

export interface SessionClient {
  getSnapshot(): TraineeView;
  subscribe(listener: () => void): () => void;
  dispatch(command: SessionCommand): void;
  advanceToSeconds(tSec: number): void;
  getLog(): SessionLog;
  getAar(): Aar;
  dispose(): void;
}
