const Item = require("../models/Item");
const Claim = require("../models/Claim");
const User = require("../models/User");

// ===============================
// STUDENT DASHBOARD
// ===============================
const getStudentDashboard = async (req, res) => {
    try {
        const userId = req.user.id;

        const reportedItems = await Item.countDocuments({
            reportedBy: userId
        });

        const lostItems = await Item.countDocuments({
            reportedBy: userId,
            type: "LOST"
        });

        const foundItems = await Item.countDocuments({
            reportedBy: userId,
            type: "FOUND"
        });

        const activeClaims = await Claim.countDocuments({
            claimant: userId,
            status: "PENDING"
        });

        const incomingClaimRequests = await Claim.countDocuments({
            status: "PENDING",
            item: {
                $in: await Item.find({
                    reportedBy: userId,
                    status: { $ne: "REMOVED" }
                }).distinct("_id")
            }
        });

        const returnedItems = await Item.countDocuments({
            reportedBy: userId,
            status: "RETURNED"
        });

        return res.status(200).json({
            success: true,
            dashboard: {
                reportedItems,
                lostItems,
                foundItems,
                activeClaims,
                incomingClaimRequests,
                returnedItems
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Failed to load dashboard"
        });
    }
};

// ===============================
// ADMIN DASHBOARD
// ===============================
const getAdminDashboard = async (req, res) => {
    try {
        if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Access Denied"
            });
        }

        const totalUsers = await User.countDocuments();
        const totalItems = await Item.countDocuments();
        const openItems = await Item.countDocuments({
            status: "OPEN"
        });
        const returnedItems = await Item.countDocuments({
            status: "RETURNED"
        });
        const pendingClaims = await Claim.countDocuments({
            status: "PENDING"
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayReports = await Item.countDocuments({
            createdAt: {
                $gte: today
            }
        });

        return res.status(200).json({
            success: true,
            dashboard: {
                totalUsers,
                totalItems,
                openItems,
                returnedItems,
                pendingClaims,
                todayReports
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Failed to load admin dashboard"
        });
    }
};

module.exports = {
    getStudentDashboard,
    getAdminDashboard
};
