# Egymaterial — Gemini + Google Search Backend

Finds Egypt construction material prices (steel, cement, concrete) via **Google Custom Search** + **Gemini AI**,
updates hourly, and serves JSON.

## Setup
1) Install Node 18+ from https://nodejs.org
2) Unzip this folder
3) Install deps:
   ```bash
   npm install
   cp .env.example .env  # then fill keys
   npm start
   ```
4) Endpoints:
   - `GET /` — health
   - `GET /getPrices` — array of price items

## Keys
- `GOOGLE_API_KEY` — from Google Cloud Console (enable **Custom Search API**)
- `GOOGLE_CSE_ID` — from Programmable Search (set to "Search the entire web")
- `GEMINI_API_KEY` — from Google AI Studio (model default: `gemini-1.5-flash-latest`)

## Notes
- The backend de-duplicates by material+source and only keeps **EGP** prices.
- If no fresh data is found, it returns **cached** or a small **demo** set (so you never get an empty response).
- Adjust the `QUERIES` array in `index.js` to broaden/narrow materials.
