import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const CACHE_FILE = path.resolve("cache.json");

// --- Load cache if exists ---
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

// --- Save cache ---
function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// --- Call Gemini API ---
async function fetchGeminiPrice(query) {
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + process.env.GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }] }]
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No price found";
  } catch (err) {
    console.error(`❌ Gemini API error for "${query}":`, err.message);
    return null;
  }
}

// --- Cache-aware fetch ---
async function getPricesCached(items) {
  let cache = loadCache();
  let results = {};

  for (const item of items) {
    if (cache[item] && Date.now() - cache[item].timestamp < 6 * 60 * 60 * 1000) {
      // use cached value if < 6 hours old
      results[item] = cache[item].value;
    } else {
      console.log(`🔄 Fetching fresh price for: ${item}`);
      const price = await fetchGeminiPrice(item);
      if (price) {
        results[item] = price;
        cache[item] = { value: price, timestamp: Date.now() };
      }
    }
  }

  saveCache(cache);
  return results;
}

// --- API Route ---
app.get("/get-prices", async (req, res) => {
  const items = [
    "steel rebar price Egypt today EGP",
    "cement price Egypt today EGP"
  ];

  const results = await getPricesCached(items);
  res.json({ ok: true, data: results });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
