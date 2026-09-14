const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
    getStudentDashboard,
    getAdminDashboard
} = require("../controllers/dashboardController");

// =========================================
// STUDENT DASHBOARD
// =========================================

/**
 * @swagger
 * /api/dashboard/student:
 *   get:
 *     summary: Student dashboard statistics
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Student dashboard data
 */
router.get("/student", authMiddleware, getStudentDashboard);


// =========================================
// ADMIN DASHBOARD
// =========================================

/**
 * @swagger
 * /api/dashboard/admin:
 *   get:
 *     summary: Admin dashboard statistics
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin dashboard data
 */
router.get("/admin", authMiddleware, getAdminDashboard);

module.exports = router;