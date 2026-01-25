import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || "";

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// Industry benchmarks for cost comparison
const INDUSTRY_BENCHMARKS: Record<string, { costPerUser: number; costPer1kRequests: number }> = {
  openai: { costPerUser: 5.0, costPer1kRequests: 0.5 },
  anthropic: { costPerUser: 4.0, costPer1kRequests: 0.4 },
  stripe: { costPerUser: 2.0, costPer1kRequests: 0.1 },
  twilio: { costPerUser: 1.0, costPer1kRequests: 0.05 },
  default: { costPerUser: 3.0, costPer1kRequests: 0.3 },
};

// Tool definitions
const TOOLS: ToolSchema[] = [
  {
    name: "get_spending_summary",
    description: "Get a summary of spending by service for a user over a specified time period",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The user ID to get spending for",
        },
        days: {
          type: "number",
          description: "Number of days to look back (default: 30)",
          default: 30,
        },
      },
      required: ["user_id"],
    },
  },
  {
    name: "calculate_unit_economics",
    description: "Calculate unit economics (cost per user, cost per request) for a service",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The user ID",
        },
        service: {
          type: "string",
          description: "The service name (e.g., 'openai', 'anthropic')",
        },
        total_users: {
          type: "number",
          description: "Total number of users",
        },
        total_requests: {
          type: "number",
          description: "Total number of API requests",
        },
      },
      required: ["user_id", "service", "total_users", "total_requests"],
    },
  },
  {
    name: "get_repository_context",
    description: "Get the analyzed context (tech stack, architecture) for a repository",
    inputSchema: {
      type: "object",
      properties: {
        repo_id: {
          type: "string",
          description: "The repository ID",
        },
      },
      required: ["repo_id"],
    },
  },
];

// Tool implementations
async function getSpendingSummary(
  userId: string,
  days: number = 30
): Promise<{
  totalSpending: number;
  byService: Record<string, { amount: number; count: number }>;
  transactionCount: number;
  periodDays: number;
}> {
  const db = getSupabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const { data: transactions, error } = await db
    .from("brex_transactions")
    .select("*")
    .eq("user_id", userId)
    .gte("transaction_date", cutoffDate.toISOString().split("T")[0]);

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  const byService: Record<string, { amount: number; count: number }> = {};
  let totalSpending = 0;

  for (const tx of transactions || []) {
    const service = tx.detected_service || tx.merchant;
    const amount = parseFloat(tx.amount);
    totalSpending += amount;

    if (!byService[service]) {
      byService[service] = { amount: 0, count: 0 };
    }
    byService[service].amount += amount;
    byService[service].count += 1;
  }

  return {
    totalSpending,
    byService,
    transactionCount: transactions?.length || 0,
    periodDays: days,
  };
}

async function calculateUnitEconomics(
  userId: string,
  service: string,
  totalUsers: number,
  totalRequests: number
): Promise<{
  service: string;
  monthlySpending: number;
  costPerUser: number;
  costPerRequest: number;
  costPer1kRequests: number;
  benchmarkCostPerUser: number;
  benchmarkCostPer1kRequests: number;
  efficiencyRatio: number;
}> {
  const spending = await getSpendingSummary(userId, 30);
  const serviceSpending = spending.byService[service]?.amount || 0;

  const costPerUser = totalUsers > 0 ? serviceSpending / totalUsers : 0;
  const costPerRequest = totalRequests > 0 ? serviceSpending / totalRequests : 0;
  const costPer1kRequests = costPerRequest * 1000;

  const benchmark =
    INDUSTRY_BENCHMARKS[service.toLowerCase()] || INDUSTRY_BENCHMARKS.default;

  const efficiencyRatio =
    costPerUser > 0 ? benchmark.costPerUser / costPerUser : 0;

  return {
    service,
    monthlySpending: serviceSpending,
    costPerUser,
    costPerRequest,
    costPer1kRequests,
    benchmarkCostPerUser: benchmark.costPerUser,
    benchmarkCostPer1kRequests: benchmark.costPer1kRequests,
    efficiencyRatio,
  };
}

async function getRepositoryContext(
  repoId: string
): Promise<{
  context: Record<string, unknown> | null;
  stackSummary: string | null;
}> {
  const db = getSupabase();

  const { data, error } = await db
    .from("repository_contexts")
    .select("context_json, stack_summary")
    .eq("repo_id", repoId)
    .single();

  if (error) {
    return { context: null, stackSummary: null };
  }

  return {
    context: data?.context_json || null,
    stackSummary: data?.stack_summary || null,
  };
}

// Create and start the server
async function main() {
  const server = new Server(
    {
      name: "code-health-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "get_spending_summary": {
          const result = await getSpendingSummary(
            args?.user_id as string,
            (args?.days as number) || 30
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "calculate_unit_economics": {
          const result = await calculateUnitEconomics(
            args?.user_id as string,
            args?.service as string,
            args?.total_users as number,
            args?.total_requests as number
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_repository_context": {
          const result = await getRepositoryContext(args?.repo_id as string);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Code Health MCP Server running on stdio");
}

main().catch(console.error);
