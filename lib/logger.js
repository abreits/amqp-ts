"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var lodash = require("lodash");
var winston = require("winston");
function normalizeError(error, level) {
    if (lodash.isString(error)) {
        return new Error(error);
    }
    if (!(error instanceof Error)) {
        return;
    }
    var normalizedError = {};
    Object.assign(normalizedError, lodash.omit(error, ["response", "constructor", "toString", "errors"]));
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
var baseFormat = winston.format(function (context) {
    if (context.error) {
        var normalizedError = normalizeError(context.error, context.level);
        if (normalizedError) {
            context.error = normalizedError;
        }
    }
    return context;
});
exports.logger = {
    jsonLogger: function (level) {
        var transports = [new winston.transports.Console({ level: level })];
        var format = winston.format.combine(baseFormat(), winston.format.json());
        return winston.createLogger({
            transports: transports,
            format: format,
        });
    },
};

//# sourceMappingURL=logger.js.map
