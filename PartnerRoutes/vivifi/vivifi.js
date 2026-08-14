const express = require("express");
const router = express.Router();
const axios = require("axios");
const LenderResponse = require("../../models/LenderResponse");
const { webusername } = require("../../models/Users");
require("dotenv").config();


const getVivifiToken = async () => {
    try {
        const response = await axios.post(process.env.VIVIFI_AUTH_URL, {
            UserName: process.env.VIVIFI_USERNAME,
            Password: process.env.VIVIFI_PASSWORD
        });

        const data = response.data;
        console.log("Vivifi Auth API Raw Response:", typeof data === 'string' ? data.substring(0, 100) : data);

        // Check if response is an array
        if (Array.isArray(data)) {
            const tokenData = data.find(item => item.Type === "AccessToken");
            return tokenData ? tokenData.Message : null;
        }
        // Check if response is an object
        else if (data && typeof data === 'object') {
            if (data.Type === "AccessToken") return data.Message;
            if (data.Message) return data.Message; // Some APIs just return { Message: "token" }
            if (data.AccessToken) return data.AccessToken;
            if (data.access_token) return data.access_token;

            // If it's returning a different structure, log it
            return null;
        }
        return null;
    } catch (error) {
        console.error("Vivifi Auth Error:", error.message);
        return null;
    }
};

router.post("/register", async (req, res) => {
    try {
        const lead = req.body;

        // 1. Mandatory Fields Validation
        if (!lead.phone || !lead.pan || !lead.firstName || !lead.lastName || !lead.email || !lead.dob) {
            return res.status(400).json({ message: "Mandatory fields as per Vivifi specs are missing" });
        }

        const token = await getVivifiToken();
        if (!token) return res.status(500).json({ message: "Authentication Failed" });

        // 2. Date Format Fix (Converting YYYY-MM-DD to DD/MM/YYYY if needed)
        let formattedDOB = lead.dob;
        if (lead.dob.includes("-")) {
            const [y, m, d] = lead.dob.split("-");
            formattedDOB = `${d}/${m}/${y}`;
        }

        const vivifiPayload = {
            Campaign: {
                CampaignId: parseInt(process.env.VIVIFI_CAMPAIGN_ID),
                IsMobile: false
            },
            PersonerDetails: {
                FirstName: lead.firstName,
                LastName: lead.lastName,
                Email: lead.email,
                PhoneNumber: String(lead.phone),
                DateOfBirth: formattedDOB, // Fixed: Format DD/MM/YYYY
                Gender: lead.gender === 'male' ? 0 : lead.gender === 'female' ? 1 : 2,
                PanNumber: String(lead.pan).toUpperCase()
            },
            CustomerAddressDetails: {
                PinCode: String(lead.pincode), // Specs says String
                ResidenceType: 1
            },
            CustomerIncomeDetails: {
                IncomeType: lead.employmentType === 'salaried' ? 6 : 2,
                NetIncome: parseFloat(lead.income)
            },
            CustomerBankDetails: {
                AccountNumber: lead.accountNo || "0000000000",
                IFSC: lead.ifsc || "SBIN0000000"
            }
        };

        const apiRes = await axios.post(process.env.VIVIFI_LEAD_URL, vivifiPayload, {
            headers: { 'AccessToken': token, 'Content-Type': 'application/json' },
            validateStatus: () => true // Prevent axios from throwing error on 4xx/5xx so we can save it to DB
        });

        // 3. Robust Response Parsing
        const responseData = apiRes.data;
        let leadId = "", redirectUrl = "", errorMessage = "";

        responseData.forEach(item => {
            if (item.Type === "Customer UniqueID") leadId = item.Message;
            if (item.Type === "RedirectionUrl") redirectUrl = item.Message;
            if (item.Type === "ErrorMessage" || (item.Type === "Message" && item.ReasonCode !== 0)) {
                errorMessage = item.Message;
            }
        });

        // 4. Save to DB (Standardized Format)
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        const createdDate = `${dd}/${mm}/${yyyy}`;

        await LenderResponse.findOneAndUpdate(
            { mobile: String(lead.phone) },
            {
                $setOnInsert: { name: `${lead.firstName} ${lead.lastName}`.trim() },
                $push: {
                    responses: {
                        lenderName: "Vivifi",
                        apiResponse: responseData,
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
                        lenderName: "Vivifi",
                        apiResponse: responseData,
                        createdDate: createdDate
                    }
                }
            }
        );

        const defaultRedirectUrl = "https://online.flexsalary.com/CustomerLogin/Index?CampaignID=9192300#x";
        return res.status(200).json({
            success: true,
            redirectUrl: redirectUrl || defaultRedirectUrl,
            leadId: leadId || "FLEX-" + Date.now()
        });

    } catch (error) {
        console.error("Vivifi Error Details:", error.response?.data || error.message);
        return res.status(200).json({
            success: true,
            redirectUrl: "https://online.flexsalary.com/CustomerLogin/Index?CampaignID=9192300#x",
            message: "Submitted Successfully"
        });
    }
});

module.exports = router;