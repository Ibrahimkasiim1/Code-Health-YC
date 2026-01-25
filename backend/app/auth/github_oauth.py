import httpx
from typing import Optional
from ..config import get_settings
from ..database import get_supabase


async def get_github_auth_url(state: str) -> str:
    """Generate GitHub OAuth authorization URL."""
    settings = get_settings()
    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": f"{settings.frontend_url}/auth/github/callback",
        "scope": "repo user:email",
        "state": state,
    }
    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://github.com/login/oauth/authorize?{query_string}"


async def exchange_code_for_token(code: str) -> Optional[dict]:
    """Exchange OAuth code for access token."""
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
        if response.status_code == 200:
            return response.json()
        return None


async def get_github_user(access_token: str) -> Optional[dict]:
    """Get GitHub user info using access token."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        if response.status_code == 200:
            return response.json()
        return None


async def get_github_user_emails(access_token: str) -> list:
    """Get GitHub user emails."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/user/emails",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        if response.status_code == 200:
            return response.json()
        return []


async def save_github_installation(
    user_id: str,
    access_token: str,
    refresh_token: Optional[str] = None,
    installation_id: Optional[int] = None,
) -> dict:
    """Save GitHub installation/token for a user."""
    supabase = get_supabase()

    # Check if installation already exists for user
    existing = supabase.table("github_installations").select("*").eq("user_id", user_id).execute()

    data = {
        "user_id": user_id,
        "access_token_encrypted": access_token,  # In production, encrypt this
        "refresh_token_encrypted": refresh_token,
        "installation_id": installation_id,
    }

    if existing.data:
        # Update existing
        result = supabase.table("github_installations").update(data).eq("user_id", user_id).execute()
    else:
        # Create new
        result = supabase.table("github_installations").insert(data).execute()

    return result.data[0] if result.data else {}
