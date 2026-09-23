# Tech Nova — 3-Tier Indian E-Waste Recycling Ecosystem ♻️

An intelligent, community-driven e-waste scrap collection and recycling platform connecting local households, neighbourhood scrap shops (local scrap collecting shops / இரும்பு கடை / Kabadiwala), and certified industrial recycling plants.

---

## 🌟 Key Features

1. **3-Tier Indian Recycling Supply Chain**:
   - **Tier 1 — Home Resident**: Submits doorstep scrap requests with photos, estimated weight, and pinned location.
   - **Tier 2 — Scrap Shop**: Local scrap shopkeeper accepts nearby home requests, collects scrap to the shop, aggregates inventory, and requests bulk industrial dispatch.
   - **Tier 3 — Authorized Industrial Recycler**: Dispatches transport trucks to collect bulk lots from local scrap shops for certified 100% recycling.

2. **100% Free & Open-Source Database (SQLite3)**:
   - Zero cloud subscriptions, zero billing, zero credit card requirements, and zero proprietary lock-in.
   - Self-contained persistent database located at `server/data/technova.db` with ACID-compliant transactions and REST API endpoints.

3. **9 Pan-Indian Languages**:
   - Native multi-language support across **English, Tamil (தமிழ்), Hindi (हिंदी), Telugu (తెలుగు), Kannada (ಕನ್ನಡ), Marathi (मराठी), Bengali (বাংলা), Gujarati (ગુજરાતી), and Malayalam (മലയാളം)**.

4. **1-Card Material Swiper & Doorstep Form**:
   - Touch gestures, auto-swiping, and full-width card presentation for **PCBs / Motherboards**, **Copper Cables & Wires**, **Batteries**, **Display Screens / Monitors**, and **Mixed Electronic Scrap**.

5. **Direct Call & WhatsApp Communication**:
   - Integrated 1-click phone call (`tel:`) and WhatsApp (`wa.me`) between residents, scrap collectors, and industrial recycling plants.

6. **Interactive Leaflet Maps & Geocoding**:
   - Pin home locations, search pincodes/landmarks, and view real-time aggregation hubs across Chennai and Tamil Nadu.

7. **Free Local Image Storage**:
   - Photos uploaded via **Multer** directly into `server/uploads/` at zero cost with canvas compression fallbacks.

8. **AI Recycling Assistant**:
   - Built-in assistant guiding users on material categorization and safe disposal rules in their native Indian language.

---

## 🚀 How to Run the Project

### Full Node.js Backend & Client

```bash
# 1. Navigate to the server folder
cd server

# 2. Install dependencies (if not already done)
npm install

# 3. Start the server
npm start
```

Open **`http://localhost:5000`** in your browser!

---

## 📁 Project Structure

```
TechNoae/
├── client/                     # Frontend web application
│   ├── assets/                 # Brand logos and photographic category assets
│   │   ├── battery.jpg
│   │   ├── logo.png
│   │   ├── pcb.jpg
│   │   ├── screen.jpg
│   │   └── wires.jpg
│   ├── index.html              # Single-page application
│   ├── style.css               # Responsive stylesheet with single-column overflow protection
│   └── js/
│       ├── app.js              # 3-tier lifecycle UI, REST API calls, Leaflet maps
│       └── translations.js     # 9 Indian language dictionaries (99 keys each)
│
├── server/                     # Standalone Express & SQLite backend
│   ├── package.json            # Dependencies (express, sqlite3, multer, cors, dotenv)
│   ├── server.js               # Express server & static hosting
│   ├── data/
│   │   └── technova.db         # Persistent SQLite database file
│   ├── db/
│   │   └── database.js         # SQLite schema initialization and query helpers
│   ├── routes/
│   │   ├── ai.js               # Gemini AI assistant proxy route
│   │   └── requests.js         # Pickup requests & scrap shop REST API
│   ├── uploads/                # Local scrap image storage folder
│   └── .env                    # Environment settings (PORT, GEMINI_API_KEY)
│
└── README.md                   # Project documentation
```

---

## 🗄️ Database & REST API Architecture

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/requests` | Fetch all requests sorted newest first |
| `GET` | `/api/requests/:id` | Fetch single request details |
| `POST` | `/api/requests` | Create new doorstep pickup request |
| `PATCH` | `/api/requests/:id/status` | Advance lifecycle status (`Requested` ➔ `Shop Accepted` ➔ `In Shop` ➔ `Recycler Assigned` ➔ `Completed`) |
| `GET` | `/api/requests/stats` | Aggregated statistics (total weight, completed count, leaderboard) |
| `GET` | `/api/shops` | List registered scrap shops |
| `POST` | `/api/upload` | Free local file upload for scrap photos |
| `POST` | `/api/chat` | AI recycling guidance endpoint |

---

## 🔒 Free & Open Source

This project uses **zero proprietary cloud databases or services**. Everything runs self-contained on your machine or any VPS/hosting environment.
