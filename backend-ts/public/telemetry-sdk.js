/**
 * Code Health Platform - Telemetry SDK
 * Auto-instrumentation script for collecting telemetry data
 * 
 * Installation:
 * 1. Add this script to your HTML: <script src="https://your-domain.com/telemetry-sdk.js"></script>
 * 2. Or install via npm: npm install @codehealth/telemetry-sdk
 * 3. Or auto-install when connecting GitHub repository
 */

(function() {
  'use strict';

  // Configuration
  const INGEST_URL = window.CODEHEALTH_INGEST_URL || 'https://your-backend.com/webhooks/ingest';
  const SESSION_ID = generateSessionId();
  const PAGE_LOAD_TIME = Date.now();

  // Generate unique session ID
  function generateSessionId() {
    return 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  // Send telemetry event
  function sendEvent(eventData) {
    if (typeof navigator.sendBeacon === 'function') {
      // Use sendBeacon for reliability (works even when page is closing)
      const blob = new Blob([JSON.stringify(eventData)], { type: 'application/json' });
      navigator.sendBeacon(INGEST_URL, blob);
    } else {
      // Fallback to fetch
      fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData),
        keepalive: true
      }).catch(err => console.error('[CodeHealth] Failed to send telemetry:', err));
    }
  }

  // Track page view
  function trackPageView() {
    sendEvent({
      event_type: 'page_view',
      session_id: SESSION_ID,
      page_url: window.location.href,
      duration_ms: 0,
      timestamp: new Date().toISOString()
    });
  }

  // Track page unload (session duration)
  function trackPageUnload() {
    const duration = Date.now() - PAGE_LOAD_TIME;
    sendEvent({
      event_type: 'session',
      session_id: SESSION_ID,
      page_url: window.location.href,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });
  }

  // Track errors
  function trackError(error, source) {
    sendEvent({
      event_type: 'error',
      session_id: SESSION_ID,
      error_message: error.message || String(error),
      stack_trace: error.stack || null,
      endpoint: window.location.href,
      timestamp: new Date().toISOString()
    });
  }

  // Track API calls (intercept fetch)
  function instrumentFetch() {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const startTime = Date.now();
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;

      return originalFetch.apply(this, args)
        .then(response => {
          const duration = Date.now() - startTime;
          sendEvent({
            event_type: 'api_call',
            session_id: SESSION_ID,
            endpoint: url,
            duration_ms: duration,
            metadata: {
              status: response.status,
              method: args[1]?.method || 'GET'
            },
            timestamp: new Date().toISOString()
          });
          return response;
        })
        .catch(error => {
          const duration = Date.now() - startTime;
          sendEvent({
            event_type: 'api_call',
            session_id: SESSION_ID,
            endpoint: url,
            duration_ms: duration,
            metadata: {
              error: error.message,
              method: args[1]?.method || 'GET'
            },
            timestamp: new Date().toISOString()
          });
          throw error;
        });
    };
  }

  // Initialize telemetry
  function init() {
    console.log('[CodeHealth] Telemetry SDK initialized');

    // Track initial page view
    trackPageView();

    // Track page unload
    window.addEventListener('beforeunload', trackPageUnload);
    window.addEventListener('pagehide', trackPageUnload);

    // Track errors
    window.addEventListener('error', (event) => {
      trackError(event.error || new Error(event.message), 'window.error');
    });

    window.addEventListener('unhandledrejection', (event) => {
      trackError(new Error(event.reason), 'unhandledrejection');
    });

    // Instrument fetch API
    instrumentFetch();

    // Track route changes (for SPAs)
    let lastUrl = window.location.href;
    new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        trackPageView();
      }
    }).observe(document, { subtree: true, childList: true });
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose public API
  window.CodeHealthTelemetry = {
    trackEvent: sendEvent,
    trackError: trackError,
    sessionId: SESSION_ID
  };
})();

