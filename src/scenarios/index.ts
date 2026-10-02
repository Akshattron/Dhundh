import { loadScenario } from "../engine/scenarioLoader";
import kestrel from "./kestrel-relief-corridor.json";
import harbour from "./harbour-flood-response.json";

export const scenarios = [
  loadScenario(kestrel),
  loadScenario(harbour),
] as const;
