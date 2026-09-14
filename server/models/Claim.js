const mongoose = require("mongoose");

const claimSchema = new mongoose.Schema({

    item: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Item",
        required: true
    },

    claimant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    proof: {
        type: String,
        required: true
    },

    proofImages: [
        {
            type: String
        }
    ],

    status: {
        type: String,
        enum: [
            "PENDING",
            "APPROVED",
            "REJECTED"
        ],
        default: "PENDING"
    },

    adminRemarks: {
        type: String,
        default: ""
    },

    // ── Structured Proof Identifiers ─────────────────────────────────────
    structuredDetails: {
        serialOrImei: { type: String, default: "" },
        lockscreenOrWallpaper: { type: String, default: "" },
        brandOrModel: { type: String, default: "" },
        colorOrPattern: { type: String, default: "" },
        uniqueMarksOrScratches: { type: String, default: "" },
        contentsList: { type: String, default: "" },
        idNumberMasked: { type: String, default: "" },
        holderNameOnCard: { type: String, default: "" },
        issuingAuthority: { type: String, default: "" },
        approximateWeightOrSize: { type: String, default: "" },
        additionalNotes: { type: String, default: "" }
    },

    // ── QR Code Automated Handover ───────────────────────────────────────
    handoverMethod: {
        type: String,
        enum: ["DIRECT_STUDENT", "DEPARTMENT_ADMIN", "NONE"],
        default: "NONE"
    },

    qrCodeToken: {
        type: String,
        default: null
    },

    qrCodeExpiresAt: {
        type: Date,
        default: null
    },

    handoverCompletedAt: {
        type: Date,
        default: null
    },

    handoverScannedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    }

},{
    timestamps:true
});

module.exports =
mongoose.model("Claim",claimSchema);