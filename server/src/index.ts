import express from "express"
import cors from 'cors'
import logger from "./utils/logger"
import middleware from "./utils/middleware"
import config from "./utils/config"
import mongoose from "mongoose"
//import { userRouter } from "./controllers/userController";

logger.info('---')
logger.info('Connecting to MongoDB')

mongoose.set('strictQuery', false)
mongoose.connect(config.MONGODB_URI as string)
    .then(() => {
        logger.info('Connected to MongoDB')
    })
    .catch((error: any) => {
        logger.error('Error connecting to MongoDB:', error.message)
    })

const app = express()
const port = config.PORT || 5008

app.use(cors())
app.use(express.json())
app.use(middleware.requestLogger)
app.use(middleware.unknownEndpoint)
app.use(middleware.errorHandler)

// Routes
//app.use('./controllers/userController', userRouter)


// ==============================================

app.get('/', (req, res) => {
    res.send('<a href="/auth/google">Authenticate with Google</a>');
});

app.get('/hello', (req, res) => {
    res.send("Hello world!");
});

app.listen(port, () => {
    logger.info(`Server listening on port ${port}`)
})