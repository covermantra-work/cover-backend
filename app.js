const { PORT, NODE_ENV } = require("./config/env");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const connectDb = require("./config/db");
const corsOptions = require("./config/cors");
const errorHandler = require("./middlewares/errorHandler");
const { apiLimiter } = require("./middlewares/rateLimiter");
const authMiddleware = require("./middlewares/authMiddleware");

// Model Safety verification
const { webusername } = require("./models/Users");
const LenderResponse = require("./models/LenderResponse");

if (webusername.collection.name === LenderResponse.collection.name) {
  throw new Error(
    `Invalid DB model mapping: both models point to "${webusername.collection.name}". ` +
      `Use separate collections for user profiles and lender responses.`
  );
}

const app = express();

// Enable trust proxy for Nginx / Cloudflare load balancers to read actual client IPs
app.set("trust proxy", 1);

// 1. Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

// 2. CORS Policy
app.use(cors(corsOptions));

// 3. Body Parsers with DoS Protection Limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// 4. Rate Limiting for API routes
app.use("/api", apiLimiter);

// 5. Basic Health & Root routes
app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "CoverMantra API Server",
    version: "1.0.0",
    environment: NODE_ENV
  });
});

app.get("/api/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStatusMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    database: {
      status: dbStatusMap[dbStatus] || "unknown",
      readyState: dbStatus
    }
  });
});

// 6. Application Routes (100% Intact API Surface)
const userRoutes = require("./routes/userRoutes");
const lenderRoutes = require("./routes/lenderRoutes");
const partnerRoutes = require("./routes/partnerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const blogRoutes = require("./routes/blogRoutes");
const insurence = require("./insurence/insurences");

// Legacy Partner Direct Routes
const moneyview = require("./PartnerRoutes/moneyview/moneyview");
const fatakPay = require("./PartnerRoutes/fatakpay/fatakpay");
const zype = require("./PartnerRoutes/zype/zype");
const vivifiRoutes = require("./PartnerRoutes/vivifi/vivifi");

app.use("/api/user", userRoutes);
app.use("/api/lenders", lenderRoutes);
app.use("/api/partners", partnerRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/auth-gate-70898/blogs", blogRoutes);
app.use("/api/auth-gate-70898", adminRoutes);
app.use("/api/insurence", insurence);

// Partner routes with JWT authentication
app.use("/api/moneyview", authMiddleware, moneyview);
app.use("/api/fatakPay", authMiddleware, fatakPay);
app.use("/api/zype", authMiddleware, zype);
app.use("/api/vivifi", authMiddleware, vivifiRoutes);

// 7. 404 Route Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// 8. Global Centralized Error Handler (Catches all unhandled exceptions)
app.use(errorHandler);

// 9. Database Connection & Server Initialization
connectDb();

const server = app.listen(PORT, () => {
  console.log(`🚀 CoverMantra Server running securely on port ${PORT} [${NODE_ENV}]`);
});

// 10. Graceful Shutdown & Unhandled Exception Handlers
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    console.log("⚡ HTTP server closed.");
    try {
      await mongoose.connection.close(false);
      console.log("📦 MongoDB connection closed cleanly.");
      process.exit(0);
    } catch (err) {
      console.error("Error during MongoDB disconnection:", err.message);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds if hanging
  setTimeout(() => {
    console.error("⚠️ Forcing shutdown after timeout.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

module.exports = app;
