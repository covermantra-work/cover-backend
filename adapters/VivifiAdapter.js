const BaseAdapter = require("./BaseAdapter");
const axios = require("axios");

class VivifiAdapter extends BaseAdapter {
  getFormConfig() {
    return {
      title: "FlexSalary (Vivifi)",
      logo: "https://www.vivifin.com/images/vivifi-logo.png",
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
            { label: "Salaried", value: "salaried" },
            { label: "Self-Employed", value: "self-employed" }
          ]
        },
        {
          name: "gender",
          label: "Gender",
          type: "select",
          required: true,
          options: [
            { label: "Male", value: "male" },
            { label: "Female", value: "female" }
          ]
        }
      ],
      consentText: "I certify that the information provided is accurate and I authorize CoverMantra to process my Vivifi credit application.",
      redirectUrlOnSuccess: "https://online.flexsalary.com/CustomerLogin/Index?CampaignID=9192300#x"
    };
  }

  async getVivifiToken() {
    try {
      const response = await axios.post(process.env.VIVIFI_AUTH_URL, {
        UserName: process.env.VIVIFI_USERNAME,
        Password: process.env.VIVIFI_PASSWORD
      });
      
      const data = response.data;
      if (Array.isArray(data)) {
        const tokenData = data.find(item => item.Type === "AccessToken");
        return tokenData ? tokenData.Message : null;
      } else if (data && typeof data === 'object') {
        if (data.Type === "AccessToken") return data.Message;
        if (data.Message) return data.Message;
        if (data.AccessToken) return data.AccessToken;
        if (data.access_token) return data.access_token;
      }
      return null;
    } catch (error) {
      console.error("Vivifi Auth Error:", error.message);
      return null;
    }
  }

  async register(lead) {
    const token = await this.getVivifiToken();
    if (!token) throw new Error("Vivifi Authentication Failed");

    let formattedDOB = lead.dob;
    if (lead.dob && lead.dob.includes("-")) {
      const [y, m, d] = lead.dob.split("-");
      formattedDOB = `${d}/${m}/${y}`;
    }

    const firstName = lead.first_name || lead.name?.split(" ")[0] || "First";
    const lastName = lead.last_name || lead.name?.split(" ").slice(1).join(" ") || "Last";

    const vivifiPayload = {
      Campaign: { 
        CampaignId: parseInt(process.env.VIVIFI_CAMPAIGN_ID), 
        IsMobile: false 
      },
      PersonerDetails: {
        FirstName: firstName,
        LastName: lastName,
        Email: lead.email,
        PhoneNumber: String(lead.phone),
        DateOfBirth: formattedDOB,
        Gender: lead.gender === 'male' ? 0 : lead.gender === 'female' ? 1 : 2,
        PanNumber: String(lead.pan).toUpperCase()
      },
      CustomerAddressDetails: { 
        PinCode: String(lead.pincode),
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
      validateStatus: () => true
    });

    const responseData = apiRes.data;
    let leadId = "";
    let redirectUrl = "";
    let errorMessage = "";

    if (Array.isArray(responseData)) {
      responseData.forEach(item => {
        if (item.Type === "Customer UniqueID") leadId = item.Message;
        if (item.Type === "RedirectionUrl") redirectUrl = item.Message;
        if (item.Type === "ErrorMessage" || (item.Type === "Message" && item.ReasonCode !== 0)) {
          errorMessage = item.Message;
        }
      });
    }

    const defaultUrl = "https://online.flexsalary.com/CustomerLogin/Index?CampaignID=9192300#x";
    return {
      success: true,
      redirectUrl: redirectUrl || defaultUrl,
      offer: leadId ? `Lead ID: ${leadId}` : "Pre-Approved",
      apiResponse: responseData
    };
  }
}

module.exports = VivifiAdapter;
