const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const Claim = require("../models/Claim");
const Item = require("../models/Item");

const authMiddleware = require("../middleware/authMiddleware");
const Notification = require("../models/Notification");

const refreshItemClaimStatus = async (itemId) => {
    const pendingCount = await Claim.countDocuments({
        item: itemId,
        status: "PENDING"
    });

    const item = await Item.findById(itemId);
    if (!item || ["RETURNED", "REMOVED"].includes(item.status)) {
        return;
    }

    item.status = pendingCount > 0 ? "CLAIM_PENDING" : "OPEN";
    await item.save();
};

/**
 * @swagger
 * /api/claims:
 *   post:
 *     summary: Submit a claim for an item
 *     tags:
 *       - Claims
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               itemId:
 *                 type: string
 *               proof:
 *                 type: string
 *     responses:
 *       201:
 *         description: Claim submitted successfully
 *       400:
 *         description: Invalid request
 */
router.post("/", authMiddleware, async (req, res) => {

    try {

        const { itemId, proof, structuredDetails, proofImages = [], handoverMethod } = req.body;

        const item = await Item.findById(itemId);

        if (!item) {
            return res.status(404).json({
                message: "Item not found"
            });
        }

        // User cannot claim their own reported item
        if (item.reportedBy.toString() === req.user.id) {
            return res.status(400).json({
                message: "You cannot claim your own reported item."
            });
        }

        if (item.status === "RETURNED") {
            return res.status(400).json({
                message: "Item already returned"
            });
        }

        const existingClaim = await Claim.findOne({
            item: itemId,
            claimant: req.user.id,
            status: "PENDING"
        });

        if (existingClaim) {
            return res.status(400).json({
                message: "Claim already submitted"
            });
        }

        // Determine handover method based on item custody type or default
        const chosenHandover = handoverMethod || (item.custodyType === "DEPARTMENT" ? "DEPARTMENT_ADMIN" : "DIRECT_STUDENT");

        // Compose comprehensive proof string if structured details are provided
        let compositeProof = proof || "";
        if (structuredDetails && typeof structuredDetails === "object") {
            const parts = [];
            if (structuredDetails.brandOrModel) parts.push(`Brand/Model: ${structuredDetails.brandOrModel}`);
            if (structuredDetails.colorOrPattern) parts.push(`Color/Pattern: ${structuredDetails.colorOrPattern}`);
            if (structuredDetails.serialOrImei) parts.push(`Serial/IMEI: ${structuredDetails.serialOrImei}`);
            if (structuredDetails.lockscreenOrWallpaper) parts.push(`Lockscreen/Wallpaper: ${structuredDetails.lockscreenOrWallpaper}`);
            if (structuredDetails.uniqueMarksOrScratches) parts.push(`Unique Marks: ${structuredDetails.uniqueMarksOrScratches}`);
            if (structuredDetails.contentsList) parts.push(`Contents: ${structuredDetails.contentsList}`);
            if (structuredDetails.idNumberMasked) parts.push(`ID Number: ${structuredDetails.idNumberMasked}`);
            if (structuredDetails.holderNameOnCard) parts.push(`Name on ID: ${structuredDetails.holderNameOnCard}`);
            if (structuredDetails.issuingAuthority) parts.push(`Authority: ${structuredDetails.issuingAuthority}`);
            if (structuredDetails.additionalNotes) parts.push(`Notes: ${structuredDetails.additionalNotes}`);

            if (parts.length > 0) {
                compositeProof = parts.join(" | ") + (proof ? `\n\nSummary: ${proof}` : "");
            }
        }

        const claim = await Claim.create({
            item: itemId,
            claimant: req.user.id,
            proof: compositeProof || "Ownership proof submitted with structured identifiers.",
            structuredDetails: structuredDetails || {},
            proofImages: Array.isArray(proofImages) ? proofImages : [],
            handoverMethod: chosenHandover
        });

        await refreshItemClaimStatus(itemId);

        await Notification.create({
            user: item.reportedBy,
            title: "New Claim Submitted",
            message: `A student has submitted a structured ownership claim for your item "${item.title}". Check your dashboard.`
        });

        res.status(201).json({
            message: "Claim submitted successfully",
            claim
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});
/**
 * @swagger
 * /api/claims/incoming:
 *   get:
 *     summary: Get claims submitted on the logged-in user's reported items
 *     tags:
 *       - Claims
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Claims requiring reporter review
 */
router.get("/incoming", authMiddleware, async (req, res) => {

    try {

        const reportedItemIds = await Item.find({
            reportedBy: req.user.id,
            status: { $ne: "REMOVED" }
        }).distinct("_id");

        const claims = await Claim.find({
            item: { $in: reportedItemIds }
        })
        .populate("item", "title category type status custodyType reportedBy")
        .populate("claimant", "name email department year")
        .sort({ createdAt: -1 });

        res.status(200).json({
            count: claims.length,
            claims
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});
/**
 * @swagger
 * /api/claims/my:
 *   get:
 *     summary: Get logged-in user's claims
 *     tags:
 *       - Claims
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's claims
 */
router.get("/my", authMiddleware, async (req, res) => {

    try {

        const claims = await Claim.find({
            claimant: req.user.id
        })
        .populate("item")
        .sort({ createdAt: -1 });

        res.status(200).json({
            count: claims.length,
            claims
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});
/**
 * @swagger
 * /api/claims/pending:
 *   get:
 *     summary: Get all pending claims (Admin)
 *     tags:
 *       - Claims
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending claims
 *       403:
 *         description: Access denied
 */
router.get("/pending", authMiddleware, async (req, res) => {

    try {

        if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
            return res.status(403).json({
                message: "Access Denied"
            });
        }

        const claims = await Claim.find({
            status: "PENDING"
        })
        .populate(
            "item",
            "title category type status"
        )
        .populate(
            "claimant",
            "name email department year"
        )
        .sort({ createdAt: -1 });

        res.status(200).json({
            count: claims.length,
            claims
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});
/**
 * @swagger
 * /api/claims/{id}/approve:
 *   put:
 *     summary: Approve a claim (Admin)
 *     tags:
 *       - Claims
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Claim approved
 *       404:
 *         description: Claim not found
 */
router.put("/:id/approve", authMiddleware, async (req, res) => {

    try {

        // Only admin can approve
        if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
            return res.status(403).json({
                message: "Access Denied"
            });
        }

        // Find claim
        const claim = await Claim.findById(req.params.id);

        if (!claim) {
            return res.status(404).json({
                message: "Claim not found"
            });
        }

        // Claim must still be pending
        if (claim.status !== "PENDING") {
            return res.status(400).json({
                message: "Claim already processed"
            });
        }

        // Approve claim
        claim.status = "APPROVED";
        await claim.save();

        await Notification.create({

            user:claim.claimant,

            title:"Claim Approved",

            message:"Congratulations! Your claim has been approved."

        });

        // Update item
        await Item.findByIdAndUpdate(
            claim.item,
            {
                status: "RETURNED",
                claimedBy: claim.claimant
            }
        );

        // Reject all other pending claims
        await Claim.updateMany(
            {
                item: claim.item,
                _id: { $ne: claim._id },
                status: "PENDING"
            },
            {
                status: "REJECTED",
                adminRemarks:
                    "Another claim has been approved.",
                qrCodeToken: null,
                qrCodeExpiresAt: null
            }
        );

        res.status(200).json({
            message: "Claim approved successfully"
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});
/**
 * @swagger
 * /api/claims/{id}/reject:
 *   put:
 *     summary: Reject a claim (Admin)
 *     tags:
 *       - Claims
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Claim rejected
 *       404:
 *         description: Claim not found
 */
router.put("/:id/reject", authMiddleware, async (req, res) => {

    try {

        if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
            return res.status(403).json({
                message: "Access Denied"
            });
        }

        const claim = await Claim.findById(req.params.id);

        if (!claim) {
            return res.status(404).json({
                message: "Claim not found"
            });
        }

        if (claim.status !== "PENDING") {
            return res.status(400).json({
                message: "Claim already processed"
            });
        }

        claim.status = "REJECTED";

        claim.adminRemarks =
            req.body.adminRemarks || "Claim rejected by admin.";

        await claim.save();

        await refreshItemClaimStatus(claim.item);

        await Notification.create({

            user:claim.claimant,

            title:"Claim Rejected",

            message:"Your claim has been rejected."

        });

        res.status(200).json({
            message: "Claim rejected successfully",
            claim
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

// ── GET /api/claims/item/:itemId ──────────────────────────────────────────
// Returns all claims for a given item. Authorized for item reporter or admin.
router.get("/item/:itemId", authMiddleware, async (req, res) => {
    try {
        const item = await Item.findById(req.params.itemId);
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }

        const isReporter = item.reportedBy.toString() === req.user.id;
        const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(req.user.role);

        if (!isReporter && !isAdmin) {
            return res.status(403).json({ message: "Access denied. Only item reporter or campus admin can view claims." });
        }

        const claims = await Claim.find({ item: req.params.itemId })
            .populate("claimant", "name email department year")
            .sort({ createdAt: -1 });

        res.status(200).json({ count: claims.length, claims });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});

// ── PUT /api/claims/:id/generate-qr ───────────────────────────────────────
// Generates a cryptographically secure, time-limited QR token for handover.
// Authorized for: Item reporter (Flow A) or Admin (Flow B).
router.put("/:id/generate-qr", authMiddleware, async (req, res) => {
    try {
        const claim = await Claim.findById(req.params.id).populate("item");
        if (!claim) {
            return res.status(404).json({ message: "Claim not found" });
        }

        if (claim.status === "REJECTED") {
            return res.status(400).json({ message: "Cannot generate QR for a rejected claim" });
        }

        if (claim.status === "APPROVED" && claim.item.status === "RETURNED") {
            return res.status(400).json({ message: "Item already marked returned" });
        }

        const item = await Item.findById(claim.item._id || claim.item);
        const isReporter = item.reportedBy.toString() === req.user.id;
        const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(req.user.role);

        if (!isReporter && !isAdmin) {
            return res.status(403).json({ message: "Only the item finder/custodian or campus admin can generate the handover QR code." });
        }

        // Generate secure 32-byte hex token valid for 24 hours
        const qrToken = crypto.randomBytes(24).toString("hex");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        claim.qrCodeToken = qrToken;
        claim.qrCodeExpiresAt = expiresAt;
        await claim.save();

        // Notify claimant that QR code is ready for pickup
        await Notification.create({
            user: claim.claimant,
            title: "Handover QR Code Ready",
            message: `The finder/custodian of "${item.title}" has prepared the handover QR. Meet them on campus and scan the QR code to complete handover!`
        });

        res.status(200).json({
            message: "Handover QR code generated successfully",
            qrToken,
            expiresAt,
            claimId: claim._id
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});

// ── GET /api/claims/:id/qr-code ───────────────────────────────────────────
// Fetches the active QR token payload. Authorized for the finder or admin.
router.get("/:id/qr-code", authMiddleware, async (req, res) => {
    try {
        const claim = await Claim.findById(req.params.id).populate("item").populate("claimant", "name email department year");
        if (!claim) {
            return res.status(404).json({ message: "Claim not found" });
        }

        const item = await Item.findById(claim.item._id || claim.item);
        const isReporter = item.reportedBy.toString() === req.user.id;
        const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(req.user.role);

        if (!isReporter && !isAdmin) {
            return res.status(403).json({ message: "Access denied. Only the item holder or admin can view the handover QR." });
        }

        if (!claim.qrCodeToken) {
            return res.status(400).json({ message: "QR code has not been generated yet. Please generate one first." });
        }

        if (new Date() > new Date(claim.qrCodeExpiresAt)) {
            return res.status(400).json({ message: "QR code has expired. Please regenerate a new one." });
        }

        res.status(200).json({
            claimId: claim._id,
            qrToken: claim.qrCodeToken,
            expiresAt: claim.qrCodeExpiresAt,
            itemTitle: item.title,
            claimantName: claim.claimant?.name,
            claimantEmail: claim.claimant?.email,
            status: claim.status
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
});

// ── POST /api/claims/verify-scan ──────────────────────────────────────────
// Called when the claimant scans the finder's/admin's QR code.
// Validates token, claimant identity, updates status to APPROVED & RETURNED.
router.post("/verify-scan", authMiddleware, async (req, res) => {
    try {
        const { qrToken } = req.body;

        if (!qrToken || typeof qrToken !== "string") {
            return res.status(400).json({ message: "QR token string is required." });
        }

        // Find claim by QR token
        const claim = await Claim.findOne({ qrCodeToken: qrToken.trim() }).populate("item");
        if (!claim) {
            return res.status(404).json({ message: "Invalid or unrecognized QR code." });
        }

        // Check if QR expired
        if (claim.qrCodeExpiresAt && new Date() > new Date(claim.qrCodeExpiresAt)) {
            return res.status(400).json({ message: "This handover QR code has expired. Ask the finder to regenerate it." });
        }

        // Check if already completed
        if (claim.handoverCompletedAt || claim.status === "APPROVED") {
            return res.status(400).json({ message: "This item has already been marked as returned and claimed." });
        }

        if (claim.status === "REJECTED") {
            return res.status(400).json({ message: "This claim has been rejected and cannot be completed by QR scan." });
        }

        if (claim.item?.status === "RETURNED") {
            return res.status(400).json({ message: "This item has already been returned to another claimant." });
        }

        // Verify that the person scanning is the claimant (or an admin assisting)
        const isClaimant = claim.claimant.toString() === req.user.id;
        const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(req.user.role);

        if (!isClaimant && !isAdmin) {
            return res.status(403).json({
                message: "Unauthorized scanner. This QR code is tied to a specific verified claimant."
            });
        }

        // Mark claim as APPROVED and handover completed
        claim.status = "APPROVED";
        claim.handoverCompletedAt = new Date();
        claim.handoverScannedBy = req.user.id;
        claim.qrCodeToken = null; // Single-use consumption
        await claim.save();

        const item = await Item.findById(claim.item._id || claim.item);
        if (item) {
            item.status = "RETURNED";
            item.claimedBy = claim.claimant;
            await item.save();

            // Reject all other pending claims for this item
            await Claim.updateMany(
                {
                    item: item._id,
                    _id: { $ne: claim._id },
                    status: "PENDING"
                },
                {
                    status: "REJECTED",
                    adminRemarks: "Another verified claim was approved and item handed over via verified QR code.",
                    qrCodeToken: null,
                    qrCodeExpiresAt: null
                }
            );

            // Notify original finder that handover is complete
            await Notification.create({
                user: item.reportedBy,
                title: "Handover Complete! 🎉",
                message: `Your found item "${item.title}" was successfully verified and handed over via QR scan. Thank you for helping our campus!`
            });
        }

        // Notify claimant
        await Notification.create({
            user: claim.claimant,
            title: "Item Successfully Recovered! 🎓",
            message: `Handover verified for "${item?.title || 'your item'}". The listing is now officially closed.`
        });

        res.status(200).json({
            success: true,
            message: `Handover verified successfully! "${item?.title || 'Item'}" has been officially marked as Returned.`,
            claimId: claim._id,
            itemTitle: item?.title,
            completedAt: claim.handoverCompletedAt
        });

    } catch (error) {
        console.error("QR scan verification error:", error);
        res.status(500).json({ message: "Server Error during QR verification." });
    }
});

module.exports = router;
