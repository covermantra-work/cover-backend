const express = require('express');
const router = express.Router();
const axios = require("axios");
const LenderResponse = require("../../models/LenderResponse");
const { webusername } = require("../../models/Users");
require("dotenv").config();

const domain = process.env.FATAKPAY_DOMAIN;

//udpate

function isValidPAN(pan) {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(pan);
}

async function get_token() {
    try {
        const data = {
            username: process.env.FATAKPAY_USERNAME,
            password: process.env.FATAKPAY_PASSWORD,
        };
        const apires = await axios.post(`${domain}/create-user-token`, data);
        return apires.data?.data?.token; 
    } catch (error) {
        console.error("Error fetching token:", error.response?.data || error.message);
        throw new Error("Failed to fetch token");
    }

}


async function get_token_dcl() {
    try {
        const data = {
            username: process.env.FATAKPAY_USERNAME_DCL,
            password: process.env.FATAKPAY_PASSWORD_DCL,
        };
        const apires = await axios.post(`${domain}/create-user-token`, data);
        return apires.data?.data?.token; 
    } catch (error) {
        console.error("Error fetching token:", error.response?.data || error.message);
        throw new Error("Failed to fetch token");
    }
}

router.post("/register/Pl", async (req, res) => {
    try {
        const {
            mobile,
            first_name,
            last_name,
            dob,
            email,
            employment_type_id,
            pan,
            pincode,
            consent_timestamp,
            consent
        } = req.body;

        if (!pan || !mobile || !first_name || !last_name || !dob || !email || !employment_type_id || !pincode||!consent_timestamp) {
            return res.status(400).json({ message: "All fields are required" });
        }
        if(!isValidPAN(pan)){
            return  res.status(409).json({message:"Pan is not valid"})
        }

        const token = await get_token();
        if (!token) {
            return res.status(500).json({ message: "Token not received" });
        }
        
        const userData = {
            mobile,
            first_name,
            last_name,
            pan,
            dob,
            pan,
            email,
            employment_type_id,
            pincode,
            partnerId: "Covermantra",
            consent,
            consent_timestamp
        };


        const apiFatakpay = await axios.post(
            `${domain}/emi-insurance-eligibility`,
            userData,
            { headers: { Authorization: `Token ${token}` } }
        );

        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        const createdDate = `${dd}/${mm}/${yyyy}`;

        await LenderResponse.findOneAndUpdate(
            { mobile: String(mobile) },
            { 
                $setOnInsert: { name: `${first_name} ${last_name}`.trim() },
                $push: { 
                    responses: {
                        lenderName: "FATAKPAY Loans",
                        apiResponse: apiFatakpay.data,
                        createdDate: createdDate
                    } 
                }
            },
            { upsert: true, new: true }
        );

        // ✅ Also push to the main webuser collection
        await webusername.findOneAndUpdate(
            { phone: String(mobile) },
            {
                $push: {
                    lenderResponses: {
                        lenderName: "FATAKPAY Loans",
                        apiResponse: apiFatakpay.data,
                        createdDate: createdDate
                    }
                }
            }
        );

        const redirectUrl = "https://web.fatakpay.com/authentication/login?utm_source=651_TT83W&utm_medium=covermantra";
        return res.status(200).json({
            success: true,
            redirectUrl,
            status: apiFatakpay.status,
            data: apiFatakpay.data
        });

    } catch (err) {
        console.error("Error:", err.response?.data || err.message);
        return res.status(200).json({
            success: true,
            redirectUrl: "https://web.fatakpay.com/authentication/login?utm_source=651_TT83W&utm_medium=covermantra",
            message: "Submitted Successfully"
        });
    }
});

//not for production
// router.get('/getall', async (req, res) => {
//   try {
//     const users = await FatakPayUser.find();
//     res.status(200).json(users);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });



router.post("/register/dcl", async (req, res) => {
    try {
        const {
            mobile,
            first_name,
            last_name,
            dob,
            email,
            employment_type_id,
            pan,
            pincode,
            consent_timestamp,
            consent
        } = req.body;

        if (!pan || !mobile || !first_name || !last_name || !dob || !email || !employment_type_id || !pincode||!consent_timestamp) {
            return res.status(400).json({ message: "All fields are required" });
        }
        if(!isValidPAN(pan)){
            return  res.status(409).json({message:"Pan is not valid"})
        }

        const token = await get_token_dcl();
        if (!token) {
            return res.status(500).json({ message: "Token not received" });
        }
        
        const userData = {
            mobile,
            first_name,
            last_name,
            pan,
            dob,
            pan,
            email,
            employment_type_id,
            pincode,
            partnerId: "Covermantra",
            consent,
            consent_timestamp
        };


        const apiFatakpay = await axios.post(
            `${domain}/emi-insurance-eligibility`,
            userData,
            { headers: { Authorization: `Token ${token}` } }
        );

        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        const createdDate = `${dd}/${mm}/${yyyy}`;

        await LenderResponse.findOneAndUpdate(
            { mobile: String(mobile) },
            { 
                $setOnInsert: { name: `${first_name} ${last_name}`.trim() },
                $push: { 
                    responses: {
                        lenderName: "FATAKPAY Loans",
                        apiResponse: apiFatakpay.data,
                        createdDate: createdDate
                    } 
                }
            },
            { upsert: true, new: true }
        );

        // ✅ Also push to the main webuser collection
        await webusername.findOneAndUpdate(
            { phone: String(mobile) },
            {
                $push: {
                    lenderResponses: {
                        lenderName: "FATAKPAY Loans",
                        apiResponse: apiFatakpay.data,
                        createdDate: createdDate
                    }
                }
            }
        );

        const redirectUrl = "https://web.fatakpay.com/authentication/login?utm_source=651_TT83W&utm_medium=covermantra";
        return res.status(200).json({
            success: true,
            redirectUrl,
            status: apiFatakpay.status,
            data: apiFatakpay.data
        });

    } catch (err) {
        console.error("Error:", err.response?.data || err.message);
        return res.status(200).json({
            success: true,
            redirectUrl: "https://web.fatakpay.com/authentication/login?utm_source=651_TT83W&utm_medium=covermantra",
            message: "Submitted Successfully"
        });
    }
});

module.exports = router;
