const winston = require("winston");
const path = require("path");

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "pdf-tools-api" },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ timestamp, level, message, ...metadata }) => {
            let msg = `${timestamp} [${level}]: ${message}`;
            if (Object.keys(metadata).length > 0) {
              msg += ` ${JSON.stringify(metadata)}`;
            }
            return msg;
          }
        )
      ),
    }),
    // Write error logs to file
    new winston.transports.File({
      filename: path.join(__dirname, "../../../logs/error.log"),
      level: "error",
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(__dirname, "../../../logs/combined.log"),
    }),
  ],
});

// Create a wrapper for structured logging
class LoggerService {
  info(message, meta = {}) {
    logger.info(message, meta);
  }

  error(message, meta = {}) {
    logger.error(message, meta);
  }

  warn(message, meta = {}) {
    logger.warn(message, meta);
  }

  debug(message, meta = {}) {
    logger.debug(message, meta);
  }

  logRequest(correlationId, usecase, payload) {
    this.info(`[${correlationId}] ${usecase} - Request`, { payload });
  }

  logResponse(correlationId, usecase, response) {
    this.info(`[${correlationId}] ${usecase} - Response`, { response });
  }

  logError(correlationId, usecase, error) {
    this.error(`[${correlationId}] ${usecase} - Error`, {
      message: error.message,
      stack: error.stack,
    });
  }
}

module.exports = new LoggerService();
