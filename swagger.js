const swaggerAutogen = require('swagger-autogen')({openapi: '3.0.4'}) //per auto-generare la config swagger

const doc = { //scheletro della configurazione swagger
    info: {
        title: 'fotogramAPI',
        description: 'API di fotogram'
    },
    host: 'localhost:3000',
    components:{
        securitySchemes:{
            bearerAuth:{
                type:'http',
                schemes: 'bearer'
            }
        }
    }
};

const outputFile = './swagger-output.json'; //salva la configurazione qua
const routes = ['./endpoints.js']; //processa questi endpoints per generare lo swagger
swaggerAutogen(outputFile, routes, doc); //autogenera la config