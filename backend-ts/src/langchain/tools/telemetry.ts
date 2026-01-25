import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getSupabase } from "../../db.js";

/**
 * Query telemetry events with flexible filtering
 */
export const queryTelemetryEvents = tool(
  async (input) => {
    const supabase = getSupabase();
    try {
      let query = supabase
        .from("telemetry_events")
        .select("*")
        .gte("timestamp", input.start_date)
        .lte("timestamp", input.end_date);

      if (input.endpoint) query = query.eq("endpoint", input.endpoint);
      if (input.event_type) query = query.eq("event_type", input.event_type);
      if (input.user_id) query = query.eq("user_id", input.user_id);

      const { data, error } = await query.limit(1000);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify(data || []);
    } catch (error) {
      return JSON.stringify({ error: `Query failed: ${error}` });
    }
  },
  {
    name: "query_telemetry_events",
    description: "Get telemetry data with flexible filtering.",
    schema: z.object({
      endpoint: z.string().optional().describe("Filter by specific endpoint"),
      event_type: z.string().optional().describe("Filter by event type"),
      start_date: z.string().describe("Start date (ISO format)"),
      end_date: z.string().describe("End date (ISO format)"),
      user_id: z.string().optional().describe("Filter by specific user"),
    }),
  }
);

/**
 * Calculate latency percentiles for an endpoint
 */
export const calculateLatencyPercentiles = tool(
  async (input) => {
    const supabase = getSupabase();
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.timeframe_days);

      const { data, error } = await supabase
        .from("telemetry_events")
        .select("duration_ms")
        .eq("endpoint", input.endpoint)
        .gte("timestamp", cutoff.toISOString())
        .not("duration_ms", "is", null);

      if (error) return JSON.stringify({ error: error.message });
      if (!data || data.length === 0) return JSON.stringify({ error: "No data found" });

      const durations = data.map((d) => d.duration_ms).sort((a, b) => a - b);
      const len = durations.length;
      return JSON.stringify({
        p50: durations[Math.floor(len * 0.5)],
        p95: durations[Math.floor(len * 0.95)],
        p99: durations[Math.floor(len * 0.99)],
        unit: "ms",
        sample_size: len,
      });
    } catch (error) {
      return JSON.stringify({ error: `Calculation failed: ${error}` });
    }
  },
  {
    name: "calculate_latency_percentiles",
    description: "Compute p50, p95, p99 latency for an endpoint.",
    schema: z.object({
      endpoint: z.string().describe("The endpoint to analyze"),
      timeframe_days: z.number().describe("Number of days to analyze"),
    }),
  }
);

/**
 * Get user navigation paths through the application
 */
export const getSessionFlows = tool(
  async (input) => {
    const supabase = getSupabase();
    try {
      let query = supabase
        .from("session_events")
        .select("session_id, page_url, timestamp, duration_ms")
        .gte("timestamp", input.start_date)
        .lte("timestamp", input.end_date)
        .order("timestamp", { ascending: true });

      if (input.session_id) query = query.eq("session_id", input.session_id);
      if (input.page_url) query = query.eq("page_url", input.page_url);

      const { data, error } = await query.limit(5000);
      if (error) return JSON.stringify({ error: error.message });

      const sessions: Record<string, { pages: Array<{ url: string; timestamp: string; duration_ms: number }>; bounce: boolean }> = {};
      for (const event of data || []) {
        if (!sessions[event.session_id]) sessions[event.session_id] = { pages: [], bounce: false };
        sessions[event.session_id].pages.push({ url: event.page_url, timestamp: event.timestamp, duration_ms: event.duration_ms || 0 });
      }
      for (const sessionId of Object.keys(sessions)) {
        sessions[sessionId].bounce = sessions[sessionId].pages.length === 1;
      }
      return JSON.stringify(Object.entries(sessions).map(([session_id, data]) => ({ session_id, ...data })));
    } catch (error) {
      return JSON.stringify({ error: `Query failed: ${error}` });
    }
  },
  {
    name: "get_session_flows",
    description: "Get user navigation paths. Use to analyze bounce rates.",
    schema: z.object({
      session_id: z.string().optional().describe("Filter by session"),
      page_url: z.string().optional().describe("Filter by page"),
      start_date: z.string().describe("Start date (ISO format)"),
      end_date: z.string().describe("End date (ISO format)"),
    }),
  }
);

/**
 * Get errors from telemetry with grouping
 */
