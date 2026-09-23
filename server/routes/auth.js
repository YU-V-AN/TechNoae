const express = require("express");
const router = express.Router();
const { run, get, all } = require("../db/database");

// -------------------------------------------------------------
// 1. POST /api/auth/resident - Resident Citizen Login / Register
// -------------------------------------------------------------
router.post("/resident", async (req, res) => {
  try {
    const { name, phone, pin, action } = req.body;
    const cleanPhone = String(phone || "").replace(/\D/g, "").slice(-10);

    if (!cleanPhone || cleanPhone.length !== 10) {
      return res.status(400).json({ error: "Please enter a valid 10-digit mobile number." });
    }

    const cleanPin = String(pin || "1234").trim();

    // Check if resident exists
    let user = await get("SELECT * FROM resident_users WHERE phone = ?", [cleanPhone]);

    if (action === "register" || !user) {
      const cleanName = (name || (user ? user.name : "Resident Citizen")).trim();
      if (!user) {
        const id = `res_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await run(`
          INSERT INTO resident_users (id, name, phone, pin, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `, [id, cleanName, cleanPhone, cleanPin, Date.now()]);
        user = await get("SELECT * FROM resident_users WHERE id = ?", [id]);
      } else {
        // Update existing profile
        await run(`UPDATE resident_users SET name = ?, pin = ? WHERE id = ?`, [cleanName, cleanPin, user.id]);
        user = await get("SELECT * FROM resident_users WHERE id = ?", [user.id]);
      }
    } else {
      // Login attempt: check PIN (allows default '1234' for convenience)
      if (user.pin && user.pin !== cleanPin && cleanPin !== "1234") {
        return res.status(401).json({ error: "Invalid 4-digit PIN for this phone number." });
      }
    }

    res.json({
      success: true,
      message: `Welcome ${user.name}!`,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: "resident"
      }
    });
  } catch (err) {
    console.error("Resident auth error:", err);
    res.status(500).json({ error: "Failed to authenticate citizen user." });
  }
});

// -------------------------------------------------------------
// 2. POST /api/auth/shop - Scrap Shopkeeper Login
// -------------------------------------------------------------
router.post("/shop", async (req, res) => {
  try {
    const { shopId, phone, pin } = req.body;
    let shop = null;

    if (shopId) {
      shop = await get("SELECT * FROM scrap_shops WHERE id = ?", [shopId]);
    }

    if (!shop && phone) {
      const cleanPhone = String(phone).replace(/\D/g, "").slice(-10);
      shop = await get("SELECT * FROM scrap_shops WHERE phone LIKE ?", [`%${cleanPhone}%`]);
    }

    // Default to first shop if neither given (fallback)
    if (!shop) {
      shop = await get("SELECT * FROM scrap_shops ORDER BY name ASC LIMIT 1");
    }

    if (!shop) {
      return res.status(404).json({ error: "No registered scrap shop found." });
    }

    const cleanPin = String(pin || "1234").trim();
    if (shop.pin && shop.pin !== cleanPin && cleanPin !== "1234") {
      return res.status(401).json({ error: "Invalid Scrap Shop access PIN." });
    }

    res.json({
      success: true,
      message: `Welcome to ${shop.name}!`,
      user: {
        id: shop.id,
        name: shop.name,
        phone: shop.phone,
        address: shop.address,
        area: shop.area,
        role: "shop"
      }
    });
  } catch (err) {
    console.error("Shop auth error:", err);
    res.status(500).json({ error: "Failed to authenticate scrap shop." });
  }
});

// -------------------------------------------------------------
// 3. POST /api/auth/recycler - Industrial Recycler Facility Login
// -------------------------------------------------------------
router.post("/recycler", async (req, res) => {
  try {
    const { plantId, passcode } = req.body;
    const cleanId = String(plantId || "PLANT-CHE-01").trim().toUpperCase();
    const cleanCode = String(passcode || "recycle2026").trim();

    const VALID_PLANTS = {
      "PLANT-CHE-01": "Chennai Central Industrial Recycler Plant",
      "PLANT-AMB-02": "Ambattur Industrial E-Waste Refinery",
      "ADMIN@TECHNOVA.IN": "Authorized Industrial Processing Center"
    };

    if (!VALID_PLANTS[cleanId] && cleanId !== "DEMO") {
      return res.status(401).json({ error: "Unrecognized Facility / Plant ID." });
    }

    // Accept passcode 'recycle2026' or demo PIN '1234'
    if (cleanCode !== "recycle2026" && cleanCode !== "1234") {
      return res.status(401).json({ error: "Invalid Industrial Access Passcode." });
    }

    const plantName = VALID_PLANTS[cleanId] || "Chennai Central Industrial Recycler Plant";

    res.json({
      success: true,
      message: `Authenticated: ${plantName}`,
      user: {
        id: cleanId,
        name: plantName,
        role: "recycler",
        certification: "CPCB / TNPCB Certified Industrial Recycler"
      }
    });
  } catch (err) {
    console.error("Recycler auth error:", err);
    res.status(500).json({ error: "Failed to authenticate industrial facility." });
  }
});

module.exports = router;
