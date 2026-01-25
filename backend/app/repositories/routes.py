from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from typing import List, Optional
from ..auth.utils import get_current_user
from ..database import get_supabase
from .github_service import (
    get_user_github_token,
    list_user_repos,
    get_file_content,
)

router = APIRouter()


class ConnectRepoRequest(BaseModel):
    repo_full_name: str
    default_branch: str = "main"


class RepoResponse(BaseModel):
    id: str
    repo_full_name: str
    default_branch: str
    created_at: str


@router.get("/available")
async def list_available_repos(current_user: dict = Depends(get_current_user)):
    """List repositories available to connect from GitHub."""
    access_token = await get_user_github_token(current_user["id"])
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub not connected. Please connect your GitHub account first.",
        )

    repos = await list_user_repos(access_token)
    return [
        {
            "full_name": repo["full_name"],
            "name": repo["name"],
            "owner": repo["owner"]["login"],
            "private": repo["private"],
            "default_branch": repo["default_branch"],
            "description": repo.get("description"),
            "updated_at": repo["updated_at"],
        }
        for repo in repos
    ]


@router.post("/connect", response_model=RepoResponse)
async def connect_repository(
    request: ConnectRepoRequest,
    current_user: dict = Depends(get_current_user),
):
    """Connect a repository for analysis."""
    supabase = get_supabase()

    # Get user's GitHub installation
    installation = supabase.table("github_installations").select("id").eq("user_id", current_user["id"]).single().execute()

    if not installation.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub not connected",
        )

    # Check if already connected
    existing = supabase.table("connected_repositories").select("id").eq("repo_full_name", request.repo_full_name).execute()

    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository already connected",
        )

    # Connect repository
    result = supabase.table("connected_repositories").insert({
        "installation_id": installation.data["id"],
        "repo_full_name": request.repo_full_name,
        "default_branch": request.default_branch,
    }).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to connect repository",
        )

    repo = result.data[0]
    return RepoResponse(
        id=repo["id"],
        repo_full_name=repo["repo_full_name"],
        default_branch=repo["default_branch"],
        created_at=repo["created_at"],
    )


@router.get("/connected", response_model=List[RepoResponse])
async def list_connected_repos(current_user: dict = Depends(get_current_user)):
    """List connected repositories."""
    supabase = get_supabase()

    # Get user's installation
    installation = supabase.table("github_installations").select("id").eq("user_id", current_user["id"]).execute()

    if not installation.data:
        return []

    installation_ids = [i["id"] for i in installation.data]

    # Get connected repos
    repos = supabase.table("connected_repositories").select("*").in_("installation_id", installation_ids).execute()

    return [
        RepoResponse(
            id=repo["id"],
            repo_full_name=repo["repo_full_name"],
            default_branch=repo["default_branch"],
            created_at=repo["created_at"],
        )
        for repo in repos.data
    ]


@router.delete("/{repo_id}")
async def disconnect_repository(
    repo_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Disconnect a repository."""
    supabase = get_supabase()

    # Verify ownership through installation
    installation = supabase.table("github_installations").select("id").eq("user_id", current_user["id"]).execute()

    if not installation.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    installation_ids = [i["id"] for i in installation.data]

    # Delete repository
    result = supabase.table("connected_repositories").delete().eq("id", repo_id).in_("installation_id", installation_ids).execute()

    return {"success": True}


@router.get("/{repo_id}/file")
async def get_repository_file(
    repo_id: str,
    path: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a file from a connected repository."""
    supabase = get_supabase()

    # Get repo info
    repo = supabase.table("connected_repositories").select("*, github_installations!inner(*)").eq("id", repo_id).single().execute()

    if not repo.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    access_token = repo.data["github_installations"]["access_token_encrypted"]
    owner, repo_name = repo.data["repo_full_name"].split("/")

    content = await get_file_content(
        access_token, owner, repo_name, path, repo.data["default_branch"]
    )

    if content is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    return {"path": path, "content": content}
