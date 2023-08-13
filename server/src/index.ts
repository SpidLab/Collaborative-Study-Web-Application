import express from "express"
import cors from 'cors'
import logger from "./utils/logger"
import middleware from "./utils/middleware"
import config from "./utils/config"
import mongoose from "mongoose"
import { userRouter } from "./controllers/userController";

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
const port = config.PORT || 5005

app.use(cors())
app.use(express.json())
app.use(middleware.requestLogger)

// Routes
app.use('/api/user', userRouter)


// ==============================================


app.use(middleware.unknownEndpoint)
app.use(middleware.errorHandler)

app.listen(port, () => {
    logger.info(`Server listening on port ${port}`)
})