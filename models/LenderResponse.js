const mongoose = require("mongoose");

const LenderResponseSchema = new mongoose.Schema({
    name: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    responses: [{
        lenderName: { type: String, required: true },
        pincode: { type: String },
        redirectUrl: { type: String },
        appliedAt: { type: Date, default: Date.now }
    }]
});

module.exports = mongoose.model("LenderResponse", LenderResponseSchema, "lenders_responses");
