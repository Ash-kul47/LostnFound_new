const express = require("express");
const router = express.Router();

const crypto = require("crypto");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");

const authMiddleware = require("../middleware/authMiddleware");
const {registerValidation,loginValidation,validate} = require("../validators/authValidator");

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get logged-in user's profile
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/profile",authMiddleware,async (req, res) => {

    try {
        const user = await User.findById(req.user.id).select("-password -verificationToken -verificationTokenExpiry");

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.status(200).json({
            message: "Protected Route Accessed",
            user
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Server Error"
        });
    }

    }
);
/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new student
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - department
 *               - year
 *             properties:
 *               name:
 *                 type: string
 *                 example: Ashutosh Kulkarni
 *               email:
 *                 type: string
 *                 example: ashutosh@mmcoe.edu.in
 *               password:
 *                 type: string
 *                 example: Password@123
 *               department:
 *                 type: string
 *                 example: Computer Engineering
 *               year:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Invalid input or user already exists
 *       500:
 *         description: Server error
 */
router.post("/register",registerValidation,validate,async(req,res)=>{
    try{
        const { name,email,password,department,year }=req.body;

        const existingUser=await User.findOne({email});

        if(existingUser){
            return res.status(400).json({
                message:"User already exists"
            });
        }
        const hashedpassword=await bcrypt.hash(password,10);

        
        const verificationToken =
            crypto.randomBytes(32).toString("hex");

        const verificationTokenExpiry =
            Date.now() + 24 * 60 * 60 * 1000;

        const user=await User.create({
            name,email,password:hashedpassword,department,year,
            verificationToken,
            verificationTokenExpiry,

            isVerified: false,

            authProvider: "LOCAL"
        });
        const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
        const verificationLink = `${clientUrl}/verify-email?token=${verificationToken}`;

        
        await sendEmail(
            email,
            "verify your Lost & Found Account",
            `
            <h2>Verify your Email</h2>
            <p> click the link below:</p>
            <a href="${verificationLink}">Verify Account </a>
            `
        );

        res.status(201).json({
            message:"User registered successfully",
            user
        });
    }catch(error){
        console.log(error);
        res.status(500).json({
            message:"server error"
        });
    }

});


/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login User
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login Successful
 *       401:
 *         description: Invalid Credentials
 */

router.post("/login",loginValidation,validate,async(req,res)=>{
    try{
        const {email,password}=req.body;
        const user=await User.findOne({email});

        if(!user){
            return res.status(404).json({ 
                message:"User not found"
            });
        }
        if(!user.isVerified){
            return res.status(401).json({
                message:"Please verify your email first"
            });
        }
        const isMatch=await bcrypt.compare(
            password,
            user.password
        );
        if(!isMatch){
            return res.status(401).json({message:"Invalid credintials"});
        }

        const token=jwt.sign(
            {
                id:user._id,
                role:user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn:"7d"
            }
        );
        res.status(200).json({
            message:"Login Successful",
            token
        });
        }catch(error){
            console.log(error)
            res.status(500).json({message:"Server Error"});
        }
    
});

/**
 * @swagger
 * /api/users/verify/{token}:
 *   get:
 *     summary: Verify user email
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 */

router.get("/verify/:token", async (req, res) => {

    try {

        const user = await User.findOne({
            verificationToken: req.params.token
        });

        if (!user) {
            return res.status(400).json({
                message: "Invalid Token"
            });
        }

        if (user.verificationTokenExpiry < Date.now()) {
            return res.status(400).json({
                message: "Token Expired"
            });
        }

        user.isVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpiry = null;

        await user.save();

        res.status(200).json({
            message: "Email Verified Successfully"
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

module.exports = router;
