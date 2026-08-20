const express = require("express");
const { webusername, DeleteRequest } = require("../models/Users.js")
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const rateLimit = require("express-rate-limit");

const isDevMode = process.env.NODE_ENV === "development" || process.env.ALLOW_TEST_BYPASS === "true";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevMode ? 1000 : 5,
  message: { message: "You have requested too many OTPs. Please try again after 15 minutes for security reasons." }
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many contact requests. Please try again after 15 minutes." }
});
const axios = require("axios");
const { generateOTP } = require("../utils/otpstore");
const { generateToken } = require("../utils/jwtgenerate");
const lenderList = require("../lender/lenderList");
const Lender = require("../models/Lender");
const Contact = require("../models/Contact");
const fs = require("fs");
const path = require("path");
const otpStorage = new Map();

const lendersFilePath = path.join(__dirname, "../data/lenders.json");

const getStoredLenders = async () => {
  try {
    if (fs.existsSync(lendersFilePath)) {
      const data = fs.readFileSync(lendersFilePath, "utf8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Error reading lenders file in userRoutes:", err.message);
  }
  try {
    const dbLenders = await Lender.find().sort({ priority: 1 });
    if (dbLenders && dbLenders.length > 0) {
      return dbLenders;
    }
  } catch (dbError) {
    console.error("MongoDB Lender fetch failed, falling back to static list:", dbError.message);
  }
  return lenderList;
};

//update
require('dotenv').config();

function isValidPAN(pan) {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan);
}

function isValidMobileNumber(number) {
  const mobileRegex = /^[6-9]\d{9}$/;
  return mobileRegex.test(number);
}

function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

router.get("/", (req, res) => {
  res.send("hello alive");
});

router.post("/eligibility", async (req, res) => {
  const { age, income, pincode } = req.body;

  if (!age || !income || !pincode) {
    return res.status(400).json({ message: "Age, income, and pincode are required" });
  }

  if (age <= 18) {
    return res.json({ eligible: false, message: "Age must be greater than 18" });
  }

  const allLenders = await getStoredLenders();

  // Filter lenders based on age, income, pincode, and active status
  const eligibleLenders = allLenders.filter((lender) => {
    const ageMatch = Number(age) >= Number(lender.age);
    const incomeMatch = Number(income) >= Number(lender.minIncome);
    const pincodesArr = Array.isArray(lender.pincodes) ? lender.pincodes : [];
    const isBlacklisted = pincodesArr.some(p => typeof p === "string" && p.startsWith("!") && String(pincode).startsWith(p.slice(1)));
    const pincodeMatch = !isBlacklisted && (pincodesArr.includes("*") || pincodesArr.includes(String(pincode)));
    const activeMatch = lender.isActive !== false;

    return ageMatch && incomeMatch && pincodeMatch && activeMatch;
  });

  if (eligibleLenders.length === 0) {
    return res.json({
      eligible: false,
      message: "No lenders available for your age, income, or pincode",
    });
  }

  res.json({
    eligible: true,
    message: "Eligible lenders found",
    lenders: eligibleLenders,
  });
});

