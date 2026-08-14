const express = require("express");
const router = express.Router();
const { User } = require("../models/Users");
const LenderResponse = require("../models/LenderResponse");

// Helper to sanitize phone number to 10 digits
function sanitizePhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Escape regular expression special characters to prevent ReDoS attacks
function escapeRegex(string) {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// Middleware to verify webhook token signature
const verifyWebhookToken = (req, res, next) => {
  const incomingToken = req.headers['x-webhook-token'];
  const expectedToken = process.env.WEBHOOK_SECRET;

  if (!expectedToken) {
    console.warn("[Webhook Security Warning] WEBHOOK_SECRET is not configured in environment variables!");
    return res.status(500).json({ success: false, message: "Webhook secret is not configured on server" });
  }

  if (!incomingToken || incomingToken !== expectedToken) {
    console.warn(`[Webhook Security Auth Failed] Path: ${req.originalUrl}, Remote IP: ${req.ip}`);
    return res.status(401).json({ success: false, message: "Unauthorized webhook request: Invalid x-webhook-token" });
  }

  next();
};

// Unified Helper to process a webhook payload and update MongoDB
const processLenderWebhook = async (lenderName, payload, req, res) => {
  const { phone, mobile, phoneNumber, mobileNumber, status, loanStatus, stage, amount, loanAmount, approvedAmount } = payload;

  const rawPhone = phone || mobile || phoneNumber || mobileNumber;
  const rawStatus = status || loanStatus || stage;
  const rawAmount = amount || loanAmount || approvedAmount;

  if (!rawPhone) {
    console.warn(`[Webhook Warning] [${lenderName}] No phone number found in payload:`, payload);
    return res.status(400).json({ success: false, message: "Missing phone/mobile in webhook payload" });
  }

  const phone10 = sanitizePhone(rawPhone);
  const normalizedStatus = String(rawStatus || "applied").toLowerCase();

  // Map incoming status string to our User model enum: applied, approved, rejected, disbursed, none
  let mappedStatus = "applied";
  if (["approve", "approved", "accept", "accepted", "eligible", "offer"].some(s => normalizedStatus.includes(s))) {
    mappedStatus = "approved";
  } else if (["reject", "rejected", "decline", "declined", "ineligible"].some(s => normalizedStatus.includes(s))) {
    mappedStatus = "rejected";
  } else if (["disburse", "disbursed", "paid", "success"].some(s => normalizedStatus.includes(s))) {
    mappedStatus = "disbursed";
  }

  try {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const createdDate = `${dd}/${mm}/${yyyy}`;

    // 1. Update User Document matching phone suffix (regex escaped to prevent ReDoS)
    const user = await User.findOne({ phone: new RegExp(escapeRegex(phone10) + "$") });
    if (user) {
      user.loanStatus = mappedStatus;
      if (rawAmount) {
        user.loanAmount = Number(rawAmount);
      }
      if (mappedStatus === "disbursed") {
        user.loanDisbursedDate = new Date();
      }

      // Check if this lender already has a response record in user array, update or push
      const responseIdx = user.lenderResponses.findIndex(r => r.lenderName.toLowerCase().includes(lenderName.toLowerCase()));
      if (responseIdx !== -1) {
        user.lenderResponses[responseIdx].apiResponse = {
          ...user.lenderResponses[responseIdx].apiResponse,
          webhookStatus: rawStatus,
          webhookPayload: payload,
          updatedAt: new Date().toISOString()
        };
      } else {
        user.lenderResponses.push({
          lenderName: lenderName.toUpperCase(),
          apiResponse: { webhookStatus: rawStatus, webhookPayload: payload },
          createdDate: createdDate
        });
      }
      await user.save();
      console.log(`[Webhook Success] Updated status for User ${user.phone} to ${mappedStatus} via ${lenderName}`);
    } else {
      console.log(`[Webhook Info] User with phone suffix ${phone10} not found in DB`);
    }

    // 2. Perform centralized logging in LenderResponse
    await LenderResponse.findOneAndUpdate(
      { mobile: String(phone10) },
      {
        $setOnInsert: { name: user ? user.name : `Auto-Generated (Webhook: ${lenderName})` },
        $push: {
          responses: {
            lenderName: `${lenderName.toUpperCase()}_CALLBACK`,
            apiResponse: { status: rawStatus, amount: rawAmount, payload },
            createdDate: createdDate
          }
        }
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: `Webhook processed successfully for ${lenderName}` });
  } catch (error) {
    console.error(`[Webhook Error] Failed to process ${lenderName} webhook:`, error);
    res.status(500).json({ success: false, message: "Internal server error processing webhook", error: error.message });
  }
};

// @route   POST /api/webhooks/zype
// @desc    Webhook postback for Zype Loan status updates
router.post("/zype", verifyWebhookToken, async (req, res) => {
  await processLenderWebhook("ZYPE LOAN", req.body, req, res);
});

// @route   POST /api/webhooks/moneyview
// @desc    Webhook postback for Moneyview Loan status updates
router.post("/moneyview", verifyWebhookToken, async (req, res) => {
  await processLenderWebhook("MONEYVIEW LOAN", req.body, req, res);
});

// @route   POST /api/webhooks/vivifi
// @desc    Webhook postback for Vivifi Loan status updates
router.post("/vivifi", verifyWebhookToken, async (req, res) => {
  await processLenderWebhook("VIVIFI LOAN", req.body, req, res);
});

// @route   POST /api/webhooks/fatakpay
// @desc    Webhook postback for Fatakpay Loan status updates
router.post("/fatakpay", verifyWebhookToken, async (req, res) => {
  await processLenderWebhook("FATAKPAY Loans", req.body, req, res);
});

module.exports = router;
