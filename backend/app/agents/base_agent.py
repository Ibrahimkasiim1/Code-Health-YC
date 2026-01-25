from abc import ABC, abstractmethod
from typing import Optional, Any
import httpx
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from ..config import get_settings
from ..database import get_supabase
from ..mcp.client import get_mcp_client


class BaseAgent(ABC):
    """Base class for all agents."""

    def __init__(self):
        self.settings = get_settings()
        self.supabase = get_supabase()
        self.mcp_client = get_mcp_client()
        self.llm = ChatAnthropic(
            model="claude-3-5-sonnet-20241022",
            anthropic_api_key=self.settings.anthropic_api_key,
            temperature=0,
        )

    @abstractmethod
    async def analyze(self, *args, **kwargs) -> dict:
        """Perform analysis - to be implemented by subclasses."""
        pass

    async def get_github_file(
        self,
        access_token: str,
        owner: str,
        repo: str,
        path: str,
        ref: str = "main",
    ) -> Optional[str]:
        """Fetch a file from GitHub."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.raw+json",
                },
                params={"ref": ref},
            )
            if response.status_code == 200:
                return response.text
            return None

    async def search_github_code(
        self,
        access_token: str,
        owner: str,
        repo: str,
        query: str,
    ) -> list:
        """Search code in a repository."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.github.com/search/code",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
                params={
                    "q": f"{query} repo:{owner}/{repo}",
                    "per_page": 10,
                },
            )
            if response.status_code == 200:
                return response.json().get("items", [])
            return []

    async def invoke_llm(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> str:
        """Invoke the LLM with a prompt."""
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
        response = await self.llm.ainvoke(messages)
        return response.content

    def save_issue(
        self,
        repo_id: str,
        agent_type: str,
        issue_type: str,
        title: str,
        description: str,
        severity: str,
        metrics: Optional[dict] = None,
        file_path: Optional[str] = None,
    ) -> dict:
        """Save an issue to the database."""
        result = self.supabase.table("issues").insert({
            "repo_id": repo_id,
            "agent_type": agent_type,
            "issue_type": issue_type,
            "title": title,
            "description": description,
            "severity": severity,
            "metrics": metrics,
            "file_path": file_path,
            "status": "open",
        }).execute()

        return result.data[0] if result.data else {}

    def save_fix(
        self,
        issue_id: str,
        original_code: str,
        fixed_code: str,
        diff: str,
        confidence_score: float,
        explanation: str,
    ) -> dict:
        """Save a fix to the database."""
        result = self.supabase.table("fixes").insert({
            "issue_id": issue_id,
            "original_code": original_code,
            "fixed_code": fixed_code,
            "diff": diff,
            "confidence_score": confidence_score,
            "explanation": explanation,
        }).execute()

        return result.data[0] if result.data else {}
