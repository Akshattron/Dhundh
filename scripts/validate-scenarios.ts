import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../src/scenarios/", import.meta.url));

async function scenarioFiles(): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function validate() {
  const files = await scenarioFiles();
  console.info(
    "Gate 0: JSON syntax validation only. Gate 1 will require the flagship scenario, schema, and loader invariants.",
  );

  if (files.length === 0) {
    console.info("OK: zero scenario JSON files (expected during Gate 0).");
    return;
  }

  for (const file of files) {
    const text = await readFile(join(directory, file), "utf8");
    try {
      JSON.parse(text);
      console.info(`JSON syntax OK: ${file}`);
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw error;
      }
      console.error(`INVALID JSON: ${file}: ${error.message}`);
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
