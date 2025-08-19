import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Cache file path
const CACHE_FILE = path.join(process.cwd(), "priceCache.json");

// --- Fetch price from Gemini ---
async function fetchFromGemini(query) {
  try {
    console.log(`🔄 Fetching fresh price for: ${query}`);

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: `Give me only the latest ${query}, number only, no words.` }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      console.error(
        `❌ Gemini API error for "${query}": ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = await response.json();
    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Not found"
    );
  } catch (err) {
    console.error(`❌ Error fetching from Gemini for "${query}":`, err.message);
    return null;
  }
}

// --- Cache-aware fetch ---
async function getPricesCached() {
  let cacheData = {};
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    } catch (err) {
      console.error("⚠️ Failed to read cache:", err.message);
    }
  }

  const queries = [
    "steel rebar price Egypt today EGP",
    "cement price Egypt today EGP"
  ];

  const results = {};
  for (const query of queries) {
    if (cacheData[query]) {
      console.log(`✅ Using cached results for: ${query}`);
      results[query] = cacheData[query];
    } else {
      results[query] = await fetchFromGemini(query);
      cacheData[query] = results[query];
    }
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
  console.log("💾 Cache saved.");
  return results;
}

// --- Express Routes ---
app.get("/", (req, res) => {
  res.send("✅ Backend is running. Use /get-prices to fetch data.");
});

app.get("/get-prices", async (req, res) => {
  const prices = await getPricesCached();
  res.json({ ok: true, data: prices });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
