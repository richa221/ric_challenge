const { readFile } = require('node:fs/promises');
const { axios } = require('axios');
const { config } = require('./config.js');
const { axiosDefaults, readAxios } = require('./http.js');

const CLASSES = new Set(['commodity', 'treasury', 'real_estate', 'tokenized_fund']);
const METHODS = new Set(['token_spot', 'auction_price', 'appraisal_fx']);

function requireText(asset, field, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${asset.id || '(missing id)'} is missing ${field}`);
  }
}

function validateAssets(assets) {
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error('Asset catalog must be a non-empty array');
  }

  const ids = new Set();
  for (const asset of assets) {
    requireText(asset, 'id', asset?.id);
    if (ids.has(asset.id)) throw new Error(`Duplicate asset id ${asset.id}`);
    ids.add(asset.id);
    requireText(asset, 'name', asset.name);
    requireText(asset, 'issuer', asset.issuer);
    requireText(asset, 'jurisdiction', asset.jurisdiction);
    if (!CLASSES.has(asset.class)) {
      throw new Error(`${asset.id} has an unknown class`);
    }
    if (!METHODS.has(asset.pricing?.method)) {
      throw new Error(`${asset.id} has an unknown pricing method`);
    }

    if (asset.pricing.method === 'token_spot') {
      requireText(asset, 'token.coingeckoId', asset.token?.coingeckoId);
      requireText(asset, 'token.symbol', asset.token?.symbol);
      requireText(asset, 'pricing.unit', asset.pricing.unit);
      if (!Number.isFinite(asset.pricing.quantity) || asset.pricing.quantity < 0) {
        throw new Error(`${asset.id} quantity must be zero or greater`);
      }
    }

    if (asset.pricing.method === 'auction_price') {
      requireText(asset, 'pricing.securityType', asset.pricing.securityType);
      requireText(asset, 'pricing.securityTerm', asset.pricing.securityTerm);
      if (!Number.isFinite(asset.pricing.faceUsd) || asset.pricing.faceUsd <= 0) {
        throw new Error(`${asset.id} faceUsd must be a positive number`);
      }
    }

    if (asset.pricing.method === 'appraisal_fx') {
      requireText(asset, 'pricing.fxSymbol', asset.pricing.fxSymbol);
      if (!/^[A-Z]{3}$/.test(asset.pricing.fxSymbol)) {
        throw new Error(`${asset.id} fxSymbol must be a 3-letter currency code`);
      }
      if (!Number.isFinite(asset.pricing.appraisal) || asset.pricing.appraisal <= 0) {
        throw new Error(`${asset.id} appraisal must be a positive number`);
      }
    }
  }

  return assets;
}

async function loadAssets() {
  if (config.catalogUrl) {
    const data = await readAxios(axios.get(config.catalogUrl, axiosDefaults), config.catalogUrl);
    return validateAssets(data);
  }

  let raw;
  try {
    raw = await readFile(config.catalogPath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read asset catalog at ${config.catalogPath}: ${error.message}`);
  }

  return validateAssets(JSON.parse(raw));
}

module.exports = { validateAssets, loadAssets };
