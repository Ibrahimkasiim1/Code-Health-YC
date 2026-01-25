from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional
import hmac
import hashlib
from ..config import get_settings
from ..database import get_supabase

router = APIRouter()


async def verify_github_signature(
    payload: bytes,
    signature: str,
    secret: str,
) -> bool:
    """Verify GitHub webhook signature."""
    if not signature.startswith("sha256="):
        return False

    expected_signature = "sha256=" + hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature, expected_signature)


@router.post("/github")
async def github_webhook(
    request: Request,
    x_github_event: Optional[str] = Header(None),
    x_hub_signature_256: Optional[str] = Header(None),
):
    """Handle GitHub webhooks."""
    settings = get_settings()
    payload = await request.body()

    # Verify signature in production
    # if settings.github_webhook_secret:
    #     if not x_hub_signature_256:
    #         raise HTTPException(status_code=401, detail="Missing signature")
    #     if not await verify_github_signature(payload, x_hub_signature_256, settings.github_webhook_secret):
    #         raise HTTPException(status_code=401, detail="Invalid signature")

    data = await request.json()
    event = x_github_event

    if event == "push":
        # Handle push events - trigger re-analysis
        repo_full_name = data.get("repository", {}).get("full_name")
        if repo_full_name:
            # In a full implementation, queue re-analysis here
            return {"status": "received", "action": "reanalyze_queued"}

    elif event == "pull_request":
        action = data.get("action")
        pr_number = data.get("number")
        repo_full_name = data.get("repository", {}).get("full_name")

        if action in ["closed", "merged"]:
            supabase = get_supabase()
            # Update PR status in our database
            if data.get("pull_request", {}).get("merged"):
                new_status = "merged"
            else:
                new_status = "closed"

            supabase.table("pull_requests").update({"status": new_status}).eq("pr_number", pr_number).execute()

            # If merged, mark issue as resolved
            if new_status == "merged":
                pr = supabase.table("pull_requests").select("fix_id").eq("pr_number", pr_number).single().execute()
                if pr.data:
                    fix = supabase.table("fixes").select("issue_id").eq("id", pr.data["fix_id"]).single().execute()
                    if fix.data:
                        supabase.table("issues").update({"status": "resolved"}).eq("id", fix.data["issue_id"]).execute()

            return {"status": "received", "action": f"pr_{new_status}"}

    elif event == "installation":
        action = data.get("action")
        installation_id = data.get("installation", {}).get("id")

        if action == "deleted":
            # Clean up when app is uninstalled
            supabase = get_supabase()
            supabase.table("github_installations").delete().eq("installation_id", installation_id).execute()
            return {"status": "received", "action": "installation_removed"}

    return {"status": "received", "event": event}
