const mongoose = require("mongoose");

const LenderResponseSchema = new mongoose.Schema({
    name: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    responses: [{
        lenderName: { type: String, required: true },
        apiResponse: { type: mongoose.Schema.Types.Mixed },
        createdDate: { type: String, required: true }
    }]
});

module.exports = mongoose.model("LenderResponse", LenderResponseSchema, "lenders_responses");