export const getErrorEvents = tool(
  async (input) => {
    const supabase = getSupabase();
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.timeframe_days);

      const { data, error } = await supabase
        .from("error_events")
        .select("error_message, stack_trace, endpoint, user_id, timestamp")
        .gte("timestamp", cutoff.toISOString());

      if (error) return JSON.stringify({ error: error.message });

      const grouped: Record<string, { count: number; affected_users: Set<string>; first_seen: string; last_seen: string; stack_trace?: string; endpoint?: string }> = {};
      for (const event of data || []) {
        const key = input.group_by === "message" ? event.error_message : input.group_by === "stack_trace" ? event.stack_trace : event.endpoint;
        if (!key) continue;
        if (!grouped[key]) grouped[key] = { count: 0, affected_users: new Set(), first_seen: event.timestamp, last_seen: event.timestamp, stack_trace: event.stack_trace, endpoint: event.endpoint };
        grouped[key].count++;
        if (event.user_id) grouped[key].affected_users.add(event.user_id);
        if (event.timestamp < grouped[key].first_seen) grouped[key].first_seen = event.timestamp;
        if (event.timestamp > grouped[key].last_seen) grouped[key].last_seen = event.timestamp;
      }

      const minOccurrences = input.min_occurrences || 1;
      const result = Object.entries(grouped)
        .filter(([, d]) => d.count >= minOccurrences)
        .map(([key, d]) => ({ error_message: input.group_by === "message" ? key : undefined, stack_trace: d.stack_trace, endpoint: d.endpoint, count: d.count, affected_users: d.affected_users.size, first_seen: d.first_seen, last_seen: d.last_seen }));
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ error: `Query failed: ${error}` });
    }
  },
  {
    name: "get_error_events",
    description: "Get errors from telemetry with grouping.",
    schema: z.object({
      timeframe_days: z.number().describe("Number of days to analyze"),
      group_by: z.enum(["message", "stack_trace", "endpoint"]).describe("How to group errors"),
      min_occurrences: z.number().optional().describe("Minimum occurrences"),
    }),
  }
);

/**
 * Find identical API calls within time window
 */
export const detectDuplicateRequests = tool(
  async (input) => {
    const supabase = getSupabase();
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.timeframe_days);

      const { data, error } = await supabase
        .from("telemetry_events")
        .select("endpoint, request_hash, duration_ms, timestamp")
        .eq("endpoint", input.endpoint)
        .gte("timestamp", cutoff.toISOString())
        .order("timestamp", { ascending: true });

      if (error) return JSON.stringify({ error: error.message });
      if (!data || data.length === 0) return JSON.stringify({ duplicate_count: 0, total_requests: 0, cache_hit_rate_potential: 0, savings_estimate_ms: 0 });

      const windowMs = input.window_minutes * 60 * 1000;
      let duplicateCount = 0, totalDuration = 0;
      const requestsByHash: Record<string, Array<{ timestamp: string; duration_ms: number }>> = {};

      for (const req of data) {
        const hash = req.request_hash || "unknown";
        if (!requestsByHash[hash]) requestsByHash[hash] = [];
        requestsByHash[hash].push({ timestamp: req.timestamp, duration_ms: req.duration_ms || 0 });
      }

      for (const requests of Object.values(requestsByHash)) {
        for (let i = 1; i < requests.length; i++) {
          const timeDiff = new Date(requests[i].timestamp).getTime() - new Date(requests[i - 1].timestamp).getTime();
          if (timeDiff <= windowMs) { duplicateCount++; totalDuration += requests[i].duration_ms; }
        }
      }

      return JSON.stringify({ duplicate_count: duplicateCount, total_requests: data.length, cache_hit_rate_potential: data.length > 0 ? duplicateCount / data.length : 0, savings_estimate_ms: totalDuration });
    } catch (error) {
      return JSON.stringify({ error: `Detection failed: ${error}` });
    }
  },
  {
    name: "detect_duplicate_requests",
    description: "Find identical API calls within time window for caching opportunities.",
    schema: z.object({
      endpoint: z.string().describe("The endpoint to analyze"),
      window_minutes: z.number().describe("Time window in minutes"),
      timeframe_days: z.number().describe("Number of days to analyze"),
    }),
  }
);

export const telemetryTools = [queryTelemetryEvents, calculateLatencyPercentiles, getSessionFlows, getErrorEvents, detectDuplicateRequests];
