const statusNode = document.querySelector('#status');
const refreshButton = document.querySelector('#refresh');
const kpisNode = document.querySelector('#kpis');
const positionsNode = document.querySelector('#positions');
const marketsNode = document.querySelector('#markets');
const disclaimerNode = document.querySelector('#disclaimer');

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const wholeUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const fxFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function el(tag, className, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function formatSigned(value) {
  if (!Number.isFinite(value)) return '—';
  const formatted = `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))}%`;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function tone(value) {
  if (!Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

function sparkline(series) {
  const values = (series || []).map((point) => point.navUsd).filter(Number.isFinite);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 32');
  svg.setAttribute('width', '120');
  svg.setAttribute('height', '32');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('role', 'img');
  if (values.length < 2) {
    svg.setAttribute('aria-label', 'No 90-day path');
    return svg;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 120;
    const y = 30 - ((value - min) / span) * 28;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('points', points);
  svg.append(line);
  const direction = values[values.length - 1] >= values[0] ? 'higher' : 'lower';
  svg.setAttribute('aria-label', `90-day NAV ends ${direction}`);
  return svg;
}

function kpi(label, value, note) {
  return el('article', 'kpi', [
    el('span', '', [label]),
    el('strong', '', [value]),
    el('small', '', [note]),
  ]);
}

function renderKpis(report) {
  clear(kpisNode);
  const fxDate = report.markets.fx?.date || 'n/a';
  const treasuryDate = report.markets.treasuries?.recordDate || 'n/a';
  const classCount = new Set(report.positions.map((position) => position.classLabel)).size;
  kpisNode.append(
    kpi('Portfolio NAV', usd.format(report.totalNavUsd), report.baseCurrency),
    kpi('Positions', String(report.positionCount), `${classCount} asset classes`),
    kpi('FX date', fxDate, 'ECB via Frankfurter'),
    kpi('Treasury date', treasuryDate, 'Average interest rates'),
  );
  kpisNode.hidden = false;
}

function movement(position) {
  if (Number.isFinite(position.change90dPercent)) {
    return { label: '90d', value: position.change90dPercent };
  }
  if (Number.isFinite(position.change24hPercent)) {
    return { label: '24h', value: position.change24hPercent };
  }
  return null;
}

function renderPositions(report) {
  clear(positionsNode);
  for (const position of report.positions) {
    const move = movement(position);
    const path = [];
    if ((position.series || []).filter((point) => Number.isFinite(point.navUsd)).length >= 2) {
      path.push(sparkline(position.series));
    }
    path.push(el('div', tone(move?.value), [move ? `${formatSigned(move.value)} ${move.label}` : '—']));
    const row = document.createElement('tr');
    row.append(
      el('th', '', [
        el('div', 'asset-name', [position.name]),
        el('div', 'meta', [[position.token?.symbol, position.jurisdiction, position.location].filter(Boolean).join(' · ')]),
      ]),
      el('td', '', [position.classLabel]),
      el('td', 'basis', [position.summary]),
      el('td', '', path),
      el('td', 'num nav', [usd.format(position.navUsd)]),
    );
    row.querySelector('th').setAttribute('scope', 'row');
    positionsNode.append(row);
  }
}

function pair(term, value, title) {
  const row = document.createElement('div');
  const definition = el('dd', '', [value]);
  if (title) definition.setAttribute('title', title);
  row.append(el('dt', '', [term]), definition);
  return row;
}

const RATE_LABELS = {
  'Treasury Bills': 'Bills',
  'Treasury Notes': 'Notes',
  'Treasury Bonds': 'Bonds',
  'Treasury Inflation-Protected Securities (TIPS)': 'TIPS',
  'Treasury Floating Rate Notes (FRN)': 'FRNs',
  'Total Marketable': 'Total marketable',
};

function shortAddress(address) {
  if (!address || address.length < 12) return address || '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function card(title, rows, source, warnings = []) {
  const list = document.createElement('dl');
  for (const row of rows) list.append(row);
  const node = el('article', 'card', [el('h2', '', [title]), list, el('p', 'source', [source])]);
  for (const warning of warnings) {
    const text = warning.replace(/GET https?:\/\/\S+ failed \(\d+\): /, '');
    node.append(el('p', 'warning', [text.length > 180 ? `${text.slice(0, 177)}...` : text]));
  }
  return node;
}

function renderMarkets(report) {
  clear(marketsNode);
  const fx = report.markets.fx;
  const treasuries = report.markets.treasuries;
  const tokens = report.markets.tokens;

  if (fx) {
    const rows = Object.entries(fx.rates).map(([symbol, rate]) => {
      const move = rate.history ? ` (${formatSigned(rate.history.changePercent)})` : '';
      return pair(symbol, `${fxFormat.format(rate.perUsd)}${move}`, rate.name);
    });
    marketsNode.append(card('Foreign exchange', rows, fx.source));
  }

  const treasuryRows = Object.entries(treasuries.rates).map(([name, rate]) => {
    return pair(RATE_LABELS[name] || name, `${rate.avgInterestRatePercent.toFixed(3)}%`);
  });
  for (const auction of Object.values(treasuries.auctions)) {
    treasuryRows.push(pair(
      `${auction.securityTerm} auction`,
      `${auction.pricePer100.toFixed(4)} on ${auction.auctionDate}`,
    ));
  }
  if (treasuries.publicDebt?.totalPublicDebtUsd) {
    treasuryRows.push(pair('Public debt', wholeUsd.format(treasuries.publicDebt.totalPublicDebtUsd)));
  }
  marketsNode.append(card('Treasuries', treasuryRows, treasuries.source, treasuries.warnings));

  if (tokens) {
    const rows = Object.entries(tokens.prices).map(([id, price]) => {
      const change = tokens.quotes[id]?.change24hPercent;
      const suffix = Number.isFinite(change) ? ` (${formatSigned(change)} 24h)` : '';
      return pair(id, `${usd.format(price.usd)}${suffix}`);
    });
    if (tokens.reference?.ethereumAddress) {
      const address = tokens.reference.ethereumAddress;
      rows.push(pair(tokens.reference.symbol.toUpperCase(), shortAddress(address), address));
    }
    marketsNode.append(card('Tokenized assets', rows, tokens.source, tokens.warnings));
  }

  marketsNode.hidden = false;
}

function render(report) {
  statusNode.classList.remove('error');
  statusNode.textContent = `Marks as of ${new Date(report.asOf).toLocaleString()}.`;
  disclaimerNode.textContent = report.disclaimer;
  renderKpis(report);
  renderPositions(report);
  renderMarkets(report);
}

async function loadValuation() {
  refreshButton.disabled = true;
  statusNode.classList.remove('error');
  statusNode.textContent = 'Pulling ECB, Treasury, and CoinGecko marks.';
  try {
    const response = await fetch('/api/valuation');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    render(body);
  } catch (error) {
    statusNode.classList.add('error');
    statusNode.textContent = error.message;
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener('click', loadValuation);
loadValuation();
