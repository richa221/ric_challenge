const store = new Map();
const inflight = new Map();

function cached(key, ttlMs, loader) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return Promise.resolve(hit.value);
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

module.exports = { cached };
