const express = require("express");
const router = express.Router();
// Analytics routes placeholder
router.get("/stats", (req, res) => {
  res.json({ message: "Analytics stats endpoint - to be implemented" });
});

module.exports = router;
