function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

module.exports = { isoToday, isoDaysAgo };
