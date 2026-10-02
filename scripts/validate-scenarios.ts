import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenario, scenarioHash } from "../src/engine/scenarioLoader";

const directory = fileURLToPath(new URL("../src/scenarios/", import.meta.url));

async function scenarioFiles(): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  if (!files.includes("kestrel-relief-corridor.json")) {
    throw new Error("Gate 1 requires kestrel-relief-corridor.json");
  }
  return files.map((file) => join(directory, file));
}

async function validate() {
  const files = [
    ...(await scenarioFiles()),
    ...process.argv
      .slice(2)
      .map((file) => resolve(file))
      .sort(),
  ];
  const ids = new Set<string>();

  for (const file of files) {
    try {
      const scenario = loadScenario(JSON.parse(await readFile(file, "utf8")));
      if (ids.has(scenario.meta.id)) {
        throw new Error(`Duplicate scenario ID "${scenario.meta.id}"`);
      }
      ids.add(scenario.meta.id);
      console.info(
        `OK ${scenario.meta.id} v${scenario.meta.version} hash=${scenarioHash(scenario)}`,
      );
    } catch (error) {
      console.error(
        `INVALID ${basename(file)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
  }
}

validate().catch((error: unknown) => {
  console.error(
    "Scenario validation failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
