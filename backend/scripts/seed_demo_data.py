#!/usr/bin/env python3
"""
Seed script for Code Health Platform demo data.

Creates:
- Demo user (demo@codehealth.ai / demo123)
- 8 weeks of Brex transactions (~$500/week to OpenAI)
- Pre-created issue with cost optimization metrics
- Pre-generated fix with caching implementation

Usage:
    python -m scripts.seed_demo_data

Or from the backend directory:
    python scripts/seed_demo_data.py
"""

import os
import sys
from datetime import datetime, timedelta
from decimal import Decimal
import json
import hashlib

from dotenv import load_dotenv
load_dotenv()

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client, Client


def get_supabase() -> Client:
    """Create Supabase client from environment variables."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        raise ValueError(
            "Missing environment variables. Set SUPABASE_URL and SUPABASE_SERVICE_KEY."
        )

    return create_client(url, key)


def hash_password(password: str) -> str:
    """Simple password hashing for demo purposes."""
    # In production, use bcrypt or similar
    return hashlib.sha256(password.encode()).hexdigest()


def seed_demo_user(supabase: Client) -> str:
    """Create or get demo user. Returns user ID."""
    email = "demo@codehealth.ai"
    password = "demo123"

    # Check if user exists
    result = supabase.table("users").select("id").eq("email", email).execute()

    if result.data:
        print(f"Demo user already exists: {email}")
        return result.data[0]["id"]

    # Create user
    user_data = {
        "email": email,
        "password_hash": hash_password(password),
    }

    result = supabase.table("users").insert(user_data).execute()
    user_id = result.data[0]["id"]
    print(f"Created demo user: {email} (ID: {user_id})")

    return user_id


def seed_brex_transactions(supabase: Client, user_id: str) -> None:
    """Create 8 weeks of Brex transactions for OpenAI."""

    # Check if transactions already exist
    result = supabase.table("brex_transactions").select("id").eq("user_id", user_id).limit(1).execute()

    if result.data:
        print("Brex transactions already exist, skipping...")
        return

    transactions = []
    today = datetime.now().date()

    # Generate 8 weeks of transactions (weekly payments to OpenAI)
    for week in range(8):
        transaction_date = today - timedelta(weeks=week)

        # Base amount around $500/week with some variation
        base_amount = 500.0
        variation = (week % 3 - 1) * 25  # -25, 0, +25 variation
        amount = base_amount + variation

        transactions.append({
            "user_id": user_id,
            "amount": amount,
            "merchant": "OpenAI",
            "detected_service": "openai",
            "transaction_date": transaction_date.isoformat(),
        })

    # Add a few more smaller transactions for variety
    for i in range(3):
        transaction_date = today - timedelta(weeks=i * 2, days=3)
        transactions.append({
            "user_id": user_id,
            "amount": 50.0 + (i * 10),
            "merchant": "Anthropic",
            "detected_service": "anthropic",
            "transaction_date": transaction_date.isoformat(),
        })

    # Insert all transactions
    supabase.table("brex_transactions").insert(transactions).execute()
    print(f"Created {len(transactions)} Brex transactions")


def seed_demo_issue(supabase: Client, user_id: str) -> str:
    """Create a pre-made issue for the demo. Returns issue ID."""

    # Check if demo issue already exists
    result = supabase.table("issues").select("id").eq("title", "OpenAI API costs: $50/user (10x industry standard)").limit(1).execute()

    if result.data:
        print("Demo issue already exists")
        return result.data[0]["id"]

    # Calculate metrics based on seeded transactions
    monthly_spending = 2000.0  # ~$500/week
    total_users = 100
    cost_per_user = monthly_spending / total_users
    benchmark_cost_per_user = 5.0
    potential_savings = monthly_spending * 0.9  # 90% potential savings with caching

    issue_data = {
        "repo_id": None,  # Demo issue without repo initially
        "agent_type": "cost_optimizer",
        "issue_type": "excessive_api_cost",
        "title": "OpenAI API costs: $50/user (10x industry standard)",
        "description": (
            "Your OpenAI API spending is $2,000/month for 100 users, resulting in $50/user. "
            "The industry benchmark is $5/user. Analysis suggests that implementing semantic caching "
            "can reduce redundant API calls by 90%, potentially saving $1,800/month."
        ),
        "severity": "critical",
        "status": "open",
        "metrics": {
            "monthly_spending": monthly_spending,
            "potential_monthly_savings": potential_savings,
            "cost_per_user": cost_per_user,
            "benchmark_cost_per_user": benchmark_cost_per_user,
            "efficiency_ratio": benchmark_cost_per_user / cost_per_user,
            "total_users": total_users,
        },
        "file_path": "src/services/openai.ts",
    }

    result = supabase.table("issues").insert(issue_data).execute()
    issue_id = result.data[0]["id"]
    print(f"Created demo issue (ID: {issue_id})")

    return issue_id


def seed_demo_fix(supabase: Client, issue_id: str) -> None:
    """Create a pre-generated fix for the demo issue."""

    # Check if fix already exists
    result = supabase.table("fixes").select("id").eq("issue_id", issue_id).limit(1).execute()

    if result.data:
        print("Demo fix already exists")
        return

    original_code = '''import OpenAI from 'openai';

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
}'''

    fixed_code = '''import OpenAI from 'openai';
import { createHash } from 'crypto';
import { Redis } from 'ioredis';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const redis = new Redis(process.env.REDIS_URL);
const CACHE_TTL = 60 * 60 * 24; // 24 hours

function getCacheKey(prefix: string, input: string): string {
  const hash = createHash('sha256').update(input).digest('hex');
  return `openai:${prefix}:${hash}`;
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
}'''

    diff = '''@@ -1,4 +1,6 @@
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
+  return `openai:${prefix}:${hash}`;
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
 }'''

    explanation = (
        "This fix implements semantic caching using Redis to reduce redundant OpenAI API calls. "
        "Key changes:\n\n"
        "1. **Added Redis caching layer**: Cache API responses using content-based hashes as keys.\n"
        "2. **SHA-256 hashing**: Generate deterministic cache keys from input content.\n"
        "3. **24-hour TTL**: Cached responses expire after 24 hours to balance freshness vs. cost.\n"
        "4. **Embedding serialization**: Properly serialize/deserialize embedding arrays.\n\n"
        "Expected impact: ~90% reduction in API calls for repeated queries, "
        "saving approximately $1,800/month based on current usage patterns."
    )

    fix_data = {
        "issue_id": issue_id,
        "original_code": original_code,
        "fixed_code": fixed_code,
        "diff": diff,
        "confidence_score": 0.92,
        "explanation": explanation,
    }

    result = supabase.table("fixes").insert(fix_data).execute()
    fix_id = result.data[0]["id"]
    print(f"Created demo fix (ID: {fix_id})")


def main():
    print("=" * 60)
    print("Code Health Platform - Seed Demo Data")
    print("=" * 60)

    try:
        supabase = get_supabase()
        print("Connected to Supabase")
    except Exception as e:
        print(f"Error: {e}")
        print("\nMake sure to set environment variables:")
        print("  export SUPABASE_URL='your-supabase-url'")
        print("  export SUPABASE_SERVICE_KEY='your-service-key'")
        sys.exit(1)

    # Seed data
    print("\n--- Seeding Demo User ---")
    user_id = seed_demo_user(supabase)

    print("\n--- Seeding Brex Transactions ---")
    seed_brex_transactions(supabase, user_id)

    print("\n--- Seeding Demo Issue ---")
    issue_id = seed_demo_issue(supabase, user_id)

    print("\n--- Seeding Demo Fix ---")
    seed_demo_fix(supabase, issue_id)

    print("\n" + "=" * 60)
    print("Demo data seeded successfully!")
    print("=" * 60)
    print("\nDemo credentials:")
    print("  Email: demo@codehealth.ai")
    print("  Password: demo123")
    print("\nYou can now log in and see the pre-created issue with a fix.")


if __name__ == "__main__":
    main()