router.post("/register", async (req, res) => {
  const {
    name,
    phone,
    pan,
    dob,
    email,
    city,
    state,
    gender,
    employment,
    income,
    pincode,
    consent,
    consentMessage,
  } = req.body;

  if (
    !name ||
    !phone ||
    !pan ||
    !dob ||
    !email ||
    !city ||
    !state ||
    !gender ||
    !employment ||
    !income ||
    !pincode
  ) {
    return res.status(400).send("All fields are required");
  }

  if (!isValidMobileNumber(phone)) {
    return res.status(400).json({ message: "Mobile number not valid" })
  }

  if (!isValidPAN(pan)) {
    return res.status(400).json({ message: "Pan is not valid " })
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Email is not valid" })
  }

  try {
    const existingPhone = await webusername.findOne({ phone });
    if (existingPhone) {
      return res.status(400).send("Mobile number is already registered. Please sign in.");
    }

    const existingEmail = await webusername.findOne({ email });
    if (existingEmail) {
      return res.status(400).send("Email address is already registered. Please sign in.");
    }

    const newUser = new webusername({
      name,
      phone,
      pan,
      dob,
      email,
      city,
      state,
      gender,
      employment,
      income,
      pincode,
      source: req.body.source || "web",
      isAppUser: req.body.source === "app",
      consent: consent !== undefined ? consent : true,
      consentMessage: consentMessage || "I agree to the Terms & Conditions and Privacy Policy."
    });
    await newUser.save();
    return res
      .status(201)
      .json({ message: "webusername registered successfully", user: newUser });
  } catch (err) {
    console.error("Register error:", err);
    return res
      .status(500)
      .json({ message: "Server error" });
  }
});
router.post("/send-otp", authLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    console.log("--- OTP FLOW START ---");
    console.log("Phone:", phone);

    if (!phone) return res.status(400).json({ message: "Phone required" });

    // Bypass for Google Reviewer / testing dummy number (Controlled via ALLOW_TEST_BYPASS in .env)
    if (process.env.ALLOW_TEST_BYPASS === "true" && phone === "9876543210") {
      otpStorage.set(phone, {
        otp: "123456",
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours expiry
      });
      console.log("✅ Bypass OTP stored for reviewer: 123456");
      return res.status(200).json({
        success: true,
        message: "OTP process completed (Bypass number)"
      });
    }

    // 1. Generate Live OTP
    const otp = generateOTP();

    // 2. Memory Save
    try {
      console.log("Attempting Memory Save...");
      otpStorage.set(phone, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 mins expiry
      });
      console.log("✅ Memory Save Success");
    } catch (dbErr) {
      console.error("❌ MEMORY ERROR:", dbErr.message);
      throw new Error(`Memory error: ${dbErr.message}`);
    }

    // 3. SMS API Call (Try-Catch block taaki API fail hone par server na rukey)
    try {
      console.log("Calling SMS Cloud API...");

      const smsCloudUrl = process.env.SMS_CLOUD_URL || "https://app.smscloud.in/pushapi/sendbulkmsg";
      const smsMessage = `Dear customer, ${otp} is your login OTP. Valid for 5 minutes. Please do not share with anyone. Regards, CoverMantra`;
      const smsDestination = phone.length === 10 ? `91${phone}` : phone;

      // Note: Timeout 15s rakha hai kyunki SMS providers slow ho sakte hain
      const response = await axios.get(smsCloudUrl, {
        params: {
          username: process.env.SMS_CLOUD_USERNAME || "KESHVACREDIT",
          dest: smsDestination,
          apikey: process.env.SMS_CLOUD_API_KEY,
          signature: process.env.SMS_CLOUD_SIGNATURE || "CMTRA",
          msgtype: "PM",
          msgtxt: smsMessage,
          templateid: process.env.SMS_CLOUD_TEMPLATE_ID || "1707175922948829561",
        },
        timeout: 15000,
      });

      console.log("✅ SMS API Response:", response.data);
    } catch (axiosError) {
      // SMS fail hua toh sirf log karo, server crash mat karo
      console.error("⚠️ SMS API FAILED:", axiosError.message);

      // Testing ke liye hum response success hi bhejenge 
      // taaki aap 123456 daal kar login kar sakein
    }

    return res.status(200).json({
      success: true,
      message: "OTP process completed (Check terminal for SMS status)"
    });

  } catch (globalError) {
    console.error("🔥 CRITICAL SERVER ERROR:", globalError.stack);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
});


router.post("/verify-otp", authLimiter, async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ message: "Phone and OTP are required" });
  }

  if (process.env.ALLOW_TEST_BYPASS === "true" && phone === "9876543210" && otp === "123456") {
    if (req.body.source === 'app') {
      try {
        await webusername.findOneAndUpdate(
          { phone },
          { $set: { isAppUser: true } }
        );
      } catch (dbErr) {
        console.error("Error updating app user flag in verify-otp bypass:", dbErr.message);
      }
    }
    const token = generateToken({ phone });
    return res.json({ success: true, message: "OTP verified successfully (TEST BYPASS)", phone, token });
  }

  try {
    // Find OTP in Memory
    const storedOtpData = otpStorage.get(phone);

    if (!storedOtpData) {
      return res.status(400).json({ message: "No OTP sent to this number" });
    }

    // Check if OTP has expired
    if (Date.now() > storedOtpData.expiresAt) {
      otpStorage.delete(phone); // Clean up expired OTP
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Check if OTP matches
    if (otp !== storedOtpData.otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Delete OTP after successful verification
    otpStorage.delete(phone);

    // If source is 'app', set isAppUser to true and save fcmToken (if provided)
    if (req.body.source === 'app') {
      try {
        await webusername.findOneAndUpdate(
          { phone },
          { 
            $set: { 
              isAppUser: true,
              ...(req.body.fcmToken && { fcmToken: req.body.fcmToken })
            } 
          }
        );
      } catch (dbErr) {
        console.error("Error updating app user flag in verify-otp:", dbErr.message);
      }
    }

    const token = generateToken({ phone });
    return res.json({ success: true, message: "OTP verified successfully", phone, token });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({ message: "Server error during OTP verification" });
  }
});

