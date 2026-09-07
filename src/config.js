const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

try {
  const text = readFileSync(join(root, '.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] == null) process.env[key] = value;
  }
} catch {
  // .env is optional. Shell variables still apply.
}

function integer(name, fallback) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

const config = {
  root,
  port: integer('PORT', 8787),
  httpTimeoutMs: integer('HTTP_TIMEOUT_MS', 15_000),
  cacheTtlMs: integer('CACHE_TTL_MS', 60_000),
  frankfurterBase: process.env.FRANKFURTER_BASE || 'https://api.frankfurter.app',
  treasuryBase: process.env.TREASURY_BASE || 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service',
  coingeckoBase: process.env.COINGECKO_BASE || 'https://api.coingecko.com/api/v3',
  coingeckoApiKey: process.env.COINGECKO_API_KEY || '',
  catalogUrl: process.env.ASSET_CATALOG_URL || '',
  catalogPath: join(root, 'data', 'assets.json'),
};

module.exports = { config };
