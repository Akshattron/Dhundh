import { loadScenario } from "../engine/scenarioLoader";
import kestrel from "./kestrel-relief-corridor.json";

export const scenarios = [loadScenario(kestrel)] as const;
