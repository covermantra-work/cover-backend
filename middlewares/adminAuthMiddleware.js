const authMiddleware = require("./authMiddleware");
const { User } = require("../models/Users");

const sanitizeSecret = (val) => {
  if (!val) return "";
  return val.trim().replace(/^["']|["']$/g, "").trim();
};

const combinedAdminAuth = (req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  const cleanSecret = sanitizeSecret(secret);
  const expectedSecret = sanitizeSecret(process.env.ADMIN_SECRET);

  console.log(`[Admin Auth Check] Path: ${req.originalUrl}, Auth Header Present: ${!!secret}`);

  if (cleanSecret && cleanSecret === expectedSecret) {
    return next();
  }

  // Otherwise, require valid JWT token and check user role in DB
  authMiddleware(req, res, async () => {
    try {
      if (!req.user || !req.user.phone) {
        return res.status(403).json({ message: "Access denied. Invalid session." });
      }

      const dbUser = await User.findOne({ phone: req.user.phone });
      if (dbUser && dbUser.role === 'admin') {
        req.user = dbUser; // Attach full user details
        next();
      } else {
        res.status(403).json({ message: "Access denied. Admin only." });
      }
    } catch (err) {
      console.error("Admin Auth DB Error:", err);
      res.status(500).json({ message: "Internal server error during authentication" });
    }
  });
};

module.exports = combinedAdminAuth;
