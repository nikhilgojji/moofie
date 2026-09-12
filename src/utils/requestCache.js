// Short-lived, account-scoped memory only. Concurrent readers share one request.
export function createRequestCache({ ttl = 60_000, limit = 24, now = Date.now } = {}) {
  const entries = new Map();
  return {
    clear() { entries.clear(); },
    read(scope, key, fetcher, { refresh = false } = {}) {
      const id = JSON.stringify([scope, key]);
      const cached = entries.get(id);
      if (cached && cached.expires > now() && (!refresh || cached.expires === Infinity)) return cached.promise;
      const entry = { expires: Infinity, promise: null };
      entry.promise = Promise.resolve().then(fetcher).then(value => {
        entry.expires = value?._sync?.partial ? 0 : now() + ttl;
        return value;
      }, error => {
        if (entries.get(id) === entry) entries.delete(id);
        throw error;
      });
      entries.set(id, entry);
      while (entries.size > limit) entries.delete(entries.keys().next().value);
      return entry.promise;
    },
  };
}