router.post("/profile", authMiddleware, async (req, res) => {
  try {
    const phone = req.user.phone;


    if (!phone) {
      return res.status(400).json({
        status: 400,
        message: "Phone number is required.",
      });
    }

    const getUser = await webusername.findOne({ phone });

    // 4. Check if a user was found 
    if (!getUser) {
      return res.status(404).json({
        status: 404,
        message: "webusername not found.",
      });
    }

    // 5. Respond with the user data
    return res.status(200).json({
      status: 200,
      message: "webusername profile retrieved successfully.",
      user: getUser, // Key should be 'user' or 'data', not 'message'
    });
  } catch (error) {
    // 6. Handle any server/database errors
    console.error(error); // Log the error for debugging
    return res.status(500).json({
      status: 500,
      message: "An internal server error occurred.",
    });
  }
});


router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const phone = req.user.phone;

    if (!phone) {
      return res.status(400).json({
        status: 400,
        message: "Phone number is required.",
      });
    }

    const getUser = await webusername.findOne({ phone });

    if (!getUser) {
      return res.status(404).json({
        status: 404,
        message: "webusername not found.",
      });
    }

    return res.status(200).json({
      status: 200,
      message: "webusername profile retrieved successfully.",
      user: getUser,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "An internal server error occurred.",
    });
  }
});


router.post("/delete-profile", authMiddleware, async (req, res) => {
  try {
    const phone = req.user.phone;
    let { message, email, phone: bodyPhone } = req.body;

    // Sanitize inputs to prevent crashes
    email = typeof email === "string" ? email.trim() : "";
    message = typeof message === "string" ? message.trim() : "";
    bodyPhone = typeof bodyPhone === "string" ? bodyPhone.trim() : "";

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }
    const cleanPhone = (p) => p ? String(p).replace(/\D/g, "").slice(-10) : "";

    if (bodyPhone && cleanPhone(bodyPhone) !== cleanPhone(phone)) {
      return res.status(400).json({ message: "Phone number does not match your logged-in session" });
    }

    const deleteUser = await webusername.findOne({ phone });

    if (!deleteUser) {
      return res.status(404).json({ message: "User account not found in database" });
    }

    if (deleteUser.email.trim().toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ message: "Email address does not match your registered email" });
    }

    const deleteRequest = new DeleteRequest({
      phone: deleteUser.phone,
      email: email,
      message: message,
      status: "pending",
    });

    await deleteRequest.save();

    return res.status(200).json({
      message: "User account deletion request submitted successfully and is pending admin approval",
      deletedUser: deleteUser,
    });

  } catch (error) {
    console.error("Delete profile error:", error);
    return res.status(500).json({
      message: "Server error during account deletion"
    });
  }
});



router.put("/update-profile", authMiddleware, async (req, res) => {
  try {
    const phone = req.user.phone;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const allowedUpdates = ["name", "email", "city", "state", "gender", "employment", "income", "pincode", "dob", "pan"];
    const updateData = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update" });
    }

    const updatedUser = await webusername.findOneAndUpdate(
      { phone: phone },
      { $set: updateData },
      { new: true, runValidators: true },
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "webusername not found " });
    }

    return res
      .status(200)
      .json({ message: "webusername update sucessfully", updatedUser });
  } catch (error) {
    console.error("Update profile error:", error);
    return res
      .status(500)
      .json({ message: "Server error" });
  }
});

