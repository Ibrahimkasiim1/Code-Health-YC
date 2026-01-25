import json
from typing import Optional
from .base_agent import BaseAgent


class BusinessIntelAgent(BaseAgent):
    """Agent for analyzing API spending and detecting cost optimization opportunities."""

    SYSTEM_PROMPT = """You are a code health analyst specializing in API cost optimization.
Your job is to analyze code patterns and spending data to identify wasteful API usage.

Focus on:
1. Identifying missing caching for expensive API calls
2. Detecting redundant or duplicate API calls
3. Finding opportunities to batch requests
4. Spotting unnecessary API calls that could be avoided

When you find an issue, provide:
- Clear title summarizing the problem
- Detailed description with financial impact
- Severity based on cost impact (critical: >$500/month, high: >$100/month, medium: >$50/month, low: <$50/month)
- Specific file and code location

Be specific and actionable. Include dollar amounts when possible."""

    async def analyze(
        self,
        user_id: str,
        repo_id: str,
        access_token: str,
        owner: str,
        repo: str,
        total_users: int = 100,
        total_requests: int = 10000,
    ) -> list:
        """Analyze repository for cost optimization opportunities."""
        issues_found = []

        # Get spending data
        spending = await self.mcp_client.get_spending_summary(user_id, days=30)

        if not spending or not spending.get("by_service"):
            return issues_found

        # Analyze each service with significant spending
        for service, service_data in spending["by_service"].items():
            if service_data["amount"] < 50:  # Skip services with low spending
                continue

            # Calculate unit economics
            economics = await self.mcp_client.calculate_unit_economics(
                user_id, service, total_users, total_requests
            )

            # Check if spending is above industry benchmark
            if economics and economics.get("efficiency_ratio", 1) < 0.5:
                # Spending is more than 2x the benchmark
                issue = await self._analyze_service_usage(
                    access_token, owner, repo, repo_id, service, economics
                )
                if issue:
                    issues_found.append(issue)

        return issues_found

    async def _analyze_service_usage(
        self,
        access_token: str,
        owner: str,
        repo: str,
        repo_id: str,
        service: str,
        economics: dict,
    ) -> Optional[dict]:
        """Analyze code for a specific service's usage patterns."""
        # Search for API usage patterns
        search_patterns = {
            "openai": ["openai", "ChatCompletion", "Completion.create", "chat.completions"],
            "anthropic": ["anthropic", "Anthropic", "claude", "messages.create"],
            "stripe": ["stripe", "Stripe"],
        }

        patterns = search_patterns.get(service.lower(), [service])

        # Find files using this API
        code_locations = []
        for pattern in patterns:
            results = await self.search_github_code(access_token, owner, repo, pattern)
            for result in results:
                if result["path"] not in [loc["path"] for loc in code_locations]:
                    code_locations.append({
                        "path": result["path"],
                        "url": result.get("html_url"),
                    })

        if not code_locations:
            return None

        # Get content of the most relevant file
        primary_file = code_locations[0]["path"]
        file_content = await self.get_github_file(access_token, owner, repo, primary_file)

        if not file_content:
            return None

        # Analyze the code with LLM
        analysis = await self._analyze_code_with_llm(
            service, economics, primary_file, file_content
        )

        if not analysis:
            return None

        # Calculate financial metrics
        monthly_spend = economics["monthly_spending"]
        benchmark_spend = economics["benchmark_cost_per_user"] * 100  # Assume 100 users
        potential_savings = max(0, monthly_spend - benchmark_spend)
        weekly_savings = potential_savings / 4

        # Determine severity
        if monthly_spend > 500:
            severity = "critical"
        elif monthly_spend > 100:
            severity = "high"
        elif monthly_spend > 50:
            severity = "medium"
        else:
            severity = "low"

        # Create issue
        metrics = {
            "monthly_spending": monthly_spend,
            "cost_per_user": economics["cost_per_user"],
            "benchmark_cost_per_user": economics["benchmark_cost_per_user"],
            "efficiency_ratio": economics["efficiency_ratio"],
            "potential_monthly_savings": potential_savings,
            "potential_weekly_savings": weekly_savings,
            "affected_files": [loc["path"] for loc in code_locations],
        }

        issue = self.save_issue(
            repo_id=repo_id,
            agent_type="business_intel",
            issue_type="cost_optimization",
            title=analysis.get("title", f"High {service} API Costs Detected"),
            description=analysis.get("description", ""),
            severity=severity,
            metrics=metrics,
            file_path=primary_file,
        )

        return issue

    async def _analyze_code_with_llm(
        self,
        service: str,
        economics: dict,
        file_path: str,
        file_content: str,
    ) -> Optional[dict]:
        """Use LLM to analyze code and generate issue details."""
        prompt = f"""Analyze this code for {service} API usage inefficiencies.

## Spending Data
- Monthly spending: ${economics['monthly_spending']:.2f}
- Cost per user: ${economics['cost_per_user']:.2f}
- Industry benchmark: ${economics['benchmark_cost_per_user']:.2f}/user
- Efficiency: {economics['efficiency_ratio']:.1%} (lower means more expensive than benchmark)

## File: {file_path}
```
{file_content[:3000]}
```

Analyze this code and identify the main cost driver. Look for:
1. Missing caching (responses not cached, same queries repeated)
2. No request batching
3. Redundant calls
4. Inefficient prompts

Respond in JSON format:
{{
  "title": "Short title describing the issue (max 60 chars)",
  "description": "Detailed description including: what's wrong, why it's costly, specific code lines if possible, and recommended fix approach",
  "root_cause": "One of: missing_cache, no_batching, redundant_calls, inefficient_prompts, other",
  "affected_code_snippet": "The specific problematic code"
}}"""

        try:
            response = await self.invoke_llm(self.SYSTEM_PROMPT, prompt)
            # Parse JSON from response
            # Handle potential markdown code blocks
            if "```json" in response:
                response = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                response = response.split("```")[1].split("```")[0]

            return json.loads(response.strip())
        except Exception:
            # Fallback if LLM analysis fails
            return {
                "title": f"High {service} API Costs - Missing Optimization",
                "description": f"""Your {service} API spending is significantly above industry benchmarks.

**Current Situation:**
- Monthly spend: ${economics['monthly_spending']:.2f}
- Cost per user: ${economics['cost_per_user']:.2f}
- Industry benchmark: ${economics['benchmark_cost_per_user']:.2f}/user

**Impact:**
You're spending {1/economics['efficiency_ratio']:.1f}x more than similar companies.

**Recommendation:**
Review the API usage in `{file_path}` for caching opportunities and request optimization.""",
                "root_cause": "missing_cache",
            }
