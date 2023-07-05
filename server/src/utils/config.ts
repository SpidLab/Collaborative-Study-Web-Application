import * as dotenv from 'dotenv'
import { MetriportDevicesApi } from "@metriport/api"
dotenv.config()

const appConfig = {
    applicationId: 'ar-s-progressiveemployeestressapp',
    namespace: 'progressiveemployeestore',
    hatCluster: '.hubat.net',
    hatApiVersion: 'v2.6',
    secure: false,
}

const PORT = process.env.PORT as string
const MONGODB_URI = process.env.MONGODB_URI as string
const METRIPORT_CLIENT = new MetriportDevicesApi(process.env.METRIPORT_API_KEY as string)
const USER_AGENT_CONTROLLER_BASE_URL = process.env.USER_AGENT_CONTROLLER_BASE_URL as string
// const CREATE_INVITATION_BODY = process.env.CREATE_INVITATION_BODY as unknown as JSON
const SERVICE_PROVIDER_AGENT_BASE_URL = process.env.SERVICE_PROVIDER_AGENT_BASE_URL
const config = {
    PORT,
    MONGODB_URI,
    METRIPORT_CLIENT,
    USER_AGENT_CONTROLLER_BASE_URL,
    // CREATE_INVITATION_BODY,
    SERVICE_PROVIDER_AGENT_BASE_URL,
    appConfig
}

export default config