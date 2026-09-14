const { body, validationResult } = require("express-validator");

const registerValidation = [

    body("name")
        .trim()
        .notEmpty()
        .withMessage("Name is required"),

    body("email")
        .isEmail()
        .withMessage("Enter a valid email")
        .custom((value)=>{
            if(!value.endsWith("@mmcoe.edu.in")){
                throw new Error('Only MMCOE email address are allowed');
            }
            return true;
        })
        .normalizeEmail(),

    body("password")
        .isLength({ min: 6 })
        .withMessage("Password must be at least 6 characters"),

    body("department")
        .notEmpty()
        .withMessage("Department is required"),

    body("year")
        .isInt({ min: 1, max: 4 })
        .withMessage("Year must be between 1 and 4")

];
const loginValidation = [

    body("email")
        .isEmail()
        .withMessage("Enter a valid email"),

    body("password")
        .notEmpty()
        .withMessage("Password is required")

];

const validate = (req, res, next) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {

        return res.status(400).json({
            success: false,
            errors: errors.array()
        });

    }

    next();

};

module.exports = {
    registerValidation,
    loginValidation,
    validate
};