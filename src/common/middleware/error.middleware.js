const logger = require("../logger/logger.service");

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // Log error
  logger.logError(req.correlationId, "ERROR_HANDLER", err);

  // Development environment - send full error
  if (process.env.NODE_ENV === "development") {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
      correlationId: req.correlationId,
    });
  }

  // Production environment - send limited error info
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      correlationId: req.correlationId,
    });
  }

  // Programming or unknown error: don't leak error details
  return res.status(500).json({
    success: false,
    message: "Something went wrong!",
    correlationId: req.correlationId,
  });
};

const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

module.exports = {
  AppError,
  errorHandler,
  catchAsync,
};
