import dotenv from "dotenv";
import fs from "fs";

// checking if .env file is available --> this was moved above exporting the google client id and client secret unlike shown in the tutorial to avoid an error
if (fs.existsSync(".env")) {
  dotenv.config({ path: ".env" });
} else {
  console.error(".env file not found.");
}

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;           // moved below checking for .env file existing
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string;

// checking the environment, so that we can set up our database accordingly
export const ENVIRONMENT = process.env.NODE_ENV;

export const PORT = (process.env.PORT || 3000) as number;

// use MONGODB_URI directly from the environment
export const MONGO_URI = process.env.MONGODB_URI as string;

if (!MONGO_URI) {
  console.error("No mongo connection string. Set MONGODB_URI environment variable.");
  process.exit(1);
}
