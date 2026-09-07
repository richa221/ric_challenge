# RWA Ledger

Indicative net asset value for a small real-world asset book. Every external read is an `axios.get` against a public feed:

- European Central Bank foreign-exchange rates, via [Frankfurter](https://www.frankfurter.app/)
- U.S. Treasury average interest rates, bill and note auctions, and debt to the penny, via [Fiscal Data](https://fiscaldata.treasury.gov/)
- Tokenized gold (PAXG, XAUT) and the USDY fund, via [CoinGecko](https://www.coingecko.com/)

Marks are indicative. Auction prices refer to the latest completed auction of that term, not a CUSIP held in custody. Property values are local-currency appraisals converted at the ECB spot rate.

## Run

```bash
npm install
npm start
```

`npm start` opens the ledger at <http://localhost:8787>. If that port is already in use, it uses the next free port.

Copy `.env.example` to `.env` only if you want another port, a remote asset catalog, or a CoinGecko demo key. The sample book in `data/assets.json` runs with no keys. A remote catalog, when `ASSET_CATALOG_URL` is set, is loaded with `axios.get`.

## Pricing

| Method | Used for | Mark |
| --- | --- | --- |
| `token_spot` | Allocated gold, tokenized fund | quantity × CoinGecko USD price |
| `auction_price` | Treasury bills and notes | face × latest auction high price / 100 |
| `appraisal_fx` | Real estate | local appraisal ÷ currency units per USD |

Bill positions include `modelPricePer100`, the actual/360 price `100 × (1 − discount rate × days / 360)`, next to the auction high price. Responses are cached in memory for `CACHE_TTL_MS` (default 60 seconds).

## HTTP API

- `GET /api/health`
- `GET /api/assets`
- `GET /api/valuation`
