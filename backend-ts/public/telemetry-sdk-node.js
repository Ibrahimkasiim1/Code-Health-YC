/**
 * Code Health Platform - Node.js Telemetry SDK
 * Auto-instrumentation for Express/Hono/Fastify backends
 * 
 * Installation:
 * ```javascript
 * const { telemetryMiddleware } = require('./telemetry-sdk-node');
 * app.use(telemetryMiddleware({ ingestUrl: 'https://your-backend.com/webhooks/ingest' }));
 * ```
 */

const crypto = require('crypto');

/**
 * Generate request hash for duplicate detection
 */
function generateRequestHash(req) {
  const data = `${req.method}:${req.path}:${JSON.stringify(req.query)}:${JSON.stringify(req.body)}`;
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Send telemetry event to ingest endpoint
 */
async function sendEvent(ingestUrl, eventData) {
  try {
    await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData),
    });
  } catch (error) {
    console.error('[CodeHealth] Failed to send telemetry:', error.message);
  }
}

/**
 * Express/Hono middleware for automatic telemetry collection
 */
function telemetryMiddleware(options = {}) {
  const ingestUrl = options.ingestUrl || process.env.CODEHEALTH_INGEST_URL;
  
  if (!ingestUrl) {
    console.warn('[CodeHealth] Telemetry disabled: CODEHEALTH_INGEST_URL not configured');
    return (req, res, next) => next();
  }

  return async (req, res, next) => {
    const startTime = Date.now();
    const requestHash = generateRequestHash(req);

    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;

      // Send telemetry event (async, don't block response)
      sendEvent(ingestUrl, {
        event_type: 'telemetry',
        endpoint: req.path,
        duration_ms: duration,
        user_id: req.user?.id || req.headers['x-user-id'] || null,
        request_hash: requestHash,
        metadata: {
          method: req.method,
          status: res.statusCode,
          query: req.query,
          ip: req.ip,
          user_agent: req.headers['user-agent'],
        },
        timestamp: new Date().toISOString(),
      }).catch(err => console.error('[CodeHealth] Telemetry error:', err));

      return originalSend.apply(res, arguments);
    };

    next();
  };
}

/**
 * Error tracking middleware
 */
function errorTrackingMiddleware(options = {}) {
  const ingestUrl = options.ingestUrl || process.env.CODEHEALTH_INGEST_URL;

  if (!ingestUrl) {
    return (err, req, res, next) => next(err);
  }

  return async (err, req, res, next) => {
    // Send error event
    sendEvent(ingestUrl, {
      event_type: 'error',
      error_message: err.message,
      stack_trace: err.stack,
      endpoint: req.path,
      user_id: req.user?.id || null,
      timestamp: new Date().toISOString(),
    }).catch(console.error);

    next(err);
  };
}

/**
 * Manual event tracking
 */
function trackEvent(eventData) {
  const ingestUrl = process.env.CODEHEALTH_INGEST_URL;
  if (!ingestUrl) return;

  return sendEvent(ingestUrl, {
    ...eventData,
    timestamp: eventData.timestamp || new Date().toISOString(),
  });
}

module.exports = {
  telemetryMiddleware,
  errorTrackingMiddleware,
  trackEvent,
};

