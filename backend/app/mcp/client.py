import httpx
from typing import Any, Optional
from ..config import get_settings


class MCPClient:
    """Client for interacting with the MCP server."""

    def __init__(self, base_url: str = "http://localhost:3001"):
        self.base_url = base_url

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        """Call a tool on the MCP server."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/tools/{tool_name}",
                json=arguments,
                timeout=30.0,
            )
            if response.status_code == 200:
                return response.json()
            return None

    async def get_spending_summary(self, user_id: str, days: int = 30) -> Optional[dict]:
        """Get spending summary for a user."""
        return await self.call_tool("get_spending_summary", {
            "user_id": user_id,
            "days": days,
        })

    async def calculate_unit_economics(
        self,
        user_id: str,
        service: str,
        total_users: int,
        total_requests: int,
    ) -> Optional[dict]:
        """Calculate unit economics for a service."""
        return await self.call_tool("calculate_unit_economics", {
            "user_id": user_id,
            "service": service,
            "total_users": total_users,
            "total_requests": total_requests,
        })

    async def get_repository_context(self, repo_id: str) -> Optional[dict]:
        """Get repository context."""
        return await self.call_tool("get_repository_context", {
            "repo_id": repo_id,
        })


# For MVP, we'll use direct database access instead of MCP when MCP server isn't running
class DirectDataAccess:
    """Direct database access fallback for when MCP server isn't available."""

    def __init__(self):
        from ..database import get_supabase
        self.supabase = get_supabase()

    async def get_spending_summary(self, user_id: str, days: int = 30) -> dict:
        """Get spending summary directly from database."""
        from datetime import datetime, timedelta

        cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()

        result = self.supabase.table("brex_transactions").select("*").eq("user_id", user_id).gte("transaction_date", cutoff_date).execute()

        transactions = result.data or []

        # Aggregate by service
        by_service = {}
        total = 0.0
        for tx in transactions:
            service = tx.get("detected_service", tx["merchant"])
            amount = float(tx["amount"])
            total += amount
            if service not in by_service:
                by_service[service] = {"amount": 0.0, "count": 0}
            by_service[service]["amount"] += amount
            by_service[service]["count"] += 1

        return {
            "total_spending": total,
            "by_service": by_service,
            "transaction_count": len(transactions),
            "period_days": days,
        }

    async def calculate_unit_economics(
        self,
        user_id: str,
        service: str,
        total_users: int,
        total_requests: int,
    ) -> dict:
        """Calculate unit economics."""
        spending = await self.get_spending_summary(user_id, days=30)
        service_spending = spending["by_service"].get(service, {}).get("amount", 0)

        cost_per_user = service_spending / total_users if total_users > 0 else 0
        cost_per_request = service_spending / total_requests if total_requests > 0 else 0

        # Industry benchmarks (hardcoded for demo)
        benchmarks = {
            "openai": {"cost_per_user": 5.0, "cost_per_1k_requests": 0.50},
            "anthropic": {"cost_per_user": 4.0, "cost_per_1k_requests": 0.40},
            "gemini": {"cost_per_user": 3.0, "cost_per_1k_requests": 0.25},
            "default": {"cost_per_user": 3.0, "cost_per_1k_requests": 0.30},
        }

        benchmark = benchmarks.get(service.lower(), benchmarks["default"])

        return {
            "service": service,
            "monthly_spending": service_spending,
            "cost_per_user": cost_per_user,
            "cost_per_request": cost_per_request,
            "cost_per_1k_requests": cost_per_request * 1000,
            "benchmark_cost_per_user": benchmark["cost_per_user"],
            "benchmark_cost_per_1k_requests": benchmark["cost_per_1k_requests"],
            "efficiency_ratio": benchmark["cost_per_user"] / cost_per_user if cost_per_user > 0 else 0,
        }

    async def get_repository_context(self, repo_id: str) -> Optional[dict]:
        """Get repository context from database."""
        result = self.supabase.table("repository_contexts").select("*").eq("repo_id", repo_id).single().execute()

        if result.data:
            return result.data.get("context_json")
        return None


def get_mcp_client():
    """Get MCP client or fallback to direct access."""
    # For MVP, use direct database access
    return DirectDataAccess()
