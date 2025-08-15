import express from "express";
import puppeteer from "puppeteer";
import cron from "node-cron";

const app = express();
const PORT = process.env.PORT || 3000;
let pricesCache = [];

async function fetchPrices() {
  console.log("Scraping prices...");
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();

    // Pretend to be Chrome
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );

    await page.goto("https://example.com/material-prices", {
      waitUntil: "networkidle2",
      timeout: 0
    });

    // Extract prices (adjust selector to real site)
    const prices = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".price-row")).map(row => ({
        material: row.querySelector(".material-name")?.innerText.trim(),
        price: row.querySelector(".material-price")?.innerText.trim(),
      }));
    });

    pricesCache = prices;
    console.log("Updated prices:", pricesCache);

    await browser.close();
  } catch (err) {
    console.error("Scraping error:", err.message);
  }
}

app.get("/getPrices", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(pricesCache);
});

// Run every hour
cron.schedule("0 * * * *", fetchPrices);

// Run once at startup
fetchPrices();

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
