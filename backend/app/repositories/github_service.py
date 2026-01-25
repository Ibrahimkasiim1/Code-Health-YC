import httpx
from typing import Optional
from ..database import get_supabase


async def get_user_github_token(user_id: str) -> Optional[str]:
    """Get GitHub access token for a user."""
    supabase = get_supabase()
    result = supabase.table("github_installations").select("access_token_encrypted").eq("user_id", user_id).single().execute()

    if result.data:
        return result.data["access_token_encrypted"]
    return None


async def list_user_repos(access_token: str) -> list:
    """List repositories accessible by the user."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/user/repos",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
            params={"per_page": 100, "sort": "updated"},
        )
        if response.status_code == 200:
            return response.json()
        return []


async def get_repo_contents(
    access_token: str, owner: str, repo: str, path: str, ref: str = "main"
) -> Optional[dict]:
    """Get file contents from a repository."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
            params={"ref": ref},
        )
        if response.status_code == 200:
            return response.json()
        return None


async def get_file_content(
    access_token: str, owner: str, repo: str, path: str, ref: str = "main"
) -> Optional[str]:
    """Get raw file content from a repository."""
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


async def create_branch(
    access_token: str, owner: str, repo: str, branch_name: str, base_sha: str
) -> bool:
    """Create a new branch from a base SHA."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.github.com/repos/{owner}/{repo}/git/refs",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
            json={
                "ref": f"refs/heads/{branch_name}",
                "sha": base_sha,
            },
        )
        return response.status_code == 201


async def get_default_branch_sha(
    access_token: str, owner: str, repo: str, branch: str = "main"
) -> Optional[str]:
    """Get the SHA of the default branch."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/ref/heads/{branch}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        if response.status_code == 200:
            return response.json()["object"]["sha"]
        return None


async def update_file(
    access_token: str,
    owner: str,
    repo: str,
    path: str,
    content: str,
    message: str,
    branch: str,
    sha: Optional[str] = None,
) -> Optional[dict]:
    """Create or update a file in the repository."""
    import base64

    async with httpx.AsyncClient() as client:
        # If updating, we need the current file's SHA
        if sha is None:
            # Get current file SHA
            current = await get_repo_contents(access_token, owner, repo, path, branch)
            if current:
                sha = current.get("sha")

        data = {
            "message": message,
            "content": base64.b64encode(content.encode()).decode(),
            "branch": branch,
        }
        if sha:
            data["sha"] = sha

        response = await client.put(
            f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
            json=data,
        )
        if response.status_code in [200, 201]:
            return response.json()
        return None


async def create_pull_request(
    access_token: str,
    owner: str,
    repo: str,
    title: str,
    body: str,
    head: str,
    base: str = "main",
) -> Optional[dict]:
    """Create a pull request."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
            json={
                "title": title,
                "body": body,
                "head": head,
                "base": base,
            },
        )
        if response.status_code == 201:
            return response.json()
        return None


async def create_pr_from_fix(
    user_id: str,
    repo_full_name: str,
    file_path: str,
    fixed_code: str,
    issue_title: str,
    issue_description: str,
    fix_explanation: str,
) -> Optional[dict]:
    """Create a PR with the fix applied."""
    access_token = await get_user_github_token(user_id)
    if not access_token:
        return None

    owner, repo = repo_full_name.split("/")

    # Get default branch SHA
    base_sha = await get_default_branch_sha(access_token, owner, repo)
    if not base_sha:
        return None

    # Create new branch
    import time
    branch_name = f"codehealth/fix-{int(time.time())}"
    if not await create_branch(access_token, owner, repo, branch_name, base_sha):
        return None

    # Update file with fix
    commit_message = f"fix: {issue_title}\n\nGenerated by Code Health Platform"
    file_result = await update_file(
        access_token, owner, repo, file_path, fixed_code, commit_message, branch_name
    )
    if not file_result:
        return None

    # Create PR
    pr_body = f"""## Issue

{issue_description}

## Fix

{fix_explanation}

---
*This PR was automatically generated by [Code Health Platform](https://codehealth.ai)*
"""
    pr_result = await create_pull_request(
        access_token,
        owner,
        repo,
        f"fix: {issue_title}",
        pr_body,
        branch_name,
    )

    return pr_result
