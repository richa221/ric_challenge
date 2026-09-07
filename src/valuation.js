const { formatNumber, formatUsd } = require('./format.js');
const { billPriceFromDiscountRate, markAppraisal, markAuctionPrice, markTokenSpot } = require('./marks.js');
const { getFxBoard } = require('./markets/fx.js');
const { getTreasuryBoard } = require('./markets/treasuries.js');
const { getTokenBoard } = require('./markets/tokens.js');
const { loadAssets } = require('./registry.js');
const { percentChange } = require('./series.js');

const CLASS_LABELS = {
  commodity: 'Commodity',
  treasury: 'Treasury',
  real_estate: 'Real estate',
  tokenized_fund: 'Tokenized fund',
};

const DISCLAIMER = 'Indicative marks from public feeds. Not a custody statement, appraisal, or offer to sell securities.';

function collectRequirements(assets) {
  const fxSymbols = new Set();
  const tokenIds = new Set();
  const auctions = [];

  for (const asset of assets) {
    if (asset.pricing.method === 'token_spot') tokenIds.add(asset.token.coingeckoId);
    if (asset.pricing.method === 'appraisal_fx') fxSymbols.add(asset.pricing.fxSymbol);
    if (asset.pricing.method === 'auction_price') {
      auctions.push({
        securityType: asset.pricing.securityType,
        securityTerm: asset.pricing.securityTerm,
      });
    }
  }

  return {
    fxSymbols: [...fxSymbols],
    tokenIds: [...tokenIds],
    auctions,
  };
}

function basePosition(asset) {
  return {
    id: asset.id,
    name: asset.name,
    class: asset.class,
    classLabel: CLASS_LABELS[asset.class],
    issuer: asset.issuer,
    jurisdiction: asset.jurisdiction,
    currency: asset.currency,
    location: asset.location || null,
    token: asset.token
      ? {
        symbol: asset.token.symbol,
        network: asset.token.network || null,
        coingeckoId: asset.token.coingeckoId || null,
      }
      : null,
    method: asset.pricing.method,
  };
}

function markTokenAsset(asset, tokens) {
  const id = asset.token.coingeckoId;
  const priceUsd = tokens.prices[id].usd;
  const mark = markTokenSpot({
    quantity: asset.pricing.quantity,
    priceUsd,
    unit: asset.pricing.unit,
  });
  return {
    ...basePosition(asset),
    navUsd: mark.navUsd,
    change24hPercent: tokens.quotes[id]?.change24hPercent ?? null,
    summary: `${formatNumber(mark.quantity, 2)} ${mark.unit} at ${formatUsd(mark.priceUsd)}`,
    inputs: {
      coingeckoId: id,
      quantity: mark.quantity,
      unit: mark.unit,
      priceUsd: mark.priceUsd,
      lastUpdatedAt: tokens.prices[id].lastUpdatedAt,
    },
  };
}

function markAuctionAsset(asset, treasuries) {
  const key = `${asset.pricing.securityType}:${asset.pricing.securityTerm}`;
  const auction = treasuries.auctions[key];
  if (!auction) throw new Error(`${asset.id} has no auction quote for ${key}`);

  const mark = markAuctionPrice({
    faceUsd: asset.pricing.faceUsd,
    pricePer100: auction.pricePer100,
  });

  let modelPricePer100 = null;
  if (auction.discountRatePercent != null && Number.isFinite(asset.pricing.dayCount)) {
    modelPricePer100 = billPriceFromDiscountRate({
      discountRatePercent: auction.discountRatePercent,
      days: asset.pricing.dayCount,
    });
  }

  return {
    ...basePosition(asset),
    navUsd: mark.navUsd,
    summary: `Face ${formatUsd(mark.faceUsd)} at ${formatNumber(mark.pricePer100, 6)} (${auction.securityTerm} auction ${auction.auctionDate})`,
    inputs: {
      ...auction,
      faceUsd: mark.faceUsd,
      modelPricePer100,
      dayCount: asset.pricing.dayCount || null,
    },
  };
}

function markProperty(asset, fx) {
  const symbol = asset.pricing.fxSymbol;
  const rate = fx.rates[symbol];
  if (!rate) throw new Error(`${asset.id} has no FX rate for ${symbol}`);
  const mark = markAppraisal({
    appraisal: asset.pricing.appraisal,
    localPerUsd: rate.perUsd,
  });

  const history = rate.history;
  const series = history
    ? history.points.map((point) => ({
      date: point.date,
      navUsd: asset.pricing.appraisal / point.perUsd,
    }))
    : [];
  const change90dPercent = history
    ? percentChange(asset.pricing.appraisal / history.start, asset.pricing.appraisal / history.end)
    : null;

  return {
    ...basePosition(asset),
    navUsd: mark.navUsd,
    change90dPercent,
    series,
    summary: `Appraisal ${formatNumber(mark.appraisal, 0)} ${symbol} at ${formatNumber(mark.localPerUsd, 4)} ${symbol} per USD`,
    inputs: {
      appraisal: mark.appraisal,
      fxSymbol: symbol,
      currencyName: rate.name,
      localPerUsd: mark.localPerUsd,
      fxDate: fx.date,
      propertyType: asset.pricing.propertyType || null,
      fxChange90dPercent: history?.changePercent ?? null,
    },
  };
}

async function valuePortfolio(assets) {
  const book = assets ?? await loadAssets();
  const needs = collectRequirements(book);
  const [fx, treasuries, tokens] = await Promise.all([
    needs.fxSymbols.length ? getFxBoard(needs.fxSymbols) : null,
    getTreasuryBoard(needs.auctions),
    needs.tokenIds.length ? getTokenBoard(needs.tokenIds) : null,
  ]);

  const positions = book.map((asset) => {
    if (asset.pricing.method === 'token_spot') return markTokenAsset(asset, tokens);
    if (asset.pricing.method === 'auction_price') return markAuctionAsset(asset, treasuries);
    return markProperty(asset, fx);
  });

  const totalNavUsd = positions.reduce((sum, position) => sum + position.navUsd, 0);
  const warnings = [
    ...(treasuries.warnings || []),
    ...(tokens?.warnings || []),
  ];

  return {
    asOf: new Date().toISOString(),
    baseCurrency: 'USD',
    disclaimer: DISCLAIMER,
    totalNavUsd,
    positionCount: positions.length,
    positions,
    markets: { fx, treasuries, tokens },
    warnings,
  };
}

module.exports = { valuePortfolio };
