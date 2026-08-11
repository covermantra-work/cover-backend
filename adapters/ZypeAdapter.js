const BaseAdapter = require("./BaseAdapter");
const axios = require("axios");

function maskMobile(mobile) {
  if (!mobile) return "";
  const digits = String(mobile).replace(/\D/g, "");
  if (digits.length !== 10) return digits; // fallback
  return "xxx" + digits.slice(3);
}

class ZypeAdapter extends BaseAdapter {
  getFormConfig() {
    return {
      title: "ZYPE LOAN",
      logo: "https://www.getzype.com/wp-content/uploads/2024/09/Zype_svg_black.svg",
      fields: [
        { name: "phone", label: "Mobile Number", type: "tel", placeholder: "Enter phone", required: true, pattern: "^[6-9]\\d{9}$" },
        { name: "name", label: "Full Name", type: "text", placeholder: "As per PAN", required: true },
        { name: "dob", label: "Date of Birth", type: "date", required: true },
        { name: "email", label: "Email Address", type: "email", placeholder: "email@example.com", required: true },
        { name: "pan", label: "PAN Card", type: "text", placeholder: "ABCDE1234F", required: true, pattern: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$", uppercase: true },
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
      consentText: "I certify that the information provided is accurate and I authorize CoverMantra to process my Zype credit application.",
      redirectUrlOnSuccess: "https://zype.onelink.me/vx8a?af_xp=custom&pid=CustomerSource&af_dp=com.zype.mobile%3A%2F%2F&deep_link_value=myZype&af_click_lookback=30d&c=Spiraea"
    };
  }

  async register(lead) {
    let deduperesponse = null;
    let apires = null;

    const dedupeMobile = maskMobile(lead.phone);
    const dedupePayload = {
      mobileNumber: dedupeMobile,
      panNumber: lead.pan,
      partnerId: process.env.ZYPE_PARTNER_ID,
    };

    // Call Dedupe API
    try {
      const eligibilityUrl = process.env.ZYPE_ELIGIBILITY_URL || "https://prod.zype.co.in/attribution-service/api/v1/underwriting/customerEligibility";
      const dedupeRes = await axios.post(
        eligibilityUrl,
        dedupePayload,
        { headers: { "Content-Type": "application/json" } }
      );
      deduperesponse = dedupeRes.data;
    } catch (err) {
      deduperesponse = { error: err.response?.data || err.message };
    }

    const payloadrequest = {
      mobileNumber: String(lead.phone),
      email: lead.email,
      dob: lead.dob,
      panNumber: String(lead.pan),
      name: lead.name,
      income: Number(lead.income),
      employmentType: lead.employmentType?.toLowerCase() === "self-employed" ? "self-employed" : "salaried",
      partnerId: process.env.ZYPE_PARTNER_ID,
      bureauType: 3,
    };

    // Call PreApproval API
    try {
      const preapprovalUrl = process.env.ZYPE_PREAPPROVAL_URL || "https://prod.zype.co.in/attribution-service/api/v1/underwriting/preApprovalOffer";
      const apiRes = await axios.post(
        preapprovalUrl,
        payloadrequest,
        { headers: { "Content-Type": "application/json" } }
      );
      apires = apiRes.data;
    } catch (err) {
      apires = { error: err.response?.data || err.message };
    }

    const totalResponse = {
      deduperesponse,
      apires,
    };

    const isAccepted = deduperesponse?.status === "ACCEPT" && apires?.status === "ACCEPT";
    const offer = apires?.offer || null;

    const zypeUrl = "https://zype.onelink.me/vx8a?af_xp=custom&pid=CustomerSource&af_dp=com.zype.mobile%3A%2F%2F&deep_link_value=myZype&af_click_lookback=30d&c=Spiraea";
    return {
      success: true,
      redirectUrl: zypeUrl,
      offer: offer ? `₹${offer}` : "Pre-Approved",
      apiResponse: totalResponse
    };
  }
}

module.exports = ZypeAdapter;
