from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from typing import List, Optional
from ..auth.utils import get_current_user
from ..database import get_supabase
from ..repositories.github_service import create_pr_from_fix

router = APIRouter()


class IssueResponse(BaseModel):
    id: str
    repo_id: str
    agent_type: str
    issue_type: str
    title: str
    description: Optional[str]
    severity: str
    status: str
    metrics: Optional[dict]
    file_path: Optional[str]
    created_at: str
    repo_full_name: Optional[str] = None


class FixResponse(BaseModel):
    id: str
    issue_id: str
    original_code: Optional[str]
    fixed_code: Optional[str]
    diff: Optional[str]
    confidence_score: Optional[float]
    explanation: Optional[str]
    created_at: str


class CreatePRRequest(BaseModel):
    fix_id: str


class PRResponse(BaseModel):
    id: str
    pr_number: int
    pr_url: str
    status: str


@router.get("/", response_model=List[IssueResponse])
async def list_issues(
    status_filter: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List all issues for user's connected repositories."""
    supabase = get_supabase()

    # Get user's installation
    installation = supabase.table("github_installations").select("id").eq("user_id", current_user["id"]).execute()

    if not installation.data:
        return []

    installation_ids = [i["id"] for i in installation.data]

    # Get connected repos
    repos = supabase.table("connected_repositories").select("id, repo_full_name").in_("installation_id", installation_ids).execute()

    if not repos.data:
        return []

    repo_ids = [r["id"] for r in repos.data]
    repo_map = {r["id"]: r["repo_full_name"] for r in repos.data}

    # Get issues
    query = supabase.table("issues").select("*").in_("repo_id", repo_ids).order("created_at", desc=True)

    if status_filter:
        query = query.eq("status", status_filter)

    issues = query.execute()

    return [
        IssueResponse(
            id=issue["id"],
            repo_id=issue["repo_id"],
            agent_type=issue["agent_type"],
            issue_type=issue["issue_type"],
            title=issue["title"],
            description=issue["description"],
            severity=issue["severity"],
            status=issue["status"],
            metrics=issue["metrics"],
            file_path=issue.get("file_path"),
            created_at=issue["created_at"],
            repo_full_name=repo_map.get(issue["repo_id"]),
        )
        for issue in issues.data
    ]


@router.get("/{issue_id}", response_model=IssueResponse)
async def get_issue(
    issue_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a specific issue."""
    supabase = get_supabase()

    issue = supabase.table("issues").select("*, connected_repositories!inner(repo_full_name, github_installations!inner(user_id))").eq("id", issue_id).single().execute()

    if not issue.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Issue not found",
        )

    # Verify user owns this issue through installation
    if issue.data["connected_repositories"]["github_installations"]["user_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return IssueResponse(
        id=issue.data["id"],
        repo_id=issue.data["repo_id"],
        agent_type=issue.data["agent_type"],
        issue_type=issue.data["issue_type"],
        title=issue.data["title"],
        description=issue.data["description"],
        severity=issue.data["severity"],
        status=issue.data["status"],
        metrics=issue.data["metrics"],
        file_path=issue.data.get("file_path"),
        created_at=issue.data["created_at"],
        repo_full_name=issue.data["connected_repositories"]["repo_full_name"],
    )


@router.get("/{issue_id}/fix", response_model=FixResponse)
async def get_issue_fix(
    issue_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get the generated fix for an issue."""
    supabase = get_supabase()

    # First verify access to the issue
    issue = supabase.table("issues").select("*, connected_repositories!inner(github_installations!inner(user_id))").eq("id", issue_id).single().execute()

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

    # Get fix
    fix = supabase.table("fixes").select("*").eq("issue_id", issue_id).single().execute()

    if not fix.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No fix generated for this issue",
        )

    return FixResponse(
        id=fix.data["id"],
        issue_id=fix.data["issue_id"],
        original_code=fix.data["original_code"],
        fixed_code=fix.data["fixed_code"],
        diff=fix.data["diff"],
        confidence_score=fix.data["confidence_score"],
        explanation=fix.data["explanation"],
        created_at=fix.data["created_at"],
    )


@router.post("/{issue_id}/create-pr", response_model=PRResponse)
async def create_pr_for_issue(
    issue_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Create a GitHub PR for an issue's fix."""
    supabase = get_supabase()

    # Get issue with repo info
    issue = supabase.table("issues").select("*, connected_repositories!inner(repo_full_name, github_installations!inner(user_id))").eq("id", issue_id).single().execute()

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

    # Get fix
    fix = supabase.table("fixes").select("*").eq("issue_id", issue_id).single().execute()

    if not fix.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No fix available for this issue",
        )

    # Check if PR already exists
    existing_pr = supabase.table("pull_requests").select("*").eq("fix_id", fix.data["id"]).execute()

    if existing_pr.data:
        pr = existing_pr.data[0]
        return PRResponse(
            id=pr["id"],
            pr_number=pr["pr_number"],
            pr_url=pr["pr_url"],
            status=pr["status"],
        )

    # Create PR
    pr_result = await create_pr_from_fix(
        user_id=current_user["id"],
        repo_full_name=issue.data["connected_repositories"]["repo_full_name"],
        file_path=issue.data["file_path"],
        fixed_code=fix.data["fixed_code"],
        issue_title=issue.data["title"],
        issue_description=issue.data["description"],
        fix_explanation=fix.data["explanation"],
    )

    if not pr_result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create pull request",
        )

    # Save PR to database
    pr_data = supabase.table("pull_requests").insert({
        "fix_id": fix.data["id"],
        "repo_id": issue.data["repo_id"],
        "pr_number": pr_result["number"],
        "pr_url": pr_result["html_url"],
        "status": "open",
    }).execute()

    # Update issue status
    supabase.table("issues").update({"status": "in_progress"}).eq("id", issue_id).execute()

    pr = pr_data.data[0]
    return PRResponse(
        id=pr["id"],
        pr_number=pr["pr_number"],
        pr_url=pr["pr_url"],
        status=pr["status"],
    )


@router.patch("/{issue_id}/status")
async def update_issue_status(
    issue_id: str,
    new_status: str,
    current_user: dict = Depends(get_current_user),
):
    """Update an issue's status."""
    if new_status not in ["open", "in_progress", "resolved", "dismissed"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status",
        )

    supabase = get_supabase()

    # Verify access
    issue = supabase.table("issues").select("*, connected_repositories!inner(github_installations!inner(user_id))").eq("id", issue_id).single().execute()

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

    supabase.table("issues").update({"status": new_status}).eq("id", issue_id).execute()

    return {"success": True, "status": new_status}
