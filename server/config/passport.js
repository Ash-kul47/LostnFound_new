const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const User = require("../models/User");

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "/auth/google/callback"
        },

        async (
            accessToken,
            refreshToken,
            profile,
            done
        ) => {

            try {

                const email =
                    profile.emails[0].value;

                if (
                    !email.endsWith("@mmcoe.edu.in")
                ) {
                    return done(
                        null,
                        false,
                        {
                            message:
                            "Only MMCOE accounts allowed"
                        }
                    );
                }

                let user =
                    await User.findOne({
                        email
                    });

                if (!user) {

                    user =
                        await User.create({

                            name:
                                profile.displayName,

                            email,

                            googleId:
                                profile.id,

                            authProvider:
                                "GOOGLE",

                            isVerified:
                                true
                        });
                }

                return done(null, user);

            }
            catch (error) {

                return done(error, null);

            }
        }
    )
);

passport.serializeUser(
    (user, done) => {
        done(null, user.id);
    }
);

passport.deserializeUser(
    async (id, done) => {

        try {

            const user =
                await User.findById(id);

            done(null, user);

        }
        catch (error) {

            done(error, null);

        }
    }
);

module.exports = passport;