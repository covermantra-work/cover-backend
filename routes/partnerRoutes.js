const express = require("express");
const router = express.Router();
const adapters = require("../adapters");
const LenderResponse = require("../models/LenderResponse");
const { webusername } = require("../models/Users");
const authMiddleware = require("../middlewares/authMiddleware");

const submissionLocks = new Map();
const LOCK_TIMEOUT_MS = 15000; // 15 seconds lock

// @route   GET /api/partners/:lenderId/form-config
// @desc    Get form configuration for a specific lender
// @access  Public
router.get("/:lenderId/form-config", (req, res) => {
  const { lenderId } = req.params;
  const adapterKey = Object.keys(adapters).find(k => k.toLowerCase() === lenderId.toLowerCase());
  const adapter = adapters[adapterKey];

  if (!adapter) {
    return res.status(404).json({ message: `Lender adapter not found for ID: ${lenderId}` });
  }

  try {
    const config = adapter.getFormConfig();
    res.json(config);
  } catch (error) {
    console.error(`Error fetching form config for ${lenderId}:`, error);
    res.status(500).json({ message: "Server Error fetching form configuration" });
  }
});

// @route   POST /api/partners/:lenderId/register
// @desc    Register a lead with a specific lender and save standardized log
// @access  Private
router.post("/:lenderId/register", authMiddleware, async (req, res) => {
  const { lenderId } = req.params;
  const adapterKey = Object.keys(adapters).find(k => k.toLowerCase() === lenderId.toLowerCase());
  const adapter = adapters[adapterKey];

  if (!adapter) {
    return res.status(404).json({ message: `Lender adapter not found for ID: ${lenderId}` });
  }

  const mobile = req.body.phone || req.body.mobile;

  // Verify authorization: check if logged-in user phone matches input mobile number
  if (!mobile || String(mobile) !== String(req.user.phone)) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: You are not authorized to register a lead for this phone number."
    });
  }

  // Deduplication check
  if (mobile) {
    const lockKey = `${mobile}_${lenderId.toLowerCase()}`;
    const now = Date.now();

    if (submissionLocks.has(lockKey)) {
      return res.status(429).json({
        success: false,
        message: "Duplicate submission. Please wait a few seconds before trying again."
      });
    }
    submissionLocks.set(lockKey, now);

    // Automatically delete lock key to prevent memory leak
    setTimeout(() => {
      submissionLocks.delete(lockKey);
    }, LOCK_TIMEOUT_MS);
  }

  try {
    // 1. Submit lead to adapter
    const result = await adapter.register(req.body);

    // 2. Perform centralized DB logging
    const mobile = req.body.phone || req.body.mobile;
    const name = req.body.name || `${req.body.first_name || ""} ${req.body.last_name || ""}`.trim();

    if (mobile) {
      try {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        const createdDate = `${dd}/${mm}/${yyyy}`;

        const lenderName = adapter.getFormConfig().title;

        // Save to LenderResponse collection
        await LenderResponse.findOneAndUpdate(
          { mobile: String(mobile) },
          {
            $setOnInsert: { name: name },
            $push: {
              responses: {
                lenderName: lenderName,
                apiResponse: result.apiResponse,
                createdDate: createdDate
              }
            }
          },
          { upsert: true, new: true }
        );

        // Push response log to Main Webuser collection
        await webusername.findOneAndUpdate(
          { phone: String(mobile) },
          {
            $push: {
              lenderResponses: {
                lenderName: lenderName,
                apiResponse: result.apiResponse,
                createdDate: createdDate
              }
            }
          }
        );
      } catch (dbErr) {
        console.error("❌ DB logging failed in dynamic router:", dbErr.message);
      }
    }

    // 3. Return standardized result with dynamic auto-fill parameters
    let finalRedirectUrl = result.redirectUrl || "";
    if (finalRedirectUrl) {
      const phone = req.body.phone || req.body.mobile || (req.user && req.user.phone) || "";
      const pincode = req.body.pincode || (req.user && req.user.pincode) || "";
      const salary = req.body.income || req.body.salary || (req.user && req.user.income) || "";

      try {
        const urlObj = new URL(finalRedirectUrl.startsWith("http") ? finalRedirectUrl : `https://${finalRedirectUrl}`);
        if (phone) {
          urlObj.searchParams.set("phone", String(phone));
          urlObj.searchParams.set("mobile", String(phone));
        }
        if (pincode) urlObj.searchParams.set("pincode", String(pincode));
        if (salary) urlObj.searchParams.set("salary", String(salary));
        finalRedirectUrl = urlObj.toString();
      } catch (urlErr) {
        const separator = finalRedirectUrl.includes("?") ? "&" : "?";
        let params = [];
        if (phone) {
          params.push(`phone=${phone}`);
          params.push(`mobile=${phone}`);
        }
        if (pincode) params.push(`pincode=${pincode}`);
        if (salary) params.push(`salary=${salary}`);
        if (params.length > 0) {
          finalRedirectUrl = `${finalRedirectUrl}${separator}${params.join("&")}`;
        }
      }
    }

    res.status(200).json({
      success: result.success,
      redirectUrl: finalRedirectUrl,
      offer: result.offer,
      totalresponse: result.apiResponse
    });

  } catch (error) {
    console.error(`Error processing lead for ${lenderId}:`, error.message);
    res.status(500).json({
      success: false,
      message: "Lead registration failed",
      error: error.message
    });
  }
});

module.exports = router;
