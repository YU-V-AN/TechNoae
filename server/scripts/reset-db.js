const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "..", "data", "technova.db");
const uploadsDir = path.join(__dirname, "..", "uploads");

console.log("=========================================");
console.log(" TechNova Database & Data Reset Utility ");
console.log("=========================================");

if (!fs.existsSync(dbPath)) {
  console.log("ℹ️ No database file found at:", dbPath);
  console.log("The database is already clean.");
  process.exit(0);
}

const args = process.argv.slice(2);
const keepUsers = args.includes("--keep-users");

const db = new sqlite3.Database(dbPath, async (err) => {
  if (err) {
    console.error("❌ Failed to open database:", err.message);
    process.exit(1);
  }

  // 1. Wipe all pickup requests
  db.run("DELETE FROM pickup_requests", function (err) {
    if (err) {
      console.error("❌ Error clearing pickup_requests:", err.message);
    } else {
      console.log(`✅ Cleared ${this.changes} scrap pickup requests/lots.`);
    }

    // 2. Wipe resident accounts (unless --keep-users is specified)
    if (!keepUsers) {
      db.run("DELETE FROM resident_users", function (err) {
        if (err) {
          console.error("❌ Error clearing resident_users:", err.message);
        } else {
          console.log(`✅ Cleared ${this.changes} registered resident accounts.`);
        }
        cleanUploadsAndFinish();
      });
    } else {
      console.log("ℹ️ Keeping registered resident accounts (--keep-users flag used).");
      cleanUploadsAndFinish();
    }
  });

  function cleanUploadsAndFinish() {
    // 3. Clean uploaded scrap images
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      let deleted = 0;
      for (const file of files) {
        if (file !== ".gitkeep") {
          try {
            fs.unlinkSync(path.join(uploadsDir, file));
            deleted++;
          } catch (_) {}
        }
      }
      console.log(`✅ Removed ${deleted} uploaded image file(s) from server/uploads/.`);
    }

    db.close(() => {
      console.log("-----------------------------------------");
      console.log("✨ All entered test data has been successfully deleted!");
      console.log("=========================================");
    });
  }
});
