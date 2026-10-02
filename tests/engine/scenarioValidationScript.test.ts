// @vitest-environment node
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import kestrel from "../../src/scenarios/kestrel-relief-corridor.json";

const root = fileURLToPath(new URL("../../", import.meta.url));
const script = fileURLToPath(
  new URL("../../scripts/validate-scenarios.ts", import.meta.url),
);
const fixtureNames = [
  "invalid#%.json",
  "broken-reference.json",
  "valid-fixture.json",
];
let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "dhundh-gate1-"));
  await writeFile(join(directory, fixtureNames[0]!), "{", "utf8");
  const broken = structuredClone(kestrel);
  broken.reports[0]!.hypothesisId = "missing";
  await writeFile(
    join(directory, fixtureNames[1]!),
    JSON.stringify(broken),
    "utf8",
  );
  const valid = {
    ...kestrel,
    meta: { ...kestrel.meta, id: "synthetic-validation-fixture" },
  };
  await writeFile(
    join(directory, fixtureNames[2]!),
    JSON.stringify(valid),
    "utf8",
  );
});

afterAll(async () => {
  for (const file of fixtureNames) await unlink(join(directory, file));
  await rmdir(directory);
});

function run(...fixtures: string[]) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", script, ...fixtures],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 20000,
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  return result;
}

describe("production scenario validation CLI", () => {
  it("validates the real bundled flagship with deterministic output", () => {
    const first = run();
    const second = run();
    expect(first.status).toBe(0);
    expect(first.stderr).toBe("");
    expect(first.stdout.trim()).toBe(
      "OK kestrel-relief-corridor v1 hash=1f7af0fb",
    );
    expect(second.stdout).toBe(first.stdout);
  });

  it("fails nonzero for malformed JSON and bad references while retaining the bundled check", () => {
    const files = fixtureNames.slice(0, 2).map((file) => join(directory, file));
    const first = run(...files);
    const second = run(...files);
    expect(first.status).toBe(1);
    expect(first.stdout).toContain(
      "OK kestrel-relief-corridor v1 hash=1f7af0fb",
    );
    expect(first.stderr).toContain("INVALID invalid#%.json");
    expect(first.stderr).toContain(
      '$.reports[0].hypothesisId: custom: Unknown reference "missing"',
    );
    expect(second.stderr).toBe(first.stderr);
  });

  it("accepts a valid explicit fixture and rejects duplicate scenario IDs", () => {
    const valid = run(join(directory, fixtureNames[2]!));
    expect(valid.status).toBe(0);
    expect(valid.stdout).toContain("OK synthetic-validation-fixture v1 hash=");
    const duplicate = run(
      fileURLToPath(
        new URL(
          "../../src/scenarios/kestrel-relief-corridor.json",
          import.meta.url,
        ),
      ),
    );
    expect(duplicate.status).toBe(1);
    expect(duplicate.stderr).toContain(
      'Duplicate scenario ID "kestrel-relief-corridor"',
    );
  });
});
