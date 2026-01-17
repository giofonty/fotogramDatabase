const pg = require (`pg`)
const express = require (`express`) // express framework per REST api
const fileUpload = require (`express-fileupload`); // plugin per file upload

const app = express () // inizializza express
const port = 3000

app.use (express.json () ) // per gestire json requests
app.use (express.urlencoded ({ extended : true }) ) // per gestire urlencoded requests
app.use (fileUpload () ) ; // per gestire upload da form nelle request

const swaggerUi = require('swagger-ui-express') //swagger UI per interrogare le API REST
const swaggerFile = require('./swagger-output.json') //file di configurazione per lo swagger
app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerFile)) //per accedere allo swagger su /doc

app.listen (port , () => {
console.log (`App running on port ${ port }. `)
})

app.get (`/`, ( request , response ) => {
response.json ({ info : `Node .js , Express , and Postgres API ` })
})

require (`./endpoints`)( app ) // endpoints
