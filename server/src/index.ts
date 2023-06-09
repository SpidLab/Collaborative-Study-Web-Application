import express from "express"
import cors from 'cors'
import logger from "./utils/logger"
import middleware from "./utils/middleware"
import config from "./utils/config"
import mongoose from "mongoose"
import credentialsRouter from "./controllers/credentialsController"
import employeeRouter from "./controllers/employeeController"
import healthDataRouter from "./controllers/healthDataController"
import pdaRouter from "./controllers/pdaController"
import userAgentRouter from "./controllers/userAgentUsageController"

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

// Authentication routes
// ==============================================

app.use('/api/credentials', credentialsRouter)

// Get health data routes
// ==============================================

app.use('/api/health-data', healthDataRouter)

// DB routes
// ==============================================

app.use('/api/employee', employeeRouter)

// PDA routes
// ==============================================
app.use('/api/pda', pdaRouter)

// Interaction with User Agent Controller routes
app.use('/api/user-agent-controller', userAgentRouter)

app.use(middleware.unknownEndpoint)
app.use(middleware.errorHandler)

app.listen(port, () => {
    logger.info(`Server listening on port ${port}`)
})