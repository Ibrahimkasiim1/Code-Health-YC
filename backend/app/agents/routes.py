from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from ..auth.utils import get_current_user
from ..database import get_supabase
from ..repositories.github_service import get_user_github_token
from .context_agent import ContextAgent
from .business_intel_agent import BusinessIntelAgent
from .fix_agent import FixAgent

router = APIRouter()


class AnalyzeRequest(BaseModel):
    repo_id: str
    total_users: int = 100
    total_requests: int = 10000


class GenerateFixRequest(BaseModel):
    issue_id: str


@router.post("/analyze")
async def analyze_repository(
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Trigger analysis of a repository."""
    supabase = get_supabase()

    # Get repo info
    repo = supabase.table("connected_repositories").select(
        "*, github_installations!inner(user_id, access_token_encrypted)"
    ).eq("id", request.repo_id).single().execute()

    if not repo.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    if repo.data["github_installations"]["user_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    access_token = repo.data["github_installations"]["access_token_encrypted"]
    owner, repo_name = repo.data["repo_full_name"].split("/")

    # Run analysis synchronously for MVP (in production, use Celery)
    # First, analyze context
    context_agent = ContextAgent()
    context = await context_agent.analyze(
        access_token=access_token,
        owner=owner,
        repo=repo_name,
        repo_id=request.repo_id,
    )

    # Then, analyze for cost issues
    biz_agent = BusinessIntelAgent()
    issues = await biz_agent.analyze(
        user_id=current_user["id"],
        repo_id=request.repo_id,
        access_token=access_token,
        owner=owner,
        repo=repo_name,
        total_users=request.total_users,
        total_requests=request.total_requests,
    )

    return {
        "success": True,
        "context": context,
        "issues_found": len(issues),
        "issues": [
            {"id": i["id"], "title": i["title"], "severity": i["severity"]}
            for i in issues
        ],
    }


@router.post("/generate-fix")
async def generate_fix(
    request: GenerateFixRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate a fix for an issue."""
    supabase = get_supabase()

    # Get issue with repo info
    issue = supabase.table("issues").select(
        "*, connected_repositories!inner(repo_full_name, github_installations!inner(user_id, access_token_encrypted))"
    ).eq("id", request.issue_id).single().execute()

    if not issue.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Issue not found",
        )

    if issue.data["connected_repositories"]["github_installations"]["user_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    # Check if fix already exists
    existing_fix = supabase.table("fixes").select("*").eq("issue_id", request.issue_id).execute()
    if existing_fix.data:
        return {
            "success": True,
            "fix": existing_fix.data[0],
            "cached": True,
        }

    access_token = issue.data["connected_repositories"]["github_installations"]["access_token_encrypted"]
    owner, repo_name = issue.data["connected_repositories"]["repo_full_name"].split("/")

    # Generate fix
    fix_agent = FixAgent()
    fix = await fix_agent.generate_fix(
        issue_id=request.issue_id,
        access_token=access_token,
        owner=owner,
        repo=repo_name,
    )

    if not fix:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate fix",
        )

    return {
        "success": True,
        "fix": fix,
        "cached": False,
    }
