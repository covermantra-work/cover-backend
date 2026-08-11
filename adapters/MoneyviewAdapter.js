const BaseAdapter = require("./BaseAdapter");
const axios = require("axios");

class MoneyviewAdapter extends BaseAdapter {
  getFormConfig() {
    return {
      title: "MoneyView Application",
      logo: "https://moneyview.in/images/mv-green-logo-v3Compressed.svg",
      fields: [
        { name: "phone", label: "Mobile Number", type: "tel", placeholder: "Enter phone", required: true, pattern: "^[6-9]\\d{9}$" },
        { name: "first_name", label: "First Name", type: "text", placeholder: "First Name", required: true },
        { name: "last_name", label: "Last Name", type: "text", placeholder: "Last Name", required: true },
        { name: "dob", label: "Date of Birth", type: "date", required: true },
        { name: "email", label: "Email Address", type: "email", placeholder: "email@example.com", required: true },
        { name: "pan", label: "PAN Card", type: "text", placeholder: "ABCDE1234F", required: true, pattern: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$", uppercase: true },
        { name: "pincode", label: "Pincode", type: "text", placeholder: "Pincode", required: true },
        { name: "income", label: "Monthly Income", type: "number", placeholder: "e.g. 25000", required: true },
        {
          name: "employmentType",
          label: "Employment Type",
          type: "select",
          required: true,
          options: [
            { label: "Salaried", value: "Salaried" },
            { label: "Self-Employed", value: "Self-Employed" }
          ]
        }
      ],
      consentText: "I consent to provide my details and authorize CoverMantra to process my MoneyView credit application.",
      redirectUrlOnSuccess: "https://moneyview.in/"
    };
  }

  async getToken() {
    const domain = process.env.MONEYVIEW_DOMAIN;
    const data = {
      userName: process.env.MONEYVIEW_USERNAME,
      password: process.env.MONEYVIEW_PASSWORD,
      partnerCode: process.env.MONEYVIEW_CODE,
    };
    const tokenResponse = await axios.post(`${domain}/token`, data);
    return tokenResponse.data.token;
  }

  async register(lead) {
    const domain = process.env.MONEYVIEW_DOMAIN;
    const token = await this.getToken();

    const name = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.name;

    const requestBody = {
      partnerCode: 453,
      partnerRef: "Covermantra",
      name: name,
      gender: lead.gender?.toLowerCase() || "male",
      phone: String(lead.phone),
      pan: lead.pan?.trim().toUpperCase(),
      dateOfBirth: lead.dob,
      bureauPermission: true,
      employmentType: lead.employmentType === "Self-Employed" ? "Self Employed" : lead.employmentType,
      incomeMode: "Online",
      declaredIncome: lead.income ? parseInt(lead.income, 10) : undefined,
      educationLevel: "Graduation",
      maritalStatus: "Married",
      addressList: [
        {
          addressLine1: lead.address?.trim() || "Current Address",
          pincode: String(lead.pincode),
          residenceType: "Rented",
          addressType: "Current",
          city: lead.city || "City",
          state: lead.state || "State",
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
        consentDecision: true,
        deviceTimeStamp: lead.consent_timestamp || new Date().toISOString(),
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

    // Dedupe
    const dedupeBody = {
      email: lead.email,
      phone: lead.phone,
      pan: lead.pan,
    };

    let dedupeCheck;
    try {
      dedupeCheck = await axios.post(`${domain}/lead/dedupe`, dedupeBody, {
        headers: { token },
      });
    } catch (e) {
      dedupeCheck = { data: { error: e.response?.data || e.message } };
    }

    // Lead submission
    const leadRes = await axios.post(`${domain}/lead`, requestBody, {
      headers: { "Content-Type": "application/json", token },
    });

    const leadId = leadRes.data?.leadId;

    let offersRes = { data: null };
    let journeyRes = { data: null };
    let statusRes = { data: null };

    if (leadId) {
      try {
        offersRes = await axios.get(`${domain}/offers/${leadId}`, { headers: { token } });
      } catch (e) {}
      try {
        journeyRes = await axios.get(`${domain}/journey-url/${leadId}`, { headers: { token } });
      } catch (e) {}
      try {
        statusRes = await axios.get(`${domain}/lead/status/${leadId}`, { headers: { token } });
      } catch (e) {}
    }

    const totalResponse = {
      leadSubmission: leadRes?.data || null,
      offers: offersRes?.data || null,
      journey: journeyRes?.data || null,
      statusRes: statusRes?.data || null,
    };

    const isRejected =
      leadRes.data?.status === "reject" ||
      offersRes.data?.status === "reject" ||
      journeyRes.data?.status === "reject";

    const isSuccess =
      leadRes.data?.status === "success" &&
      offersRes.data?.status === "success" &&
      journeyRes.data?.url;

    const defaultMvUrl = "https://moneyview.in/personal-loan?utm_source=covermantra";
    return {
      success: true,
      redirectUrl: journeyRes.data?.url || this.getFormConfig().redirectUrlOnSuccess || defaultMvUrl,
      offer: offersRes.data?.offerAmount ? `₹${offersRes.data.offerAmount}` : "Pre-Approved",
      apiResponse: totalResponse
    };
  }
}

module.exports = MoneyviewAdapter;
