import { readFileSync } from "node:fs";
import { z } from "zod";

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(1).default(360),
  MAX_SESSIONS: z.coerce.number().int().min(1).default(50),
});

export function parseServerEnvironment(environment: NodeJS.ProcessEnv) {
  return environmentSchema.parse(environment);
}

const environment = parseServerEnvironment(process.env);

const manifest = z
  .object({ version: z.string().min(1) })
  .parse(
    JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ),
  );

export const config = {
  port: environment.PORT,
  production: environment.NODE_ENV === "production",
  sessionTtlMs: environment.SESSION_TTL_MINUTES * 60 * 1000,
  maxSessions: environment.MAX_SESSIONS,
  version: manifest.version,
} as const;
