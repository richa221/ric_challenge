const axios = require('axios');
const { cached } = require('../cache.js');
const { config } = require('../config.js');
const { axiosDefaults, optional, readAxios } = require('../http.js');

const PANEL_SECURITIES = [
  'Treasury Bills',
  'Treasury Notes',
  'Treasury Bonds',
  'Treasury Inflation-Protected Securities (TIPS)',
  'Treasury Floating Rate Notes (FRN)',
  'Total Marketable',
];

function parseAmount(value) {
  if (value == null || value === 'null' || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function assertAuctionKey(securityType, securityTerm) {
  if (!/^[A-Za-z]+$/.test(securityType)) {
    throw new Error(`Invalid security type ${securityType}`);
  }
  if (!/^[A-Za-z0-9-]+$/.test(securityTerm)) {
    throw new Error(`Invalid security term ${securityTerm}`);
  }
}

async function fetchAverageRates() {
  const url = `${config.treasuryBase}/v2/accounting/od/avg_interest_rates`;
  return readAxios(
    axios.get(url, {
      ...axiosDefaults,
      params: {
        fields: 'record_date,security_desc,avg_interest_rate_amt',
        sort: '-record_date',
        'page[size]': 12,
      },
    }),
    url,
  );
}

async function fetchAuction(securityType, securityTerm) {
  assertAuctionKey(securityType, securityTerm);
  const url = `${config.treasuryBase}/v1/accounting/od/auctions_query`;
  return readAxios(
    axios.get(url, {
      ...axiosDefaults,
      params: {
        filter: `security_type:eq:${securityType},security_term:eq:${securityTerm}`,
        sort: '-auction_date',
        'page[size]': 8,
        fields: [
          'cusip',
          'auction_date',
          'security_type',
          'security_term',
          'high_discnt_rate',
          'high_price',
        ].join(','),
      },
    }),
    url,
  );
}

async function fetchPublicDebt() {
  const url = `${config.treasuryBase}/v2/accounting/od/debt_to_penny`;
  return readAxios(
    axios.get(url, {
      ...axiosDefaults,
      params: {
        fields: 'record_date,tot_pub_debt_out_amt',
        sort: '-record_date',
        'page[size]': 1,
      },
    }),
    url,
  );
}

function normalizeAuction(securityType, securityTerm, payload) {
  const row = (payload.data || []).find((item) => parseAmount(item.high_price) != null);
  if (!row) {
    throw new Error(`No completed ${securityTerm} ${securityType} auction`);
  }

  return {
    cusip: row.cusip && row.cusip !== 'null' ? row.cusip : null,
    auctionDate: row.auction_date,
    securityType: row.security_type,
    securityTerm: row.security_term,
    pricePer100: parseAmount(row.high_price),
    discountRatePercent: parseAmount(row.high_discnt_rate),
  };
}

function normalizeRates(payload) {
  const rows = payload.data || [];
  if (rows.length === 0) throw new Error('Treasury average-rate feed returned no rows');
  const recordDate = rows[0].record_date;
  const rates = {};
  for (const row of rows) {
    if (row.record_date !== recordDate) continue;
    if (!PANEL_SECURITIES.includes(row.security_desc)) continue;
    const avgInterestRatePercent = parseAmount(row.avg_interest_rate_amt);
    if (avgInterestRatePercent == null) continue;
    rates[row.security_desc] = { avgInterestRatePercent };
  }
  return { recordDate, rates };
}

function normalizeDebt(payload) {
  const row = payload.data?.[0];
  if (!row) throw new Error('Debt-to-the-penny feed returned no rows');
  return {
    recordDate: row.record_date,
    totalPublicDebtUsd: parseAmount(row.tot_pub_debt_out_amt),
  };
}

function getAverageRates() {
  return cached('treasury:rates', config.cacheTtlMs, async () => {
    return normalizeRates(await fetchAverageRates());
  });
}

function getAuction(securityType, securityTerm) {
  const key = `treasury:auction:${securityType}:${securityTerm}`;
  return cached(key, config.cacheTtlMs, async () => {
    return normalizeAuction(securityType, securityTerm, await fetchAuction(securityType, securityTerm));
  });
}

function getPublicDebt() {
  return cached('treasury:debt', config.cacheTtlMs, async () => {
    return normalizeDebt(await fetchPublicDebt());
  });
}

async function getTreasuryBoard(auctions) {
  const unique = [];
  const seen = new Set();
  for (const auction of auctions) {
    const key = `${auction.securityType}:${auction.securityTerm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(auction);
  }

  const [average, debt, auctionRows] = await Promise.all([
    getAverageRates(),
    optional('U.S. public debt', () => getPublicDebt()),
    Promise.all(unique.map(async (auction) => {
      const quote = await getAuction(auction.securityType, auction.securityTerm);
      return [`${auction.securityType}:${auction.securityTerm}`, quote];
    })),
  ]);

  return {
    source: 'U.S. Department of the Treasury, Fiscal Data',
    recordDate: average.recordDate,
    rates: average.rates,
    auctions: Object.fromEntries(auctionRows),
    publicDebt: debt.ok ? debt.data : null,
    warnings: debt.ok ? [] : [debt.error],
  };
}

module.exports = { getTreasuryBoard };
