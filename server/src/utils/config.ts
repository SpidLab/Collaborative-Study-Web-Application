import * as dotenv from 'dotenv'
dotenv.config()

const PORT = process.env.PORT as string
const MONGODB_URI = process.env.MONGODB_URI as string
const SECRET = "bezkoder-secret-key" as string

const config = {
    PORT,
    MONGODB_URI,
    SECRET
}

export default config