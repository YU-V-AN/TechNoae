const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

// Ensure data directory exists
const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "technova.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Failed to connect to SQLite database:", err.message);
  } else {
    console.log(`📦 Connected to SQLite open-source database at ${dbPath}`);
  }
});

// Helper functions returning Promises for clean async/await in routes
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}



const INITIAL_SHOPS = [
  {
    id: "shop_sri_murugan",
    name: "Sri Murugan Scrap Shop",
    phone: "9840123456",
    address: "No. 14, Wall Tax Road, Near Central Station",
    area: "Park Town, Chennai",
    lat: 13.0850,
    lng: 80.2760,
    createdAt: Date.now()
  },
  {
    id: "shop_anna_nagar",
    name: "Balaji Metal Scrap & Scrap Shop",
    phone: "9840998877",
    address: "2nd Avenue, Near Roundtana",
    area: "Anna Nagar, Chennai",
    lat: 13.0878,
    lng: 80.2170,
    createdAt: Date.now()
  }
];

// Initialize schema and seed data
async function initDb() {
  // Table: pickup_requests
  await run(`
    CREATE TABLE IF NOT EXISTS pickup_requests (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      weight REAL NOT NULL,
      imageUrl TEXT NOT NULL,
      residentId TEXT,
      residentName TEXT NOT NULL,
      residentPhone TEXT NOT NULL,
      residentNotes TEXT,
      homeArea TEXT,
      homeLat REAL DEFAULT 13.0827,
      homeLng REAL DEFAULT 80.2707,
      shopName TEXT DEFAULT 'Sri Murugan Scrap Shop',
      shopPhone TEXT DEFAULT '9840123456',
      shopLat REAL DEFAULT 13.0850,
      shopLng REAL DEFAULT 80.2760,
      recyclerName TEXT DEFAULT 'Chennai Central Recycler Plant',
      status TEXT NOT NULL DEFAULT 'Requested',
      householdOtp TEXT,
      householdOtpVerified INTEGER DEFAULT 0,
      shopOtp TEXT,
      shopOtpVerified INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  // Migrate existing table if columns don't exist yet
  try {
    await run(`ALTER TABLE pickup_requests ADD COLUMN residentId TEXT`);
  } catch (_) {}
  try {
    await run(`ALTER TABLE pickup_requests ADD COLUMN householdOtp TEXT`);
  } catch (_) {}
  try {
    await run(`ALTER TABLE pickup_requests ADD COLUMN householdOtpVerified INTEGER DEFAULT 0`);
  } catch (_) {}
  try {
    await run(`ALTER TABLE pickup_requests ADD COLUMN shopOtp TEXT`);
  } catch (_) {}
  try {
    await run(`ALTER TABLE pickup_requests ADD COLUMN shopOtpVerified INTEGER DEFAULT 0`);
  } catch (_) {}

  // Table: scrap_shops
  await run(`
    CREATE TABLE IF NOT EXISTS scrap_shops (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT,
      area TEXT,
      lat REAL,
      lng REAL,
      pin TEXT DEFAULT '1234',
      createdAt INTEGER NOT NULL
    )
  `);

  try {
    await run(`ALTER TABLE scrap_shops ADD COLUMN pin TEXT DEFAULT '1234'`);
  } catch (_) {}

  // Table: resident_users
  await run(`
    CREATE TABLE IF NOT EXISTS resident_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      pin TEXT NOT NULL DEFAULT '1234',
      createdAt INTEGER NOT NULL
    )
  `);



  // Seed shops if empty
  const shopCountRow = await get("SELECT COUNT(*) AS total FROM scrap_shops");
  if (shopCountRow && shopCountRow.total === 0) {
    console.log("🌱 Seeding registered scrap shops into SQLite...");
    for (const shop of INITIAL_SHOPS) {
      await run(`
        INSERT INTO scrap_shops (id, name, phone, address, area, lat, lng, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        shop.id, shop.name, shop.phone, shop.address, shop.area, shop.lat, shop.lng, shop.createdAt
      ]);
    }
    console.log(`✅ Seeded ${INITIAL_SHOPS.length} scrap shops into SQLite.`);
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb
};
