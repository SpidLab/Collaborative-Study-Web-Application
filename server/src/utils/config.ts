import * as dotenv from 'dotenv'
import { MetriportDevicesApi } from "@metriport/api"
import { HatClient } from "@dataswift/hat-js"
dotenv.config()

export const initializeHatClient = (pdaToken: string, pdaUsername: string) => {
    const config = {
        token: pdaToken,
        apiVersion: "v2.6",
        secure: false,
        hatDomain: `${pdaUsername}.hubat.net`
    }
    const hat = new HatClient(config)
    return hat
}

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
const PDA_URL_EXT = process.env.PDA_URL_EXT as string
const USER_AGENT_CONTROLLER_BASE_URL = process.env.USER_AGENT_CONTROLLER_BASE_URL as string
// const CREATE_INVITATION_BODY = process.env.CREATE_INVITATION_BODY as unknown as JSON
const SERVICE_PROVIDER_AGENT_BASE_URL = process.env.SERVICE_PROVIDER_AGENT_BASE_URL
const config = {
    PORT,
    MONGODB_URI,
    METRIPORT_CLIENT,
    PDA_URL_EXT,
    USER_AGENT_CONTROLLER_BASE_URL,
    // CREATE_INVITATION_BODY,
    SERVICE_PROVIDER_AGENT_BASE_URL,
    appConfig
}

export default config