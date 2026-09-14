const swaggerJsDoc = require("swagger-jsdoc");

const options = {

    definition: {

        openapi: "3.0.0",

        info: {
            title: "Lost & Found API",
            version: "1.0.0",
            description: "Campus Lost & Found Backend API"
        },

        servers: [
            {
                url: "https://campus-lost-found-backend-txgg.onrender.com"
            }
        ],

        components: {

            securitySchemes: {

                bearerAuth: {

                    type: "http",

                    scheme: "bearer",

                    bearerFormat: "JWT"

                }

            }

        },

        security: [

            {
                bearerAuth: []
            }

        ]

    },

    apis: ["./routes/*.js"]

};

module.exports = swaggerJsDoc(options);