import express from "express";
import mongoose from "mongoose";
import { PORT, MONGO_URI, COOKIE_KEY } from "./utils/secrets";
import "./config/passport";
import authRoutes from "./routes/authRoutes";
import profileRoutes from "./routes/profileRoutes";
import path from 'path';

import cookieSession from "cookie-session";
import passport from "passport";

const app = express();

app.set("view engine", "ejs");

// setting up cookieSession
app.use(
    cookieSession({
        maxAge: 24 * 60 * 60 * 1000,
        keys: [COOKIE_KEY],
    })
);

// initialize passport
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, 'Frontend/dist')));

app.use("/auth", authRoutes);
app.use("/profile", profileRoutes);

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
} as mongoose.ConnectOptions)
.then(() => {
    console.log("Connected to MongoDB");
})
.catch((error) => {
    console.error("Error connecting to MongoDB:", error);
});


app.listen(PORT, () => {
  console.log("App listening on port: " + PORT);
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'Frontend/dist', 'index.html'));
});

// app.get("/", (req, res) => {
//   res.render("login");
// });
