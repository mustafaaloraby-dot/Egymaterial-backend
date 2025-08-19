import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 10000;
const CACHE_FILE = path.join(process.cwd(), "cache.json");

// Items we want to fetch prices for
const items = [
  "steel rebar price Egypt today EGP",
  "cement price Egypt today EGP"
];

// --- Gemini API fetcher ---
async function fetchFromGemini(query) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: query }]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // ✅ Extract first candidate’s text
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No result";
  } catch (err) {
    console.error(`❌ Gemini API error for "${query}":`, err.message);
    return null;
  }
}

// --- Cache-aware price fetch ---
async function getPricesCached() {
  let cacheData = {};

  if (fs.existsSync(CACHE_FILE)) {
    try {
      cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    } catch (err) {
      console.error("⚠️ Failed to read cache:", err.message);
      cacheData = {};
    }
  }

  let results = {};

  for (const item of items) {
    if (cacheData[item]) {
      console.log(`✅ Using cached results for: ${item}`);
      results[item] = cacheData[item];
    } else {
      console.log(`🔄 Fetching fresh price for: ${item}`);
      const price = await fetchFromGemini(item);
      results[item] = price || "Not found";
      cacheData[item] = results[item];
    }
  }

  // Save updated cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
  console.log("💾 Cache saved.");

  return results;
}

// --- Express route ---
app.get("/get-prices", async (req, res) => {
  try {
    const data = await getPricesCached();
    res.json({ ok: true, data });
  } catch (err) {
    console.error("❌ Error in /get-prices:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
