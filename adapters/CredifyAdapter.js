const BaseAdapter = require("./BaseAdapter");
const axios = require("axios");

class CredifyAdapter extends BaseAdapter {
  getFormConfig() {
    return {
      title: "CREDIFY LOAN",
      logo: "https://loan.credittnow.com/favicon.ico", // Fallback logo or URL
      fields: [
        { name: "phone", label: "Mobile Number", type: "tel", placeholder: "Enter phone", required: true, pattern: "^[6-9]\\d{9}$" },
        { name: "name", label: "Full Name", type: "text", placeholder: "As per PAN", required: true },
        { name: "dob", label: "Date of Birth", type: "date", required: true },
        { name: "email", label: "Email Address", type: "email", placeholder: "email@example.com", required: true },
        { name: "pan", label: "PAN Card", type: "text", placeholder: "ABCDE1234F", required: true, pattern: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$", uppercase: true },
        { name: "salary", label: "Monthly Income", type: "number", placeholder: "e.g. 25000", required: true },
        { name: "pincode", label: "Pincode", type: "text", placeholder: "6-digit Pincode", required: true, pattern: "^\\d{6}$" },
        { name: "city", label: "City", type: "text", placeholder: "City Name", required: true },
        { name: "address", label: "Address", type: "text", placeholder: "Full Address", required: true },
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
      consentText: "Note: Minimum CIBIL score of 680 is required for salary >= ₹30,000, and 720 for salary between ₹20,000 and ₹30,000. I authorize CoverMantra to share my details with Credify for loan eligibility check.",
      redirectUrlOnSuccess: "https://loan.credittnow.com/auth/login?utm_source=cover_mantra&utm_medium=website&utm_campaign=loan_campaign"
    };
  }

  async register(lead) {
    const defaultRedirectUrl = process.env.CREDIFY_REDIRECT_URL || "https://loan.credittnow.com/auth/login?utm_source=cover_mantra&utm_medium=website&utm_campaign=loan_campaign";
    const agencyId = process.env.CREDIFY_AGENCY_ID || "cover_mantra";
    const baseUrl = process.env.CREDIFY_INGEST_URL || "https://agency.ctpl.live/lead/ingest";
    const ingestUrl = `${baseUrl}/${agencyId}`;

    // Map fields to Credify's expected API payload
    const customerName = lead.name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
    const payload = {
      phoneNumber: String(lead.phone || lead.mobile || ""),
      panNumber: lead.pan ? String(lead.pan).toUpperCase() : undefined,
      data: {
        email: lead.email || "",
        customer_name: customerName,
        dob: lead.dob || "",
        emp_type: lead.employmentType ? String(lead.employmentType).toLowerCase() : "organic",
        salary: String(lead.salary || lead.income || "0"),
        addresss: lead.address || lead.addresss || "",
        city: lead.city || "",
        pincode: String(lead.pincode || "")
      }
    };

    try {
      console.log(`[CredifyAdapter] Sending lead to ${ingestUrl} with payload:`, JSON.stringify(payload, null, 2));
      
      const response = await axios.post(
        ingestUrl,
        payload,
        {
          headers: {
            "Content-Type": "application/json"
          },
          validateStatus: () => true // Allow handling non-200 responses inside adapter
        }
      );

      const apiResponse = response.data;
      console.log(`[CredifyAdapter] Credify API response:`, JSON.stringify(apiResponse, null, 2));

      // Credify response: { "status": true/false, "message": "SUCCESS" | "DUPLICATE", "data": ... }
      const isSuccess = apiResponse && (apiResponse.status === true || apiResponse.message === "SUCCESS");
      
      // Determine user offer from response details if available
      const offer = apiResponse && apiResponse.data && apiResponse.data.LOAN_STATUS !== "NO_LOAN"
        ? apiResponse.data.LOAN_STATUS
        : "Pre-Approved";

      return {
        success: isSuccess,
        redirectUrl: defaultRedirectUrl,
        offer: offer,
        apiResponse: apiResponse || { message: "No response body received" }
      };

    } catch (err) {
      console.error("[CredifyAdapter] Ingestion request failed:", err.message);
      return {
        success: false,
        redirectUrl: defaultRedirectUrl,
        offer: "Pre-Approved",
        apiResponse: { error: err.response?.data || err.message }
      };
    }
  }
}

module.exports = CredifyAdapter;
