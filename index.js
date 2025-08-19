import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000; // ✅ Render provides PORT
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- Materials to track ---
const items = [
  "steel rebar price Egypt today EGP",
  "cement price Egypt today EGP"
];

// --- In-memory cache (resets when container restarts) ---
let cacheData = {};

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

// --- Update prices with cache ---
async function updatePrices() {
  for (const item of items) {
    if (cacheData[item]) {
      console.log(`✅ Using cached results for: ${item}`);
    } else {
      console.log(`🔄 Fetching fresh price for: ${item}`);
      const price = await fetchFromGemini(item);
      cacheData[item] = price || "Not found";
    }
  }
  return cacheData;
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

// --- Health check (Render needs this sometimes) ---
app.get("/", (req, res) => {
  res.send("✅ Egymaterial backend running on Render");
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
