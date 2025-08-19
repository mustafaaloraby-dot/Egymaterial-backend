import express from "express";
import axios from "axios";
import fs from "fs";

const app = express();
const PORT = 3000;

// --- CONFIG ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CACHE_FILE = "./price_cache.json";

// --- Materials to track ---
const items = [
  "steel rebar price Egypt today EGP",
  "cement price Egypt today EGP"
];

// --- Gemini API fetch helper ---
async function fetchFromGemini(item) {
  if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: `Get the latest ${item} from Egypt websites in EGP. Only return a number followed by 'EGP'.`
          }
        ]
      }
    ]
  };

  try {
    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" }
    });

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    console.error(`❌ Gemini API error for "${item}":`, err.message);
    return null;
  }
}

// --- Update prices with caching ---
async function updatePrices() {
  let cacheData = {};

  // Load cache
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    } catch (err) {
      console.error("⚠️ Failed to read cache:", err.message);
      cacheData = {};
    }
  }

  // Fetch fresh prices if needed
  for (const item of items) {
    if (cacheData[item]) {
      console.log(`✅ Using cached results for: ${item}`);
    } else {
      console.log(`🔄 Fetching fresh price for: ${item}`);
      const price = await fetchFromGemini(item);
      cacheData[item] = price || "Not found";
    }
  }

  // Save updated cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
  console.log("💾 Cache saved.");

  return cacheData; // ✅ always return
}

// --- Express route ---
app.get("/get-prices", async (req, res) => {
  try {
    const results = await updatePrices();
    res.json({ ok: true, data: results, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Error in /get-prices:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
