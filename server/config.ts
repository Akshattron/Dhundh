import { readFileSync } from "node:fs";
import { z } from "zod";

const environment = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .parse(process.env);

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
  version: manifest.version,
} as const;
