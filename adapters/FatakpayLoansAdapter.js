const BaseAdapter = require("./BaseAdapter");
const axios = require("axios");

class FatakpayLoansAdapter extends BaseAdapter {
  getFormConfig() {
    return {
      title: "FATAKPAY Loans",
      logo: "https://www.fdplfinance.com/assets/images/logo/FatakLoans.svg",
      fields: [
        { name: "phone", label: "Mobile Number", type: "tel", placeholder: "Enter phone", required: true, pattern: "^[6-9]\\d{9}$" },
        { name: "first_name", label: "First Name", type: "text", placeholder: "First Name", required: true },
        { name: "last_name", label: "Last Name", type: "text", placeholder: "Last Name", required: true },
        { name: "dob", label: "Date of Birth", type: "date", required: true },
        { name: "email", label: "Email Address", type: "email", placeholder: "email@example.com", required: true },
        { name: "pan", label: "PAN Card", type: "text", placeholder: "ABCDE1234F", required: true, pattern: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$", uppercase: true },
        { name: "pincode", label: "Pincode", type: "text", placeholder: "Pincode", required: true },
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
      consentText: "I authorize CoverMantra to share my details with FatakPay for loan eligibility check.",
      redirectUrlOnSuccess: "https://web.fatakpay.com/authentication/login?utm_source=651_TT83W&utm_medium=covermantra"
    };
  }

  async get_token() {
    const domain = process.env.FATAKPAY_DOMAIN;
    const data = {
      username: process.env.FATAKPAY_USERNAME,
      password: process.env.FATAKPAY_PASSWORD,
    };
    const apires = await axios.post(`${domain}/create-user-token`, data);
    return apires.data?.data?.token;
  }

  async register(lead) {
    const fatakUrl = "https://web.fatakpay.com/authentication/login?utm_source=651_TT83W&utm_medium=covermantra";
    try {
      const domain = process.env.FATAKPAY_DOMAIN;
      const token = await this.get_token();

      let apiResponse = null;
      if (token && domain) {
        const userData = {
          mobile: String(lead.phone || lead.mobile),
          first_name: lead.first_name || lead.name?.split(" ")[0] || "First",
          last_name: lead.last_name || lead.name?.split(" ").slice(1).join(" ") || "Last",
          pan: lead.pan?.toUpperCase(),
          dob: lead.dob,
          email: lead.email,
          employment_type_id: lead.employmentType || "Salaried",
          pincode: String(lead.pincode),
          partnerId: "Covermantra",
          consent: true,
          consent_timestamp: new Date().toISOString().slice(0, 19).replace("T", " ")
        };

        const apiFatakpay = await axios.post(
          `${domain}/emi-insurance-eligibility`,
          userData,
          { headers: { Authorization: `Token ${token}` }, validateStatus: () => true }
        );
        apiResponse = apiFatakpay.data;
      }

      return {
        success: true,
        redirectUrl: fatakUrl,
        offer: "Pre-Approved",
        apiResponse: apiResponse || { message: "Success" }
      };
    } catch (err) {
      console.error("FatakPay register error:", err.message);
      return {
        success: true,
        redirectUrl: fatakUrl,
        offer: "Pre-Approved",
        apiResponse: { message: "Success" }
      };
    }
  }
}

module.exports = FatakpayLoansAdapter;
