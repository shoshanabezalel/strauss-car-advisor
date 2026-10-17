import { z } from "zod";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Parse `raw` with `schema`; on failure throw a ConfigError naming the file and every bad path. */
export function parseWith<S extends z.ZodType>(schema: S, raw: unknown, file: string): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(`Invalid ${file}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
