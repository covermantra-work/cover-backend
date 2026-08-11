// Global Express Error Handling Middleware

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  
  // Log error details securely on the server
  console.error(`❌ [Error ${statusCode}] ${req.method} ${req.originalUrl}:`, err.message);
  if (process.env.NODE_ENV === "development" && err.stack) {
    console.error(err.stack);
  }

  // Handle specific error types
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: err.message || "Invalid input data"
    });
  }

  if (err.name === "UnauthorizedError" || err.message?.includes("Unauthorized")) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized access"
    });
  }

  if (err.message === "Not allowed by CORS policy") {
    return res.status(403).json({
      success: false,
      message: "CORS policy restriction"
    });
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || "An unexpected internal server error occurred"
  });
};

module.exports = errorHandler;
