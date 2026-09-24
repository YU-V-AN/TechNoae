const express = require("express");
const router = express.Router();
const { run, get, all } = require("../db/database");

// Helper: map row to clean JSON (parsing floats, etc.)
function formatRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    weight: Number(row.weight) || 0,
    imageUrl: row.imageUrl,
    residentId: row.residentId || null,
    residentName: row.residentName,
    residentPhone: row.residentPhone,
    residentNotes: row.residentNotes || "",
    homeArea: row.homeArea || "",
    homeLat: row.homeLat !== null ? Number(row.homeLat) : 13.0827,
    homeLng: row.homeLng !== null ? Number(row.homeLng) : 80.2707,
    shopName: row.shopName || "Sri Murugan Scrap Shop",
    shopPhone: row.shopPhone || "9840123456",
    shopLat: row.shopLat !== null ? Number(row.shopLat) : 13.0850,
    shopLng: row.shopLng !== null ? Number(row.shopLng) : 80.2760,
    recyclerName: row.recyclerName || "Chennai Central Recycler Plant",
    status: row.status || "Requested",
    householdOtp: row.householdOtp || null,
    householdOtpVerified: Boolean(row.householdOtpVerified),
    shopOtp: row.shopOtp || null,
    shopOtpVerified: Boolean(row.shopOtpVerified),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    timestamp: new Date(row.createdAt).toISOString()
  };
}

// -------------------------------------------------------------
// 1. GET /api/requests - Fetch all pickup requests
// -------------------------------------------------------------
router.get("/requests", async (req, res) => {
  try {
    const { status, residentPhone } = req.query;
    let sql = "SELECT * FROM pickup_requests";
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }
    if (residentPhone) {
      conditions.push("residentPhone = ?");
      params.push(residentPhone);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY createdAt DESC";

    const rows = await all(sql, params);
    res.json(rows.map(formatRequest));
  } catch (err) {
    console.error("Error fetching requests:", err);
    res.status(500).json({ error: "Failed to fetch pickup requests from database." });
  }
});

// -------------------------------------------------------------
// 2. GET /api/requests/stats - Aggregated stats for dashboards
// -------------------------------------------------------------
router.get("/requests/stats", async (req, res) => {
  try {
    const totalRow = await get("SELECT COUNT(*) as totalCount, COALESCE(SUM(weight), 0) as totalWeight FROM pickup_requests");
    const completedRow = await get("SELECT COUNT(*) as completedCount, COALESCE(SUM(weight), 0) as completedWeight FROM pickup_requests WHERE status = 'Completed'");
    const inShopRow = await get("SELECT COUNT(*) as inShopCount, COALESCE(SUM(weight), 0) as inShopWeight FROM pickup_requests WHERE status = 'In Shop'");
    const recyclerReadyRow = await get("SELECT COUNT(*) as readyCount, COALESCE(SUM(weight), 0) as readyWeight FROM pickup_requests WHERE status = 'Recycler Assigned'");

    // Top areas leaderboard
    const areaRows = await all(`
      SELECT homeArea, COUNT(*) as count, COALESCE(SUM(weight), 0) as totalKg
      FROM pickup_requests
      WHERE homeArea IS NOT NULL AND homeArea != ''
      GROUP BY homeArea
      ORDER BY totalKg DESC
      LIMIT 10
    `);

    res.json({
      totalRequests: totalRow.totalCount,
      totalWeight: Math.round(totalRow.totalWeight * 10) / 10,
      completedCount: completedRow.completedCount,
      completedWeight: Math.round(completedRow.completedWeight * 10) / 10,
      inShopCount: inShopRow.inShopCount,
      inShopWeight: Math.round(inShopRow.inShopWeight * 10) / 10,
      readyLotsCount: recyclerReadyRow.readyCount,
      leaderboard: areaRows.map(a => ({
        area: a.homeArea,
        count: a.count,
        weight: Math.round(a.totalKg * 10) / 10
      }))
    });
  } catch (err) {
    console.error("Error computing stats:", err);
    res.status(500).json({ error: "Failed to compute statistics." });
  }
});

// -------------------------------------------------------------
// 3. GET /api/requests/:id - Fetch single pickup request
// -------------------------------------------------------------
router.get("/requests/:id", async (req, res) => {
  try {
    const row = await get("SELECT * FROM pickup_requests WHERE id = ?", [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: "Pickup request not found." });
    }
    res.json(formatRequest(row));
  } catch (err) {
    console.error("Error fetching single request:", err);
    res.status(500).json({ error: "Failed to fetch request." });
  }
});

