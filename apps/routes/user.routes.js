const express = require("express");
const router = express.Router();
// User routes placeholder - for future authentication
router.get("/profile", (req, res) => {
  res.json({ message: "User profile endpoint - to be implemented" });
});

module.exports = router;
