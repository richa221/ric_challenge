function requireFinite(name, value) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
}

function requirePositive(name, value) {
  requireFinite(name, value);
  if (value <= 0) throw new Error(`${name} must be a positive number`);
}

function markTokenSpot({ quantity, priceUsd, unit }) {
  requireFinite('quantity', quantity);
  if (quantity < 0) throw new Error('quantity must be zero or greater');
  requirePositive('priceUsd', priceUsd);
  if (!unit) throw new Error('unit is required');
  return {
    navUsd: quantity * priceUsd,
    priceUsd,
    quantity,
    unit,
  };
}

function markAuctionPrice({ faceUsd, pricePer100 }) {
  requirePositive('faceUsd', faceUsd);
  requirePositive('pricePer100', pricePer100);
  return {
    navUsd: faceUsd * (pricePer100 / 100),
    faceUsd,
    pricePer100,
  };
}

// Treasury bills are quoted on an actual/360 bank-discount basis.
// price per 100 = 100 * (1 - discountRate * days / 360)
function billPriceFromDiscountRate({ discountRatePercent, days }) {
  requirePositive('days', days);
  requireFinite('discountRatePercent', discountRatePercent);
  const pricePer100 = 100 * (1 - (discountRatePercent / 100) * (days / 360));
  if (pricePer100 <= 0) {
    throw new Error('discount rate implies a non-positive bill price');
  }
  return pricePer100;
}

function markAppraisal({ appraisal, localPerUsd }) {
  requirePositive('appraisal', appraisal);
  requirePositive('localPerUsd', localPerUsd);
  return {
    navUsd: appraisal / localPerUsd,
    appraisal,
    localPerUsd,
  };
}

module.exports = {
  markTokenSpot,
  markAuctionPrice,
  billPriceFromDiscountRate,
  markAppraisal,
};
