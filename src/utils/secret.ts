import dotenv from "dotenv";
import fs from "fs";

// checking if .env file is available
if (fs.existsSync(".env")) {
  dotenv.config({ path: ".env" });
} else {
  console.error(".env file not found.");
}

// checking the environment, so that we can set up our database accordingly
export const ENVIRONMENT = process.env.NODE_ENV;
const prod = ENVIRONMENT === "production";

export const PORT = (process.env.PORT || 3000) as number;

// use MONGODB_URI directly from the environment
export const MONGO_URI = process.env.MONGODB_URI as string;

if (!MONGO_URI) {
  console.error("No mongo connection string. Set MONGODB_URI environment variable.");
  process.exit(1);
}
