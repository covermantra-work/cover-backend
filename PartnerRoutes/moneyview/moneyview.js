const router = require("express").Router();
const axios = require("axios");
const LenderResponse = require("../../models/LenderResponse");
const { webusername } = require("../../models/Users");
require("dotenv").config();

const domain = process.env.MONEYVIEW_DOMAIN;



function isValidPAN(pan) {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan);
}


const getToken = async () => {

  const data = {
    userName: process.env.MONEYVIEW_USERNAME,
    password: process.env.MONEYVIEW_PASSWORD,
    partnerCode: process.env.MONEYVIEW_CODE,
  }
  const tokenResponse = await axios.post(`${domain}/token`, data);
  console.log(tokenResponse, "=========")
  console.log("Token:", tokenResponse.data.token);
  return tokenResponse.data.token;
};

router.post("/register", async (req, res) => {
  try {
    const lead = req.body;

    // ✅ Validation check
    if (
      !lead.phone ||
      !lead.name ||
      !lead.dob ||
      !lead.email ||
      !lead.employment_type_id ||
      !lead.pan ||
      !lead.pincode ||
      !lead.consent_timestamp ||
      !lead.consent
    ) {
      return res.status(400).json({ message: "All fields are mandatory" });
    }

    if (!isValidPAN(lead.pan)) {
      return res.status(409).json({ message: "Pan is not valid" })
    }

    // ✅ Build request body
    const requestBody = {
      partnerCode: 453,
      partnerRef: "Covermantra",
      name: lead.name?.trim(),
      gender: lead.gender?.toLowerCase(),
      phone: lead.phone?.toString(),
      pan: lead.pan?.trim().toUpperCase(),
      dateOfBirth: lead.dob,
      bureauPermission: true,
      employmentType:
        lead.employment_type_id === "Self-employed"
          ? "Self Employed"
          : lead.employment_type_id,
      incomeMode: "Online",
      declaredIncome: lead.income ? parseInt(lead.income, 10) : undefined,
      educationLevel: "Graduation",
      maritalStatus: "Married",
      addressList: [
        {
          addressLine1: lead.address?.trim(),
          pincode: lead.pincode?.toString(),
          residenceType: "Rented",
          addressType: "Current",
          city: lead.city,
          state: lead.state,
        },
      ],
      emailList: [
        {
          email: lead.email?.toLowerCase(),
          type: "Primary_User",
        },
      ],
      loanPurpose: "Travel",
      consent: {
        consentDecision: lead.consent,
        deviceTimeStamp: lead.consent_timestamp,
      },
      consentDetails: {
        consentDataList: [
          {
            productConsentType: "BUREAU_PULL",
            consentValue: "GIVEN",
            consentText: "I consent to bureau pull.",
          },
        ],
        deviceTimeStamp: new Date().toISOString(),
      },
    };

    console.log("📤 Sending Lead Request:", requestBody);

    // ✅ Get token
    const token = await getToken();

    // ✅ Dedupe check
    const dedupeBody = {
      email: lead.email,
      phone: lead.phone,
      pan: lead.pan,
    };

    const dedupeCheck = await axios.post(`${domain}/lead/dedupe`, dedupeBody, {
      headers: { token },
    });

    console.log("✅ Dedupe Check Response:", dedupeCheck.data);

    // ✅ Create lead
    const leadRes = await axios.post(`${domain}/lead`, requestBody, {
      headers: { "Content-Type": "application/json", token },
    });

    const leadId = leadRes.data.leadId;
    console.log("✅ Lead Created with ID:", leadId);

    let offersRes = { status: "skipped" };
    let journeyRes = { status: "skipped" };
    let statusRes = { status: "skipped" };

    if (leadId) {
      offersRes = await axios.get(`${domain}/offers/${leadId}`, {
        headers: { token },
      });

      journeyRes = await axios.get(`${domain}/journey-url/${leadId}`, {
        headers: { token },
      });

      statusRes = await axios.get(`${domain}/lead/status/${leadId}`, {
        headers: { token },
      });
    }

    const totalResponse = {
      leadSubmission: leadRes?.data || null,
      offers: offersRes?.data || null,
      journey: journeyRes?.data || null,
      statusRes: statusRes?.data || null,
    };

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
              lenderName: "MoneyView",
              apiResponse: totalResponse,
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
              lenderName: "MoneyView",
              apiResponse: totalResponse,
              createdDate: createdDate
            }
          }
        }
      );
    } catch (dbErr) {
      console.error("❌ DB save failed:", dbErr.message);
    }

    // ✅ Final response
    return res.json({
      status: "success",
      leadSubmission: leadRes.data,
      offers: offersRes.data,
      journey: journeyRes.data,
      statusRes: statusRes.data,
    });
  } catch (error) {
    console.error(
      "❌ Error in /register:",
      error.response?.data || error.message,
    );
    return res.status(500).json({
      status: "failure",
      message: error.response?.data?.message || error.message,
      data: error.response?.data || null,
    });
  }
});


// 🧪 Test route
// router.get("/test", (req, res) => {
//   try {
//     return res.json({ status: "success", message: "test passed" });
//   } catch (error) {
//     console.error("❌ Error:", error.response?.data || error.message);
//     return res
//       .status(500)
//       .json({ status: "error", message: "Something went wrong" });
//   }
// });


// router.get("/token",async (res)=>{
//     const token = await getToken()
//     console.log(process.env.MONEYVIEW_PASSWORD)
//     console.log(token);
//     if(!token)
//         res.status(403).json({"message":"Token not genrated"})

//     res.status(200).json({message:"token genrrated sucessfully",token})
// })



module.exports = router;
