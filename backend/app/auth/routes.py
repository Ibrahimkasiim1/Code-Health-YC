import secrets
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from ..database import get_supabase
from .utils import hash_password, verify_password, create_access_token, get_current_user
from .github_oauth import (
    get_github_auth_url,
    exchange_code_for_token,
    get_github_user,
    get_github_user_emails,
    save_github_installation,
)

router = APIRouter()


class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class GitHubCallbackRequest(BaseModel):
    code: str
    state: str


@router.post("/signup", response_model=TokenResponse)
async def signup(request: SignupRequest):
    supabase = get_supabase()

    # Check if user exists
    existing = supabase.table("users").select("id").eq("email", request.email).execute()
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create user
    password_hash = hash_password(request.password)
    result = supabase.table("users").insert({
        "email": request.email,
        "password_hash": password_hash,
    }).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user",
        )

    user = result.data[0]
    access_token = create_access_token({"sub": user["id"]})

    return TokenResponse(
        access_token=access_token,
        user={"id": user["id"], "email": user["email"]},
    )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    supabase = get_supabase()

    result = supabase.table("users").select("*").eq("email", request.email).single().execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    user = result.data
    if not verify_password(request.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token({"sub": user["id"]})

    return TokenResponse(
        access_token=access_token,
        user={"id": user["id"], "email": user["email"]},
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "created_at": current_user["created_at"],
    }


@router.get("/github/authorize")
async def github_authorize():
    """Get GitHub OAuth authorization URL."""
    state = secrets.token_urlsafe(32)
    auth_url = await get_github_auth_url(state)
    return {"auth_url": auth_url, "state": state}


@router.post("/github/callback")
async def github_callback(
    request: GitHubCallbackRequest,
    current_user: dict = Depends(get_current_user),
):
    """Handle GitHub OAuth callback."""
    # Exchange code for token
    token_data = await exchange_code_for_token(request.code)
    if not token_data or "access_token" not in token_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to exchange code for token",
        )

    access_token = token_data["access_token"]

    # Get GitHub user info
    github_user = await get_github_user(access_token)
    if not github_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to get GitHub user info",
        )

    # Save installation
    installation = await save_github_installation(
        user_id=current_user["id"],
        access_token=access_token,
        refresh_token=token_data.get("refresh_token"),
    )

    return {
        "success": True,
        "github_user": {
            "login": github_user["login"],
            "avatar_url": github_user.get("avatar_url"),
        },
        "installation_id": installation.get("id"),
    }


@router.get("/github/status")
async def github_status(current_user: dict = Depends(get_current_user)):
    """Check if user has connected GitHub."""
    supabase = get_supabase()
    result = supabase.table("github_installations").select("id, created_at").eq("user_id", current_user["id"]).execute()

    return {
        "connected": len(result.data) > 0,
        "installation": result.data[0] if result.data else None,
    }
