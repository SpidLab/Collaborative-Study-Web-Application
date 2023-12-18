import express from "express";
import passport from "passport";
const router = express.Router();

router.get("/login", (req, res) => {
  // this will render login.ejs file
  res.render("login");
});

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["email", "profile"],
  })
);

router.get("/google/redirect", passport.authenticate("google"), (req, res) => {
  res.redirect("/profile");
});

router.get("/logout", (req, res) => {
  req.logout();
  res.redirect("/");
});

export default router;
