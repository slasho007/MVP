import { pino, type Logger } from "pino";
import type { Env } from "../config/env.js";

export function createLogger(env: Pick<Env, "NODE_ENV" | "LOG_LEVEL">): Logger {
  return pino({
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === "development"
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss" },
          },
        }
      : {}),
    redact: {
      paths: ["req.headers.authorization", "accessToken", "*.accessToken"],
      censor: "[REDACTED]",
    },
  });
}

export type { Logger };
