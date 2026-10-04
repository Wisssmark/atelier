/**
 * Tiny in-memory rate limiter (no dependencies).
 * Good enough for a single-process deployment; swap for a Redis-backed
 * limiter if you ever run multiple instances.
 */
function rateLimit({ windowMs = 60000, max = 30, message = 'Too many requests. Please try again later.' } = {}) {
  const hits = new Map();

  return function limiter(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: message });
    }

    // Opportunistic cleanup so the map never grows unbounded.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    }
    next();
  };
}

module.exports = { rateLimit };
