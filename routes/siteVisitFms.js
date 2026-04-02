const express = require("express");
const router = express.Router();

// Import step routes
const svStep2Routes = require("./siteVisit/steps/svStep2");
router.use("/step2", svStep2Routes);

const svStep3Routes = require("./siteVisit/steps/svStep3");
router.use("/step3", svStep3Routes);

module.exports = router;