const mongoose = require('mongoose');

// Main User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true, index: true }, // Added Index here for Phase 1
    pan: { type: String, required: true },
    dob: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    gender: { type: String, required: true },
    employment: { type: String, required: true },
    income: { type: String, required: true },
    pincode: { type: String, required: true },
    lenderResponses: [{
        lenderName: { type: String }
    }],
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    // App and Tracking fields
    source: { type: String, enum: ['web', 'app'], default: 'web' },
    isAppUser: { type: Boolean, default: false },
    fcmToken: { type: String },
    // Loan Status fields
    loanStatus: { type: String, enum: ['applied', 'approved', 'rejected', 'disbursed', 'none'], default: 'none' },
    loanAmount: { type: Number },
    loanDisbursedDate: { type: Date },
    followedUp: { type: Boolean, default: false },
    consent: { type: Boolean, default: true },
    consentMessage: { type: String }
}, { timestamps: true });

// Delete Request Schema (Recommended: Different Collection)
const deleteRefSchema = new mongoose.Schema({ 
    phone: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, { timestamps: true });

// ✅ Unified User model targeting the 'users' collection
const User = mongoose.model('User', userSchema, 'users');

// ✅ Alag collection for delete requests (taaki user data corrupt na ho)
const DeleteRequest = mongoose.model('DeleteAcc', deleteRefSchema, 'account_deletion');

module.exports = {
    User,
    webusername: User, // Export for backward compatibility with existing codebase
    DeleteRequest
};