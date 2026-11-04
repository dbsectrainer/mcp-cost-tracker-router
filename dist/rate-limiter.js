export function createRateLimiter(maxRequests = 60, windowMs = 60000) {
    const store = new Map();
    return (req, res, next) => {
        const key = req.headers["x-api-key"] ?? req.ip ?? "unknown";
        const now = Date.now();
        const windowStart = now - windowMs;
        let record = store.get(key);
        if (!record) {
            record = { timestamps: [] };
            store.set(key, record);
        }
        // Remove timestamps outside the current window
        record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
        if (record.timestamps.length >= maxRequests) {
            res.status(429).json({
                error: "Too Many Requests",
                retryAfter: Math.ceil(windowMs / 1000),
            });
            return;
        }
        record.timestamps.push(now);
        next();
    };
}
