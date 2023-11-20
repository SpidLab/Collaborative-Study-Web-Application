import express from "express";
import mongoose from "mongoose";
import { PORT, MONGO_URI } from "./utils/secret";
import "./config/passport";
import authRoutes from "./routes/authRoutes";

const app = express();

app.set("view engine", "ejs");

app.use("/auth", authRoutes);

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

app.get("/", (req, res) => {
  res.render("home");
});
