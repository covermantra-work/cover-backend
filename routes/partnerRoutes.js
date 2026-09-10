const express = require("express");
const router = express.Router();
const adapters = require("../adapters");
const LenderResponse = require("../models/LenderResponse");
const { webusername } = require("../models/Users");
const authMiddleware = require("../middlewares/authMiddleware");

const submissionLocks = new Map();
const LOCK_TIMEOUT_MS = 15000; // 15 seconds lock

const ID_TO_ADAPTER = {
  c1: "credify",
  v1: "vivifi",
  f1: "fatakPay",
  z1: "zype",
  m1: "moneyview"
};

function getAdapter(lenderId) {
  if (!lenderId) return null;
  const rawId = String(lenderId).toLowerCase();
  const mappedKey = ID_TO_ADAPTER[rawId] || rawId;
  const adapterKey = Object.keys(adapters).find(k => k.toLowerCase() === mappedKey.toLowerCase());
  return adapterKey ? adapters[adapterKey] : null;
}

// @route   GET /api/partners/:lenderId/form-config
// @desc    Get form configuration for a specific lender
// @access  Public
router.get("/:lenderId/form-config", (req, res) => {
  const { lenderId } = req.params;
  const adapter = getAdapter(lenderId);

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
  const adapter = getAdapter(lenderId);

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
    // 1. Submit lead to adapter (Optionally bypass external API calls)
    const shouldBypassApi = process.env.BYPASS_EXTERNAL_APIS !== "false";
    
    let result;
    if (shouldBypassApi) {
      console.log(`[partnerRoutes] Bypassing external API call for lender: ${lenderId}`);
      const config = adapter.getFormConfig();
      result = {
        success: true,
        redirectUrl: config.redirectUrlOnSuccess || "",
        offer: "Pre-Approved",
        apiResponse: { status: "CAPTURED", message: "Form submitted and lead saved locally (API call bypassed)" }
      };
    } else {
      result = await adapter.register(req.body);
    }

    // 2. Determine final redirect url (with dynamic query parameters)
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

    // 3. Perform centralized DB logging
    const mobile = req.body.phone || req.body.mobile;
    const name = req.body.name || `${req.body.first_name || ""} ${req.body.last_name || ""}`.trim();
    const pincode = req.body.pincode || (req.user && req.user.pincode) || "";

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
                pincode: String(pincode),
                redirectUrl: finalRedirectUrl,
                appliedAt: new Date()
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
                lenderName: lenderName
              }
            }
          }
        );
      } catch (dbErr) {
        console.error("❌ DB logging failed in dynamic router:", dbErr.message);
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

// @route   GET /api/partners/click-redirect
// @desc    Redirect to lender's external UTM link and log the click
// @access  Public
router.get("/click-redirect", async (req, res) => {
  const { lenderId, phone } = req.query;

  if (!lenderId) {
    return res.status(400).send("Lender ID is required");
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const lendersFilePath = path.join(__dirname, '../data/lenders.json');
    
    let lenders = [];
    if (fs.existsSync(lendersFilePath)) {
      lenders = JSON.parse(fs.readFileSync(lendersFilePath, 'utf8'));
    }
    
    const lender = lenders.find(l => String(l._id) === String(lenderId));
    if (!lender) {
      return res.status(404).send("Lender not found");
    }

    const targetUrl = lender.UTM || lender.applyLink;
    if (!targetUrl) {
      return res.status(400).send("No redirect URL configured for this lender");
    }

    // Perform DB logging if phone is provided
    if (phone) {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const createdDate = `${dd}/${mm}/${yyyy}`;

      const apiResponse = { status: "CLICKED", message: "User clicked direct apply link" };

      // Find user name and pincode if possible
      let userName = "App/Web User";
      let userPincode = "";
      const user = await webusername.findOne({ phone: String(phone) });
      if (user) {
        if (user.name) userName = user.name;
        if (user.pincode) userPincode = user.pincode;
      }

      // Decorate targetUrl with phone/mobile and other parameters
      let finalTargetUrl = targetUrl;
      try {
        const [cleanBase, hashFragment] = targetUrl.split("#");
        const urlObj = new URL(cleanBase.startsWith("http") ? cleanBase : `https://${cleanBase}`);
        if (phone) {
          urlObj.searchParams.set("phone", String(phone));
          urlObj.searchParams.set("mobile", String(phone));
        }
        if (userPincode) urlObj.searchParams.set("pincode", String(userPincode));
        if (user && user.income) urlObj.searchParams.set("salary", String(user.income));
        
        // Append all incoming tracking parameters without overwriting partner-specific query params
        Object.keys(req.query).forEach(key => {
          if (key !== 'lenderId' && key !== 'phone') {
            if (!urlObj.searchParams.has(key)) {
              urlObj.searchParams.set(key, String(req.query[key]));
            }
          }
        });
        
        const rebuilt = urlObj.toString();
        finalTargetUrl = hashFragment ? `${rebuilt}#${hashFragment}` : rebuilt;
      } catch (urlErr) {
        const [cleanBase, hashFragment] = targetUrl.split("#");
        const separator = cleanBase.includes("?") ? "&" : "?";
        let params = [];
        if (phone) {
          params.push(`phone=${phone}`);
          params.push(`mobile=${phone}`);
        }
        if (userPincode) params.push(`pincode=${userPincode}`);
        const paramStr = params.length > 0 ? `${separator}${params.join("&")}` : "";
        finalTargetUrl = hashFragment ? `${cleanBase}${paramStr}#${hashFragment}` : `${cleanBase}${paramStr}`;
      }

      // Save to LenderResponse collection
      await LenderResponse.findOneAndUpdate(
        { mobile: String(phone) },
        {
          $setOnInsert: { name: userName },
          $push: {
            responses: {
              lenderName: lender.name,
              pincode: String(userPincode),
              redirectUrl: finalTargetUrl,
              appliedAt: new Date()
            }
          }
        },
        { upsert: true, new: true }
      );

      // Push response log to Main Webuser collection
      await webusername.findOneAndUpdate(
        { phone: String(phone) },
        {
          $push: {
            lenderResponses: {
              lenderName: lender.name
            }
          }
        }
      );
      
      res.redirect(finalTargetUrl);
    } else {
      let finalTargetUrl = targetUrl;
      try {
        const [cleanBase, hashFragment] = targetUrl.split("#");
        const urlObj = new URL(cleanBase.startsWith("http") ? cleanBase : `https://${cleanBase}`);
        Object.keys(req.query).forEach(key => {
          if (key !== 'lenderId' && key !== 'phone') {
            if (!urlObj.searchParams.has(key)) {
              urlObj.searchParams.set(key, String(req.query[key]));
            }
          }
        });
        const rebuilt = urlObj.toString();
        finalTargetUrl = hashFragment ? `${rebuilt}#${hashFragment}` : rebuilt;
      } catch(e) {}
      res.redirect(finalTargetUrl);
    }

  } catch (error) {
    console.error("Error in click-redirect:", error);
    res.status(500).send("An error occurred during redirect");
  }
});

module.exports = router;
