const axios = require('axios');
const { cached } = require('../cache.js');
const { config } = require('../config.js');
const { axiosDefaults, optional, readAxios } = require('../http.js');

function assertIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('At least one CoinGecko id is required');
  }
  for (const id of ids) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid CoinGecko id ${id}`);
  }
}

function geckoConfig(params) {
  const headers = { ...axiosDefaults.headers };
  if (config.coingeckoApiKey) headers['x-cg-demo-api-key'] = config.coingeckoApiKey;
  return { ...axiosDefaults, headers, params };
}

async function fetchTokenPrices(ids) {
  const url = `${config.coingeckoBase}/simple/price`;
  return readAxios(
    axios.get(url, geckoConfig({
      ids: ids.join(','),
      vs_currencies: 'usd',
      include_last_updated_at: true,
    })),
    url,
  );
}

async function fetchTokenMarkets(ids) {
  const url = `${config.coingeckoBase}/coins/markets`;
  return readAxios(
    axios.get(url, geckoConfig({
      vs_currency: 'usd',
      ids: ids.join(','),
      price_change_percentage: '24h',
    })),
    url,
  );
}

async function fetchTokenProfile(id) {
  const url = `${config.coingeckoBase}/coins/${id}`;
  return readAxios(
    axios.get(url, geckoConfig({
      localization: false,
      tickers: false,
      market_data: false,
      community_data: false,
      developer_data: false,
      sparkline: false,
    })),
    url,
  );
}

function getTokenPrices(ids) {
  assertIds(ids);
  const key = `tokens:price:${ids.slice().sort().join(',')}`;
  return cached(key, config.cacheTtlMs, () => fetchTokenPrices(ids));
}

function getTokenMarkets(ids) {
  assertIds(ids);
  const key = `tokens:markets:${ids.slice().sort().join(',')}`;
  return cached(key, config.cacheTtlMs, () => fetchTokenMarkets(ids));
}

function getTokenProfile(id) {
  assertIds([id]);
  return cached(`tokens:profile:${id}`, config.cacheTtlMs, () => fetchTokenProfile(id));
}

async function getTokenBoard(ids) {
  assertIds(ids);
  const profileId = ids.includes('pax-gold') ? 'pax-gold' : ids[0];
  const [prices, markets, profile] = await Promise.all([
    getTokenPrices(ids),
    optional('CoinGecko markets', () => getTokenMarkets(ids)),
    optional(`${profileId} profile`, () => getTokenProfile(profileId)),
  ]);

  const quotes = {};
  if (markets.ok) {
    for (const row of markets.data) {
      quotes[row.id] = {
        change24hPercent: row.price_change_percentage_24h,
      };
    }
  }

  const normalizedPrices = {};
  for (const id of ids) {
    const usd = prices[id]?.usd;
    if (!Number.isFinite(usd)) throw new Error(`CoinGecko returned no USD price for ${id}`);
    const updated = prices[id].last_updated_at;
    normalizedPrices[id] = {
      usd,
      lastUpdatedAt: Number.isFinite(updated) ? new Date(updated * 1000).toISOString() : null,
    };
  }

  const warnings = [];
  if (!markets.ok) warnings.push(markets.error);
  if (!profile.ok) warnings.push(profile.error);

  let reference = null;
  if (profile.ok) {
    const data = profile.data;
    reference = {
      id: data.id,
      symbol: data.symbol,
      name: data.name,
      ethereumAddress: data.platforms?.ethereum || null,
    };
  }

  return {
    source: 'CoinGecko',
    prices: normalizedPrices,
    quotes,
    reference,
    warnings,
  };
}

module.exports = { getTokenBoard };
