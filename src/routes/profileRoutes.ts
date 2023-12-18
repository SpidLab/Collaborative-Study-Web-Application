import express from "express";
const router = express.Router();

const checkAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
        res.redirect("/auth/login");
    } else {
        next();
    }
};

router.get("/", checkAuth, (req, res) => {
    res.render("profile", {user: req.user})
});

export default router;