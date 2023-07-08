import express from "express"
import cors from 'cors'
import logger from "./utils/logger"
import middleware from "./utils/middleware"
import config from "./utils/config"
import mongoose from "mongoose"
import User from "./models/user";
import bcrypt from "bcrypt";
import Session from "./models/session";
import mongodb from "mongodb";
import csvtojson from "csvtojson";

logger.info('---')
logger.info('Connecting to MongoDB')
const url = "mongodb://localhost:27017/";
const dbName = "zkoder_db";
const collectionName = "category";

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

import { Request, Response } from "express";
import User from "./models/user";

// Register route
app.post('/register', async (req: Request, res: Response) => {
  try {
    const {userID, name, email, password} = req.body;

    // Check if the userID or email already exists in the database
    const existingUser = await User.findOne({$or: [{userID}, {email}]});
    if (existingUser) {
      return res.status(400).json({error: "User ID or email already exists"});
    }

    // Create a new user instance and save to database
    const newUser = new User({ userID, name, email, password });
    await newUser.save();

    // Respond with a success message
    res.json({message: "User registered successfully"});
  } 
  catch (error) {
    // Handle any errors that occur during the registration process
    res.status(500).json({ error: "Failed to register user" });
  }
});


// Login route
app.post('/login', async (req: Request, res: Response) => {
  try {
    const {email, password} = req.body;

    // Find the user by userID or email
    const user = await User.findOne({email});

    // If the user is not found, return an error response
    if (!user) {
      return res.status(401).json({error: "This email is not registered"});
    }

    // Compare the provided password with the stored password hash
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    // If the passwords do not match, return an error response
    if (!passwordMatch) {
      return res.status(401).json({ error: "The pass word is wrong" });
    }

    res.json({ message: "Login successful" });
  } 
  catch (error) {
    // Handle any errors that occur during the login process
    res.status(500).json({ error: "There was an error logging in" });
  }
});


// Join session route
app.post('/join-session', async (req: Request, res: Response) => {
  try {
    const {phenotype, sampleSize, snpList } = req.body;

    // Find existing sessions with the same dataset attributes
    const sessions = await Session.find({phenotype, sampleSize, snpList});

    // If a match is found, provide the session ID as a response
    const sessionID = sessions[0].sessionID;

    // Return the session ID in the response along with a message
    res.json({
      sessionID,
      message: "Would you like to join this session?",
    });
  } 
  catch (error) {
    // Handle any errors that occur during the join session process
    res.status(500).json({ error: "Failed to join session" });
  }
});

// Upload dataset route
// Route for inserting CSV data into MongoDB
app.post("/upload-dataset", async (req: Request, res: Response) => {
  try {
    // Read the CSV file and convert it to JSON
    const csvData = await csvtojson().fromFile("filepath.csv");

    // Connect to MongoDB
    const client = await mongodb.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    const db = client.db(dbName);

    // Insert the JSON data into the collection
    const result = await db.collection(collectionName).insertMany(csvData);
    client.close();
    res.json({ insertedCount: result.insertedCount });
  } catch (error) {
    // Handle any errors that occur during the insertion process
    res.status(500).json({ error: "Failed to insert CSV data" });
  }
});
  
  // Perform operations on dataset route
  app.post('/perform-operations', (req, res) => {
    // Handle dataset operations logic
    // Retrieve data from req.body and perform necessary operations
    // Respond with appropriate result or error message
  })


// ==============================================


app.use(middleware.unknownEndpoint)
app.use(middleware.errorHandler)

app.listen(port, () => {
    logger.info(`Server listening on port ${port}`)
})