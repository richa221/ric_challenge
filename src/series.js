function percentChange(start, end) {
  if (!Number.isFinite(start) || start === 0 || !Number.isFinite(end)) return null;
  return ((end - start) / start) * 100;
}

module.exports = { percentChange };
