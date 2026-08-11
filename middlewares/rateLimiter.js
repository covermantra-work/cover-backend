const rateLimit = require("express-rate-limit");

// Standard Auth limiter (Login / Register / Profile updates)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication requests from this IP. Please try again after 15 minutes."
  }
});

// Stricter OTP Limiter (Send OTP / Verify OTP)
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 OTP requests per 10 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP requests. Please wait 10 minutes before requesting again."
  }
});

// Contact Us limiter
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 messages per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many contact form submissions. Please try again later."
  }
});

// General API protection limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "API rate limit exceeded. Please try again shortly."
  }
});

module.exports = {
  authLimiter,
  otpLimiter,
  contactLimiter,
  apiLimiter
};