// -------------------------------------------------------------
// 4. POST /api/requests - Create new home pickup request
// -------------------------------------------------------------
router.post("/requests", async (req, res) => {
  try {
    const {
      type,
      weight,
      imageUrl,
      residentName,
      residentPhone,
      residentNotes,
      homeArea,
      homeLat,
      homeLng,
      shopName,
      shopPhone,
      shopLat,
      shopLng
    } = req.body;

    if (!type || !weight || !residentName || !residentPhone) {
      return res.status(400).json({
        error: "Missing required fields: type, weight, residentName, residentPhone are required."
      });
    }

    const id = req.body.id || `lot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const finalWeight = parseFloat(weight) || 1;
    const finalImageUrl = imageUrl || "assets/pcb.jpg";
    const finalResidentId = req.body.residentId || null;
    const finalHomeLat = homeLat ? parseFloat(homeLat) : 13.0827;
    const finalHomeLng = homeLng ? parseFloat(homeLng) : 80.2707;
    const finalShopName = shopName || "Sri Murugan Scrap Shop";
    const finalShopPhone = shopPhone || "9840123456";
    const finalShopLat = shopLat ? parseFloat(shopLat) : 13.0850;
    const finalShopLng = shopLng ? parseFloat(shopLng) : 80.2760;

    await run(`
      INSERT INTO pickup_requests (
        id, type, weight, imageUrl, residentId, residentName, residentPhone, residentNotes,
        homeArea, homeLat, homeLng, shopName, shopPhone, shopLat, shopLng,
        recyclerName, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Requested', ?, ?)
    `, [
      id,
      type,
      finalWeight,
      finalImageUrl,
      finalResidentId,
      residentName.trim(),
      residentPhone.trim(),
      residentNotes ? residentNotes.trim() : "",
      homeArea ? homeArea.trim() : "Local Area, Chennai",
      finalHomeLat,
      finalHomeLng,
      finalShopName,
      finalShopPhone,
      finalShopLat,
      finalShopLng,
      "Chennai Central Recycler Plant",
      now,
      now
    ]);

    const created = await get("SELECT * FROM pickup_requests WHERE id = ?", [id]);
    res.status(201).json({
      success: true,
      message: "Pickup request created successfully in SQLite database.",
      request: formatRequest(created)
    });
  } catch (err) {
    console.error("Error creating request:", err);
    res.status(500).json({ error: "Failed to save pickup request into database." });
  }
});

// -------------------------------------------------------------
// 5. PATCH /api/requests/:id/status - Advance 3-tier lifecycle
// -------------------------------------------------------------
router.patch("/requests/:id/status", async (req, res) => {
  try {
    const { status, shopName, shopPhone, recyclerName, residentNotes } = req.body;
    const existing = await get("SELECT * FROM pickup_requests WHERE id = ?", [req.params.id]);

    if (!existing) {
      return res.status(404).json({ error: "Pickup request not found." });
    }

    const updates = [];
    const params = [];

    if (status) {
      updates.push("status = ?");
      params.push(status);

      // Note: Household OTP is triggered on-demand by the Scrap Shop when arriving for verification
      if (status === "Shop Accepted") {
        updates.push("householdOtpVerified = ?");
        params.push(0);
      }

      // Auto-generate Scrap Shop Handover OTP when Recycler is assigned for collection
      if (status === "Recycler Assigned" && !existing.shopOtp) {
        const generatedShopOtp = Math.floor(1000 + Math.random() * 9000).toString();
        updates.push("shopOtp = ?");
        params.push(generatedShopOtp);
        updates.push("shopOtpVerified = ?");
        params.push(0);
      }
    }
    if (shopName) {
      updates.push("shopName = ?");
      params.push(shopName);
    }
    if (shopPhone) {
      updates.push("shopPhone = ?");
      params.push(shopPhone);
    }
    if (recyclerName) {
      updates.push("recyclerName = ?");
      params.push(recyclerName);
    }
    if (residentNotes) {
      updates.push("residentNotes = ?");
      params.push(residentNotes);
    }

    updates.push("updatedAt = ?");
    params.push(Date.now());

    params.push(req.params.id);

    await run(`UPDATE pickup_requests SET ${updates.join(", ")} WHERE id = ?`, params);

    const updated = await get("SELECT * FROM pickup_requests WHERE id = ?", [req.params.id]);
    res.json({
      success: true,
      message: `Status updated to '${status}' successfully.`,
      request: formatRequest(updated)
    });
  } catch (err) {
    console.error("Error updating request status:", err);
    res.status(500).json({ error: "Failed to update request status." });
  }
});

// -------------------------------------------------------------
// 6. POST /api/requests/:id/otp/verify - Verify OTP and advance state
// -------------------------------------------------------------
router.post("/requests/:id/otp/verify", async (req, res) => {
  try {
    const { tier, otp } = req.body;
    const existing = await get("SELECT * FROM pickup_requests WHERE id = ?", [req.params.id]);

    if (!existing) {
      return res.status(404).json({ error: "Pickup request not found." });
    }

    const inputCode = String(otp || "").trim();
    if (!inputCode) {
      return res.status(400).json({ error: "Please provide a valid 4-digit OTP." });
    }

    const now = Date.now();

    if (tier === "household") {
      const targetOtp = String(existing.householdOtp || "").trim();
      if (!targetOtp || inputCode !== targetOtp) {
        return res.status(400).json({
          error: "Invalid OTP! Please check the 4-digit code shown on the resident's screen or WhatsApp."
        });
      }

      // Mark verified & move into shop stock
      await run(`
        UPDATE pickup_requests
        SET householdOtpVerified = 1, status = 'In Shop', updatedAt = ?
        WHERE id = ?
      `, [now, req.params.id]);

      const updated = await get("SELECT * FROM pickup_requests WHERE id = ?", [req.params.id]);
      return res.json({
        success: true,
        message: "Household OTP verified successfully! Scrap collected into Scrap Shop stock.",
        request: formatRequest(updated)
      });
    }

    if (tier === "shop") {
      const targetOtp = String(existing.shopOtp || "").trim();
      if (!targetOtp || inputCode !== targetOtp) {
        return res.status(400).json({
          error: "Invalid OTP! Please check the 4-digit Handover OTP shown in the Scrap Shop portal."
        });
      }

      // Mark verified & complete certified recycling
      await run(`
        UPDATE pickup_requests
        SET shopOtpVerified = 1, status = 'Completed', updatedAt = ?
        WHERE id = ?
      `, [now, req.params.id]);

      const updated = await get("SELECT * FROM pickup_requests WHERE id = ?", [req.params.id]);
      return res.json({
        success: true,
        message: "Scrap Shop Handover OTP verified! Scrap lot is 100% Recycled.",
        request: formatRequest(updated)
      });
    }

    return res.status(400).json({ error: "Invalid tier specified. Must be 'household' or 'shop'." });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    res.status(500).json({ error: "Failed to verify OTP." });
  }
});

// -------------------------------------------------------------
// 7. POST /api/requests/:id/otp/send & /otp/resend - Generate/Send OTP to phone
// -------------------------------------------------------------
router.post(["/requests/:id/otp/send", "/requests/:id/otp/resend"], async (req, res) => {
  try {
    const { tier = "household" } = req.body;
    const existing = await get("SELECT * FROM pickup_requests WHERE id = ?", [req.params.id]);

    if (!existing) {
      return res.status(404).json({ error: "Pickup request not found." });
    }

    // Generate a 4-digit OTP guaranteed to be unique across all active requests
    const usedOtpsRows = await all("SELECT householdOtp, shopOtp FROM pickup_requests WHERE householdOtp IS NOT NULL OR shopOtp IS NOT NULL");
    const usedOtps = new Set();
    for (const r of usedOtpsRows) {
      if (r.householdOtp) usedOtps.add(String(r.householdOtp));
      if (r.shopOtp) usedOtps.add(String(r.shopOtp));
    }
    let newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    let attempts = 0;
    while (usedOtps.has(newOtp) && attempts < 100) {
      newOtp = Math.floor(1000 + Math.random() * 9000).toString();
      attempts++;
    }
    const now = Date.now();

    if (tier === "household") {
      await run(
        `UPDATE pickup_requests SET householdOtp = ?, householdOtpVerified = 0, updatedAt = ? WHERE id = ?`,
        [newOtp, now, req.params.id]
      );
      const phone = existing.residentPhone || "";
      return res.json({
        success: true,
        message: `OTP sent successfully to resident (+91 ${phone}).`,
        otp: newOtp,
        phone: phone,
        tier: "household"
      });
    }

    if (tier === "shop") {
      await run(
        `UPDATE pickup_requests SET shopOtp = ?, shopOtpVerified = 0, updatedAt = ? WHERE id = ?`,
        [newOtp, now, req.params.id]
      );
      const phone = existing.shopPhone || "";
      return res.json({
        success: true,
        message: `Handover OTP generated for Scrap Shop (+91 ${phone}).`,
        otp: newOtp,
        phone: phone,
        tier: "shop"
      });
    }

    return res.status(400).json({ error: "Invalid tier. Must be 'household' or 'shop'." });
  } catch (err) {
    console.error("Error generating/sending OTP:", err);
    res.status(500).json({ error: "Failed to send OTP." });
  }
});

// -------------------------------------------------------------
// 6. DELETE /api/requests - Delete all requests (bulk clear)
// -------------------------------------------------------------
router.delete("/requests", async (req, res) => {
  try {
    const result = await run("DELETE FROM pickup_requests");
    res.json({ success: true, message: `All requests cleared (${result.changes} records deleted).` });
  } catch (err) {
    console.error("Error clearing all requests:", err);
    res.status(500).json({ error: "Failed to clear requests." });
  }
});

// -------------------------------------------------------------
// 6B. DELETE /api/requests/:id - Delete a single request
// -------------------------------------------------------------
router.delete("/requests/:id", async (req, res) => {
  try {
    const result = await run("DELETE FROM pickup_requests WHERE id = ?", [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Request not found." });
    }
    res.json({ success: true, message: "Request deleted successfully." });
  } catch (err) {
    console.error("Error deleting request:", err);
    res.status(500).json({ error: "Failed to delete request." });
  }
});

// -------------------------------------------------------------
// 7. GET /api/shops - List registered scrap shops
// -------------------------------------------------------------
router.get("/shops", async (req, res) => {
  try {
    const shops = await all("SELECT * FROM scrap_shops ORDER BY name ASC");
    res.json(shops);
  } catch (err) {
    console.error("Error fetching shops:", err);
    res.status(500).json({ error: "Failed to fetch scrap shops." });
  }
});

module.exports = router;
