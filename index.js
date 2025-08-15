import express from "express";
import fetch from "node-fetch";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

let pricesCache = {
  lastUpdated: null,
  data: []
};

// Fetch prices from Gemini AI
async function fetchPricesWithGemini() {
  try {
    console.log("🔄 Fetching prices from Gemini AI...");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Provide the latest steel rebar, cement, and other major building material prices in Egypt in EGP per ton, in JSON format with fields: material, price, unit, and source."
                }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) throw new Error(`Gemini API Error: ${response.status}`);

    const data = await response.json();
    const text = data.candidates[0]?.content?.parts[0]?.text || "{}";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error("⚠️ Failed to parse Gemini JSON response. Raw text:", text);
      return;
    }

    pricesCache = {
      lastUpdated: new Date().toISOString(),
      data: parsed
    };

    console.log("✅ Prices updated via Gemini AI");

  } catch (error) {
    console.error("❌ Error fetching prices via Gemini:", error.message);
  }
}

// Run every hour
cron.schedule("0 * * * *", fetchPricesWithGemini);

// API endpoint to get prices
app.get("/getPrices", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(pricesCache);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Gemini backend running on port ${PORT}`);
  fetchPricesWithGemini(); // Fetch on startup
});
