const router = require("express").Router();
const axios = require("axios");
const LenderResponse = require("../../models/LenderResponse");
const { webusername } = require("../../models/Users");

// ✅ Mask mobile function
function maskMobile(mobile) {
  if (!mobile) return "";
  const digits = String(mobile).replace(/\D/g, "");
  if (digits.length !== 10) return digits; // fallback
  return "xxx" + digits.slice(3);
}

// ✅ PAN validation
function isValidPAN(pan) {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan);
}

// ✅ Mobile validation
function isValidMobileNumber(number) {
  const mobileRegex = /^[6-9]\d{9}$/;
  return mobileRegex.test(number);
}

router.post("/register", async (req, res) => {
  let deduperesponse = null;
  let apires = null;

  try {
    const lead = req.body;

    // ✅ Required fields check
    if (
      !lead.phone ||
      !lead.name ||
      !lead.dob ||
      !lead.email ||
      !lead.employmentType ||
      !lead.pan ||
      !lead.income
    ) {
      return res.status(400).json({ message: "All fields are mandatory" });
    }

    // ✅ Mobile validation
    if (!isValidMobileNumber(lead.phone)) {
      return res.status(400).json({ message: "Mobile number is invalid" });
    }

    // ✅ PAN validation
    if (!isValidPAN(lead.pan)) {
      return res.status(400).json({ message: "PAN number is invalid" });
    }

    // ✅ Masked mobile for dedupe
    const dedupeMobile = maskMobile(lead.phone);
    console.log("🔹 Masked Mobile:", dedupeMobile);

    // ✅ Prepare dedupe payload
    const dedupePayload = {
      mobileNumber: dedupeMobile,
      panNumber: lead.pan,
      partnerId: process.env.ZYPE_PARTNER_ID,
    };

    // ✅ Call Dedupe API (wrapped in try/catch so it never blocks)
    try {
      const dedupeRes = await axios.post(
        "https://prod.zype.co.in/attribution-service/api/v1/underwriting/customerEligibility",
        dedupePayload,
        { headers: { "Content-Type": "application/json" } }
      );
      deduperesponse = dedupeRes.data;
      console.log("✅ Dedupe Response:", deduperesponse);
    } catch (err) {
      deduperesponse = { error: err.response?.data || err.message };
      console.error("❌ Dedupe API failed:", deduperesponse);
    }

    // Dummy bureau payload
    // const bureauPayload = {
    //   score: 765,
    //   reportDate: "2024-03-20",
    // };

    // ✅ Prepare main API payload
    const payloadrequest = {
      mobileNumber: String(lead.phone),
      email: lead.email,
      dob: lead.dob,
      panNumber: String(lead.pan),
      name: lead.name,
      income: Number(lead.income),
      employmentType: lead.employmentType,
      partnerId: process.env.ZYPE_PARTNER_ID,
      bureauType: 3,
      // bureauName: "cibil",
      // bureauData: JSON.stringify(bureauPayload),
    };

    console.log("📤 Sending PreApproval payload:", JSON.stringify(payloadrequest, null, 2));

    // ✅ Call PreApproval API (also wrapped in try/catch)
    try {
      const apiRes = await axios.post(
        "https://prod.zype.co.in/attribution-service/api/v1/underwriting/preApprovalOffer",
        payloadrequest,
        { headers: { "Content-Type": "application/json" } }
      );
      apires = apiRes.data;
      console.log("✅ PreApproval API Response:", apires);
    } catch (err) {
      apires = { error: err.response?.data || err.message };
      console.error("❌ PreApproval API failed:", apires);
    }

    // ✅ Save partner response in DB (Standardized Format)
    try {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const createdDate = `${dd}/${mm}/${yyyy}`;

      await LenderResponse.findOneAndUpdate(
        { mobile: String(lead.phone) },
        {
          $setOnInsert: { name: lead.name },
          $push: {
            responses: {
              lenderName: "Zype",
              apiResponse: totalresponse, // Saving both dedupe and apires
              createdDate: createdDate
            }
          }
        },
        { upsert: true, new: true }
      );

      // ✅ Also push to the main webuser collection
      await webusername.findOneAndUpdate(
        { phone: String(lead.phone) },
        {
          $push: {
            lenderResponses: {
              lenderName: "Zype",
              apiResponse: totalresponse,
              createdDate: createdDate
            }
          }
        }
      );
    } catch (dbErr) {
      console.error("❌ DB save failed:", dbErr.message);
    }

    // ✅ Always return both responses
    const totalresponse = {
      deduperesponse,
      apires,
    };

    return res.status(200).json({
      message: "Registration processed",
      totalresponse,
    });
  } catch (e) {
    console.error("❌ Error in /register:", e.response?.data || e.message);

    // Even if outer try fails, still send whatever we captured
    return res.status(400).json({
      message: "Something went wrong",
      totalresponse: {
        deduperesponse,
        apires,
      },
      error: e.response?.data || e.message,
    });
  }
});

module.exports = router;
