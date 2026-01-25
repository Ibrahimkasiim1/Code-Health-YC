import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function seedDemoUser(): Promise<string> {
  const email = "demo@codehealth.ai";
  const password = "demo123";

  const { data: existing } = await supabase.from("users").select("id").eq("email", email);
  if (existing && existing.length > 0) {
    console.log(`Demo user already exists: ${email}`);
    return existing[0].id;
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const { data, error } = await supabase
    .from("users")
    .insert({ email, password_hash: passwordHash })
    .select()
    .single();

  if (error || !data) {
    throw new Error("Failed to create demo user");
  }

  console.log(`Created demo user: ${email} (ID: ${data.id})`);
  return data.id;
}

async function seedBrexTransactions(userId: string): Promise<void> {
  const { data: existing } = await supabase
    .from("brex_transactions")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("Brex transactions already exist, skipping...");
    return;
  }

  const transactions: Array<Record<string, unknown>> = [];
  const today = new Date();

  for (let week = 0; week < 8; week += 1) {
    const transactionDate = new Date(today);
    transactionDate.setDate(transactionDate.getDate() - week * 7);

    const variation = ((week % 3) - 1) * 25;
    const amount = 500 + variation;

    transactions.push({
      user_id: userId,
      amount,
      merchant: "OpenAI",
      detected_service: "openai",
      transaction_date: transactionDate.toISOString().slice(0, 10),
    });
  }

  for (let i = 0; i < 3; i += 1) {
    const transactionDate = new Date(today);
    transactionDate.setDate(transactionDate.getDate() - i * 14 - 3);

    transactions.push({
      user_id: userId,
      amount: 50 + i * 10,
      merchant: "Anthropic",
      detected_service: "anthropic",
      transaction_date: transactionDate.toISOString().slice(0, 10),
    });
  }

  await supabase.from("brex_transactions").insert(transactions);
  console.log(`Created ${transactions.length} Brex transactions`);
}

async function seedDemoIssue(): Promise<string> {
  const title = "OpenAI API costs: $50/user (10x industry standard)";
  const { data: existing } = await supabase
    .from("issues")
    .select("id")
    .eq("title", title)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("Demo issue already exists");
    return existing[0].id;
  }

  const monthlySpending = 2000;
  const totalUsers = 100;
  const costPerUser = monthlySpending / totalUsers;
  const benchmarkCostPerUser = 5;
  const potentialSavings = monthlySpending * 0.9;

  const { data, error } = await supabase
    .from("issues")
    .insert({
      repo_id: null,
      agent_type: "business_intel",
      issue_type: "cost_optimization",
      title,
      description:
        "Your OpenAI API spending is $2,000/month for 100 users, resulting in $50/user. The industry benchmark is $5/user. Analysis suggests caching can reduce redundant API calls by 90%, potentially saving $1,800/month.",
      severity: "critical",
      status: "open",
      metrics: {
        monthly_spending: monthlySpending,
        potential_monthly_savings: potentialSavings,
        cost_per_user: costPerUser,
        benchmark_cost_per_user: benchmarkCostPerUser,
        efficiency_ratio: benchmarkCostPerUser / costPerUser,
        total_users: totalUsers,
      },
      file_path: "src/services/openai.ts",
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error("Failed to create demo issue");
  }

  console.log(`Created demo issue (ID: ${data.id})`);
  return data.id;
}

async function seedDemoFix(issueId: string): Promise<void> {
  const { data: existing } = await supabase
    .from("fixes")
    .select("id")
    .eq("issue_id", issueId)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("Demo fix already exists");
    return;
  }

  const originalCode = `import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateCompletion(prompt: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
  });

  return response.choices[0].message.content || '';
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text,
  });

  return response.data[0].embedding;
}`;

  const fixedCode = `import OpenAI from 'openai';
import { createHash } from 'crypto';
import { Redis } from 'ioredis';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const redis = new Redis(process.env.REDIS_URL);
const CACHE_TTL = 60 * 60 * 24; // 24 hours

function getCacheKey(prefix: string, input: string): string {
  const hash = createHash('sha256').update(input).digest('hex');
  return \`openai:\${prefix}:\${hash}\`;
}

export async function generateCompletion(prompt: string): Promise<string> {
  const cacheKey = getCacheKey('completion', prompt);

  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
  });

  const result = response.choices[0].message.content || '';

  // Cache the result
  await redis.setex(cacheKey, CACHE_TTL, result);

  return result;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const cacheKey = getCacheKey('embedding', text);

  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text,
  });

  const embedding = response.data[0].embedding;

  // Cache the result
  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(embedding));

  return embedding;
}`;

  const diff = `@@ -1,4 +1,6 @@
 import OpenAI from 'openai';
+import { createHash } from 'crypto';
+import { Redis } from 'ioredis';

 const openai = new OpenAI({
   apiKey: process.env.OPENAI_API_KEY,
@@ -6,8 +8,22 @@ const openai = new OpenAI({
+const redis = new Redis(process.env.REDIS_URL);
+const CACHE_TTL = 60 * 60 * 24; // 24 hours
+
+function getCacheKey(prefix: string, input: string): string {
+  const hash = createHash('sha256').update(input).digest('hex');
+  return \`openai:\${prefix}:\${hash}\`;
+}
+
 export async function generateCompletion(prompt: string): Promise<string> {
+  const cacheKey = getCacheKey('completion', prompt);
+
+  // Check cache first
+  const cached = await redis.get(cacheKey);
+  if (cached) {
+    return cached;
+  }
+
   const response = await openai.chat.completions.create({
     model: 'gpt-4',
     messages: [{ role: 'user', content: prompt }],
@@ -15,10 +31,25 @@ export async function generateCompletion(prompt: string): Promise<string> {
   });

-  return response.choices[0].message.content || '';
+  const result = response.choices[0].message.content || '';
+
+  // Cache the result
+  await redis.setex(cacheKey, CACHE_TTL, result);
+
+  return result;
 }

 export async function generateEmbedding(text: string): Promise<number[]> {
+  const cacheKey = getCacheKey('embedding', text);
+
+  // Check cache first
+  const cached = await redis.get(cacheKey);
+  if (cached) {
+    return JSON.parse(cached);
+  }
+
   const response = await openai.embeddings.create({
     model: 'text-embedding-ada-002',
     input: text,
@@ -26,5 +57,10 @@ export async function generateEmbedding(text: string): Promise<number[]> {
   });

-  return response.data[0].embedding;
+  const embedding = response.data[0].embedding;
+
+  // Cache the result
+  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(embedding));
+
+  return embedding;
 }`;

  const explanation =
    "This fix implements semantic caching using Redis to reduce redundant OpenAI API calls. Key changes: added a Redis caching layer, hashed cache keys, and a 24-hour TTL. Expected impact: ~90% reduction in API calls for repeated queries.";

  await supabase.from("fixes").insert({
    issue_id: issueId,
    original_code: originalCode,
    fixed_code: fixedCode,
    diff,
    confidence_score: 0.92,
    explanation,
  });

  console.log("Created demo fix");
}

async function main() {
  console.log("Seeding demo data...");
  const userId = await seedDemoUser();
  await seedBrexTransactions(userId);
  const issueId = await seedDemoIssue();
  await seedDemoFix(issueId);
  console.log("Demo data seeded successfully.");
  console.log("Demo credentials: demo@codehealth.ai / demo123");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
