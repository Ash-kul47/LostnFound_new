const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
{
    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },

    password: {
        type: String,
        default: null
    },

    role: {
        type: String,
        enum: ["STUDENT", "ADMIN", "SUPER_ADMIN"],
        default: "STUDENT"
    },

    department: {
        type: String
    },

    year: {
        type: Number
    },

    authProvider: {
        type: String,
        enum: ["LOCAL", "GOOGLE"],
        default: "LOCAL"
    },

    googleId: {
        type: String,
        default: null
    },

    isVerified: {
        type: Boolean,
        default: false
    },

    verificationToken: {
        type: String,
        default: null
    },

    verificationTokenExpiry: {
        type: Date,
        default: null
    }
},
{
    timestamps: true
}
);

module.exports = mongoose.model("User", userSchema);