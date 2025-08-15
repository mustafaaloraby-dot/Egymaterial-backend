
import express from 'express';
import axios from 'axios';
import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

let cachedPrices = null;
let lastFetched = 0;
async function getPricesCached() {
  const now = Date.now();
  if (!cachedPrices || (now - lastFetched) > 60 * 60 * 1000) {
    console.log("Fetching fresh prices from Gemini...");
    cachedPrices = await fetchFromGemini(item); // your current Gemini fetch function
    lastFetched = now;
  } else {
    console.log("Using cached prices.");
  }
  return cachedPrices;
}


const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || process.env.GOOGLE_SEARCH_CX;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';

if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID || !GEMINI_API_KEY) {
  console.warn('⚠️ Missing one or more API keys: GOOGLE_API_KEY/GOOGLE_CSE_ID/GEMINI_API_KEY');
}

let cache = { updatedAt: null, items: [] };

async function fetchWithHeaders(url) {
 return axios.get(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9"
  }
});
}


function parseNum(s) {
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9.,]/g,'').replace(/,/g,''));
  return Number.isFinite(n) ? n : null;
}

function inferCategory(material='') {
  const m = material.toLowerCase();
  if (m.includes('cement') || m.includes('اسمنت')) return 'cement';
  if (m.includes('steel') || m.includes('rebar') || m.includes('حديد')) return 'steel';
  if (m.includes('concrete') || m.includes('خرسان')) return 'concrete';
  return 'other';
}
function inferUnit(category) {
  if (category==='concrete') return 'EGP/m3';
  if (category==='cement') return 'EGP/ton';
  if (category==='steel') return 'EGP/ton';
  return 'EGP/unit';
}

function dedupe(items) {
  const map = new Map();
async function fetchAllPrices() {
  for (const item of items) {
  try {
    const result = await fetchFromGemini(item);
    console.log(`✅ Got price for: ${item}`, result);
  } catch (err) {
    console.error(`❌ Failed to fetch: ${item}`, err.message);
  }
  await new Promise(res => setTimeout(res, 2000)); // delay to avoid 429
}
    const key = `${(it.material||'').toLowerCase()}|${(it.source||'').toLowerCase()}`;
    if (!map.has(key)) map.set(key, it);
  }
  return [...map.values()];
}


// Google Programmable Search
async function googleSearch(q, num=3) {
  const url = 'https://www.googleapis.com/customsearch/v1';
  const { data } = await axios.get(url, {
  params: { key: GOOGLE_API_KEY, cx: GOOGLE_CSE_ID, q, num },
  headers: { ...HEADERS },
  timeout: 15000
});
  return (data.items || []).map(i => ({ title: i.title, link: i.link, snippet: i.snippet }));
}

// Fetch page text for LLM
async function fetchPageText(url) {
  try {
    const { data } = await fetchWithHeaders(url, { headers: HEADERS, timeout: 15000, maxRedirects: 5, validateStatus: s=>s>=200 && s<400 });
    if (typeof data === 'string') {
      // crude text extraction
      const text = data.replace(/<script[\s\S]*?<\/script>/gi,'')
                       .replace(/<style[\s\S]*?<\/style>/gi,'')
                       .replace(/<[^>]*>/g,' ')
                       .replace(/\s+/g,' ')
                       .trim();
      return text.length > 12000 ? text.slice(0,12000) : text;
    }
    return '';
  } catch (e) {
    console.warn('Fetch fail:', url, e.message);
    return '';
  }
}

// Call Gemini for structured extraction
async function geminiExtract(text, url) {
  if (!text) return [];
  const prompt = `You are extracting **current Egypt construction material prices** from the TEXT below.
Return ONLY a JSON array. Each item fields:
- material (e.g., "Steel Rebar 10mm", "Ordinary Portland Cement", "Ready Mix Concrete 350")
- material_category: one of steel, cement, concrete, other
- price_text: the price string as shown
- price_numeric: number only (EGP)
- unit: "EGP/ton", "EGP/m3", or "EGP/bag" when appropriate
- currency: must be "EGP"
- source: short site/brand
Only include items where an EGP price is clearly stated.
TEXT (from ${url}):
${text}`;

  try {
    const body = {
      contents: [{ parts: [{ text: prompt }]}],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
    };
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const { data } = await axios.post(endpoint, body, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });
    const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    let arr;
    try { arr = JSON.parse(txt); }
    catch {
      const m = txt.match(/\[[\s\S]*\]/);
      arr = m ? JSON.parse(m[0]) : [];
    }
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('Gemini error:', e.message);
    return [];
  }
}

const QUERIES = [
  'steel rebar price Egypt today EGP',
  'اسعار الحديد اليوم في مصر',
  'cement price Egypt today EGP',
  'اسعار الاسمنت اليوم في مصر',
  'ready mix concrete price Egypt EGP',
  'اسعار الخرسانة الجاهزة اليوم في مصر'
];

import fs from 'fs';

const CACHE_FILE = './price_cache.json';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

async function updatePrices() {
  let cacheData = {};

  // Load cache if exists
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (err) {
      console.error("Error reading cache file:", err);
      cacheData = {};
    }
  }

  for (const q of QUERIES) {
    const lastFetch = cacheData[q]?.timestamp || 0;
    const isExpired = Date.now() - lastFetch > CACHE_DURATION;

    if (isExpired) {
      console.log(`🔍 Searching for: ${q}`);

      try {
        // Delay to avoid hitting Google API rate limit
        await new Promise(res => setTimeout(res, 2000));

        // Get top 3 results from Google Custom Search
        const hits = await googleSearch(q, 3);
        cacheData[q] = { timestamp: Date.now(), links: hits };
      } catch (e) {
        console.warn(`Search failed for "${q}"`, e.message);
        continue;
      }
    } else {
      console.log(`✅ Using cached results for: ${q}`);
    }

    // Fetch page text for each cached link
    const links = cacheData[q].links || [];
    for (const link of links) {
      try {
        const text = await fetchPageText(link.link);
        console.log(`📄 Got text from ${link}`);
        // Store or process price extraction here...
      } catch (e) {
        console.warn(`Failed to fetch ${link}`, e.message);
      }
    }
  }

  // Save updated cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
  console.log("💾 Cache saved.");
}
// Run once and then hourly
updatePrices();
cron.schedule('0 * * * *', updatePrices);

// API
// Then below in your routes:
// --- Gemini API fetch helper ---
async function fetchFromGemini(item) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `Get the latest ${item} prices in Egypt in EGP.` }]
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  // Return just the text Gemini generated
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No data found";
}
app.get('/getPrices', async (req, res) => {
  const prices = await getPricesCached();
  res.json(prices);
});
app.get('/', (req, res) => {
  res.json({ ok: true, count: cache.items.length, updatedAt: cache.updatedAt });
});

app.listen(PORT, () => console.log(`Gemini backend running on :${PORT}`));