router.post("/filter-lenders", authMiddleware, async (req, res) => {
  try {
    const phone = req.user.phone;

    if (!phone) {
      return res.status(400).json({
        status: 400,
        message: "Phone number is required."
      });
    }

    // Fetch user from DB
    const getUser = await webusername.findOne({ phone });

    if (!getUser) {
      return res.status(404).json({
        status: 404,
        message: "webusername not found."
      });
    }

    // Extract values from user record
    const dob = getUser.dob;
    const userIncome = Number(getUser.income);
    const pincode = getUser.pincode;

    if (!dob || !userIncome || !pincode) {
      return res.status(400).json({
        status: 400,
        message: "webusername must have DOB, Income & Pincode saved."
      });
    }

    // Calculate Age
    const birthDate = new Date(dob);
    const ageDiff = Date.now() - birthDate.getTime();
    const userAge = new Date(ageDiff).getUTCFullYear() - 1970;

    // Fetch lenders from single source of truth
    const allLenders = await getStoredLenders();

    // Filter lenders
    const filtered = allLenders.filter((lender) => {
      const lenderAge = Number(lender.age);
      const pincodesArr = Array.isArray(lender.pincodes) ? lender.pincodes : [];
      const isBlacklisted = pincodesArr.some(p => typeof p === "string" && p.startsWith("!") && String(pincode).startsWith(p.slice(1)));
      const pincodeMatch = !isBlacklisted && (pincodesArr.includes("*") || pincodesArr.includes(String(pincode)));
      const activeMatch = lender.isActive !== false;

      return (
        activeMatch &&
        userAge >= lenderAge &&
        userIncome >= Number(lender.minIncome) &&
        pincodeMatch
      );
    });

    if (filtered.length === 0) {
      return res.status(200).json({
        eligible: false,
        yourAge: userAge,
        message: "No lenders available based on your criteria"
      });
    }

    const lendersInfo = filtered.map((l) => ({
      _id: l._id,
      name: l.name,
      logo: l.logo || "",
      UTM: l.UTM || "",
      applyLink: l.applyLink || l.UTM || "",
      loanAmount: l.loanAmount || "Up to ₹5,00,000",
      interestRate: l.interestRate || "Starting from 1.5% per month",
      processingFee: l.processingFee || "Starting from 2%",
      ratings: l.ratings || 4.5,
      features: l.features || [],
      requiredMinAge: l.age,
      requiredMinIncome: l.minIncome
    }));

    return res.status(200).json({
      eligible: true,
      yourAge: userAge,
      total: lendersInfo.length,
      lenders: lendersInfo
    });

  } catch (error) {
    console.error("Filter lenders error:", error);
    return res.status(500).json({
      status: 500,
      message: "An internal server error occurred.",
    });
  }
});



// router.post("/filter-lenders", (req, res) => {
//   const { age, pincode, income } = req.body;

//   if (!age || !pincode || !income) {
//     return res.status(400).json({ message: "Age, Pincode & Income are required" });
//   }

//   const userAge = Number(age);
//   const userIncome = Number(income);

//   if (isNaN(userAge) || isNaN(userIncome)) {
//     return res.status(400).json({ message: "Age and Income must be numbers" });
//   }

//   // Filter lenders based on lender age, minIncome, and pincode
//   const filtered = lenderList.filter((lender) => {
//     const lenderAge = Number(lender.age);
//     const pincodesArr = Array.isArray(lender.pincodes) ? lender.pincodes : [];

//     return (
//       userAge >= lenderAge &&           // user must be older or equal to lender age
//       userIncome >= lender.minIncome && // income check
//       pincodesArr.includes(String(pincode)) // pincode check
//     );
//   });

//   if (filtered.length === 0) {
//     return res.status(200).json({
//       eligible: false,
//       message: "No lenders available based on your criteria"
//     });
//   }

//   // Include lender name + age
//   const lendersInfo = filtered.map((l) => ({
//     name: l.name,
//     UTM: l.UTM
//   }));

//   return res.status(200).json({
//     eligible: true,
//     total: lendersInfo.length,
//     lenders: lendersInfo
//   });
// });




router.post("/contact-us", contactLimiter, async (req, res) => {
  let { name, email, message, phone } = req.body;

  // Trim inputs and convert email to lowercase
  name = typeof name === "string" ? name.trim() : "";
  email = typeof email === "string" ? email.trim().toLowerCase() : "";
  phone = typeof phone === "string" ? phone.trim() : "";
  message = typeof message === "string" ? message.trim() : "";

  // Check mandatory fields
  if (!name || !email || !phone || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Name validation
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ message: "Name must be between 2 and 100 characters" });
  }

  // Email validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  // Phone validation (Indian mobile number starting with 6-9 and exactly 10 digits)
  if (!isValidMobileNumber(phone)) {
    return res.status(400).json({ message: "Invalid phone number. Must be a 10-digit Indian mobile number." });
  }

  // Message validation
  if (message.length < 10 || message.length > 1000) {
    return res.status(400).json({ message: "Message must be between 10 and 1000 characters" });
  }

  try {
    const newContact = new Contact({
      name,
      contactEmail: email,
      contactPhone: phone,
      message
    });
    await newContact.save();

    res.status(200).json({ message: "Request received successfully" });
  } catch (err) {
    console.error("❌ Error saving contact:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});



module.exports = router;
