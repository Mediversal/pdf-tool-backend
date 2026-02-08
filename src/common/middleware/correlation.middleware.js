const { v4: uuidv4 } = require("uuid");

const correlationId = (req, res, next) => {
  // Get correlation ID from header or generate new one
  req.correlationId = req.headers["x-correlation-id"] || uuidv4();
  
  // Add correlation ID to response headers
  res.setHeader("X-Correlation-ID", req.correlationId);
  
  next();
};

module.exports = { correlationId };
