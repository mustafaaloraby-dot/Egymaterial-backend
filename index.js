import express from "express";
import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

const CACHE_FILE = "./cache.json";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- Gemini fetch function ---
async function fetchGeminiPrice(query) {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: query }]
            }
          ]
        })
      }
    );

    if (!resp.ok) {
      throw new Error(`Gemini API error: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No answer";
  } catch (err) {
    console.error(`❌ Gemini API error for "${query}":`, err.message);
    return null;
  }
}

// --- Cache-aware price fetch ---
async function getPricesCached() {
  let cacheData = {};

  // Load cache
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    } catch {
      cacheData = {};
    }
  }

  const now = Date.now();
  const queries = [
    "steel rebar price Egypt today EGP",
    "cement price Egypt today EGP"
  ];

  const results = {};
  for (const q of queries) {
    const cached = cacheData[q];

    // Use cache if < 1 hour old
    if (cached && now - cached.timestamp < 60 * 60 * 1000) {
      results[q] = cached.value;
    } else {
      console.log("🔄 Fetching fresh price for:", q);
      const val = await fetchGeminiPrice(q);
      results[q] = val;
      cacheData[q] = { value: val, timestamp: now };
    }
  }

  // Save updated cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
  console.log("💾 Cache saved.");
  return results;
}

// --- API route ---
app.get("/get-prices", async (req, res) => {
  const prices = await getPricesCached();
  res.json({ ok: true, data: prices });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
