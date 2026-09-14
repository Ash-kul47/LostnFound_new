const express = require("express");
const router = express.Router();

const Notification = require("../models/Notification");
const authMiddleware = require("../middleware/authMiddleware");


// Get My Notifications
/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get user notifications
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications list
 */
router.get("/", authMiddleware, async (req,res)=>{

    try{

        const notifications = await Notification.find({
            user:req.user.id
        }).sort({createdAt:-1});

        res.status(200).json({
            count:notifications.length,
            notifications
        });

    }catch(error){

        console.log(error);

        res.status(500).json({
            message:"Server Error"
        });

    }

});


// Mark One As Read
/**
 * @swagger
 * /api/notifications/{id}/read:
 *   put:
 *     summary: Mark a notification as read
 *     tags:
 *       - Notifications
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
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
router.put("/:id/read",authMiddleware,async(req,res)=>{

    try{

        const notification = await Notification.findOneAndUpdate(

            {
                _id:req.params.id,
                user:req.user.id
            },

            {
                isRead:true
            },

            {
                new:true
            }

        );

        if(!notification){

            return res.status(404).json({
                message:"Notification not found"
            });

        }

        res.status(200).json({
            message:"Notification marked as read"
        });

    }catch(error){

        console.log(error);

        res.status(500).json({
            message:"Server Error"
        });

    }

});


// Mark All Read
/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     summary: Mark all notifications as read
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.put("/read-all",authMiddleware,async(req,res)=>{

    try{

        await Notification.updateMany(

            {
                user:req.user.id,
                isRead:false
            },

            {
                isRead:true
            }

        );

        res.status(200).json({
            message:"All notifications marked as read"
        });

    }catch(error){

        console.log(error);

        res.status(500).json({
            message:"Server Error"
        });

    }

});

module.exports = router;