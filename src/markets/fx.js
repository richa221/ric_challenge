const axios = require('axios');
const { cached } = require('../cache.js');
const { config } = require('../config.js');
const { isoDaysAgo, isoToday } = require('../dates.js');
const { axiosDefaults, readAxios } = require('../http.js');
const { percentChange } = require('../series.js');

function assertSymbols(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('At least one FX symbol is required');
  }
  for (const symbol of symbols) {
    if (!/^[A-Z]{3}$/.test(symbol)) {
      throw new Error(`Invalid FX symbol ${symbol}`);
    }
  }
}

async function fetchCurrencies() {
  const url = `${config.frankfurterBase}/currencies`;
  return readAxios(axios.get(url, axiosDefaults), url);
}

async function fetchSpotRates(symbols) {
  const url = `${config.frankfurterBase}/latest`;
  return readAxios(
    axios.get(url, {
      ...axiosDefaults,
      params: { from: 'USD', to: symbols.join(',') },
    }),
    url,
  );
}

async function fetchRateHistory(symbols, start, end) {
  const url = `${config.frankfurterBase}/${start}..${end}`;
  return readAxios(
    axios.get(url, {
      ...axiosDefaults,
      params: { from: 'USD', to: symbols.join(',') },
    }),
    url,
  );
}

function historyFor(payload, symbol) {
  const dates = Object.keys(payload.rates || {}).sort();
  const points = [];
  for (const date of dates) {
    const bucket = payload.rates[date];
    const perUsd = typeof bucket === 'number' ? bucket : bucket?.[symbol];
    if (Number.isFinite(perUsd)) points.push({ date, perUsd });
  }
  if (points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  return {
    startDate: start.date,
    endDate: end.date,
    start: start.perUsd,
    end: end.perUsd,
    changePercent: percentChange(start.perUsd, end.perUsd),
    points,
  };
}

function getCurrencies() {
  return cached('fx:currencies', config.cacheTtlMs, fetchCurrencies);
}

function getSpotRates(symbols) {
  assertSymbols(symbols);
  const key = `fx:spot:${symbols.slice().sort().join(',')}`;
  return cached(key, config.cacheTtlMs, () => fetchSpotRates(symbols));
}

function getRateHistory(symbols, start = isoDaysAgo(90), end = isoToday()) {
  assertSymbols(symbols);
  const key = `fx:history:${start}:${end}:${symbols.slice().sort().join(',')}`;
  return cached(key, config.cacheTtlMs, () => fetchRateHistory(symbols, start, end));
}

async function getFxBoard(symbols) {
  assertSymbols(symbols);
  const [currencies, spot, history] = await Promise.all([
    getCurrencies(),
    getSpotRates(symbols),
    getRateHistory(symbols),
  ]);

  const rates = {};
  for (const symbol of symbols) {
    const perUsd = spot.rates?.[symbol];
    if (!Number.isFinite(perUsd)) {
      throw new Error(`Frankfurter returned no USD rate for ${symbol}`);
    }
    rates[symbol] = {
      perUsd,
      name: currencies[symbol] || symbol,
      history: historyFor(history, symbol),
    };
  }

  return {
    source: 'European Central Bank via Frankfurter',
    date: spot.date,
    base: 'USD',
    rates,
  };
}

module.exports = { getFxBoard };
