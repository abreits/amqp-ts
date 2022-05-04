import * as lodash from "lodash";
import * as winston from "winston";

function normalizeError(error: any, level: string): void | Error | object {
  if (lodash.isString(error)) {
    return new Error(error);
  }

  if (!(error instanceof Error)) {
    return;
  }

  const normalizedError: any = {};
  Object.assign(
    normalizedError,
    lodash.omit(error, ["response", "constructor", "toString", "errors"])
  );

  // Restore common fields form the original error
  Object.assign(normalizedError, {
    name: error.name,
    message: error.message,
  });

  if (level === "error") {
    normalizedError.stack = error.stack;
  }

  return normalizedError;
}

const baseFormat = winston.format((context) => {
  if (context.error) {
    const normalizedError = normalizeError(context.error, context.level);
    if (normalizedError) {
      context.error = normalizedError;
    }
  }

  return context;
});

type LogFunction = (message: string, context?: { [key: string]: any }) => void;

export interface LoggerInstance {
  silly: LogFunction;
  debug: LogFunction;
  verbose: LogFunction;
  info: LogFunction;
  warn: LogFunction;
  error: LogFunction;
}

export const logger = {
  jsonLogger(level: string): LoggerInstance {
    const transports = [new winston.transports.Console({ level })];
    const format = winston.format.combine(baseFormat(), winston.format.json());
    return winston.createLogger({
      transports,
      format,
    });
  },
};
