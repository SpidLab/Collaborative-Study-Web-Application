import * as dotenv from 'dotenv'
dotenv.config()

/*
const appConfig = {
    applicationId: 'ar-s-progressiveemployeestressapp',
    namespace: 'progressiveemployeestore',
    hatCluster: '.hubat.net',
    hatApiVersion: 'v2.6',
    secure: false,
}
 */

const PORT = process.env.PORT as string
const MONGODB_URI = process.env.MONGODB_URI as string
const config = {
    PORT,
    MONGODB_URI,
    appConfig
}

export default config