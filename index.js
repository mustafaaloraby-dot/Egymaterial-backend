import express from 'express';
import axios from 'axios';
import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

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
      "Accept-Language": "en-US,en;q=0.9",
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
  for (const it of items) {
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
    headers: HEADERS, timeout: 15000
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

async function updatePrices() {
  console.log('🔄 Updating prices...');
  let results = [];
  for (const q of QUERIES) {
    let hits = [];
    try { hits = await googleSearch(q, 3); } catch (e) { console.warn('Search failed for', q, e.message); }
    for (const h of hits) {
      const text = await fetchPageText(h.link);
      const items = await geminiExtract(text, h.link);
      for (const x of items) {
        const cat = x.material_category || inferCategory(x.material);
        const price = x.price_numeric || parseNum(x.price_text);
        if (!price) continue;
        if (x.currency && String(x.currency).toUpperCase() !== 'EGP') continue;
        results.push({
          material: x.material || 'Unknown',
          material_category: cat,
          price,
          unit: x.unit || inferUnit(cat),
          currency: 'EGP',
          source: x.source || new URL(h.link).hostname,
          url: h.link,
          price_text: x.price_text,
          timestamp: new Date().toISOString()
        });
      }
    }
  }
  results = dedupe(results);
  if (!results.length) {
    // fallback demo / cached
    if (cache.items.length) {
      cache.items = cache.items.map(i => ({ ...i, stale: true, timestamp: new Date().toISOString() }));
      console.warn('No new items; serving cached (stale)');
    } else {
      cache.items = [
        { material: 'Steel Rebar', material_category: 'steel', price: 38200, unit: 'EGP/ton', currency: 'EGP', source: 'Demo', url: 'about:demo', timestamp: new Date().toISOString(), demo: true },
        { material: 'Cement (Ordinary)', material_category: 'cement', price: 1850, unit: 'EGP/ton', currency: 'EGP', source: 'Demo', url: 'about:demo', timestamp: new Date().toISOString(), demo: true },
        { material: 'Ready Mix Concrete 350', material_category: 'concrete', price: 750, unit: 'EGP/m3', currency: 'EGP', source: 'Demo', url: 'about:demo', timestamp: new Date().toISOString(), demo: true }
      ];
      console.warn('No data; serving demo items');
    }
  } else {
    cache.items = results;
  }
  cache.updatedAt = new Date().toISOString();
  console.log('✅ Update finished. Items:', cache.items.length);
}

// Run once and then hourly
updatePrices();
cron.schedule('0 * * * *', updatePrices);

// API
app.get('/getPrices', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(cache.items);
});
app.get('/', (req, res) => {
  res.json({ ok: true, count: cache.items.length, updatedAt: cache.updatedAt });
});

app.listen(PORT, () => console.log(`Gemini backend running on :${PORT}`));
