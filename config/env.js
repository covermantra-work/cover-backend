require("dotenv").config();

const requiredEnvVars = ["MONGO_URL"];

function validateEnv() {
  const missing = [];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    console.warn(`⚠️ Warning: Missing required environment variables: ${missing.join(", ")}`);
  }

  // Warn if neither JWT_SECRECT nor JWT_SECRET is set
  if (!process.env.JWT_SECRECT && !process.env.JWT_SECRET) {
    console.warn("⚠️ Warning: JWT_SECRECT is not set in .env. Using fallback secret (not recommended for production).");
  }
}

validateEnv();

module.exports = {
  PORT: process.env.PORT || 5001,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGO_URL: process.env.MONGO_URL,
  JWT_SECRECT: process.env.JWT_SECRECT || process.env.JWT_SECRET || "fallback_default_jwt_secret_key",
  JWT_SECRET: process.env.JWT_SECRECT || process.env.JWT_SECRET || "fallback_default_jwt_secret_key",
  ADMIN_SECRET: process.env.ADMIN_SECRET || "covermantra_super_admin_secret_2026",
};
