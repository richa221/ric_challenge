const assert = require('node:assert/strict');
const test = require('node:test');
const { billPriceFromDiscountRate, markAppraisal, markAuctionPrice, markTokenSpot } = require('../src/marks.js');
const { validateAssets } = require('../src/registry.js');

test('token spot multiplies quantity by the live token price', () => {
  const mark = markTokenSpot({ quantity: 2.5, priceUsd: 10, unit: 'troy oz' });
  assert.equal(mark.navUsd, 25);
  assert.equal(mark.unit, 'troy oz');
});

test('auction price scales face amount by the price per 100', () => {
  const mark = markAuctionPrice({ faceUsd: 2_500_000, pricePer100: 98.961083 });
  assert.ok(Math.abs(mark.navUsd - 2_474_027.075) < 0.001);
});

test('13-week bank-discount price reconciles to the published high price', () => {
  const price = billPriceFromDiscountRate({ discountRatePercent: 4.11, days: 91 });
  assert.ok(Math.abs(price - 98.96108333) < 0.0001);
});

test('appraisal divides local currency by units of that currency per dollar', () => {
  const mark = markAppraisal({ appraisal: 1348.28, localPerUsd: 1348.28 });
  assert.ok(Math.abs(mark.navUsd - 1) < 1e-9);
});

test('rejects a non-positive FX rate', () => {
  assert.throws(() => markAppraisal({ appraisal: 10, localPerUsd: 0 }), /positive/);
});

test('rejects an empty catalog', () => {
  assert.throws(() => validateAssets([]), /non-empty/);
});
