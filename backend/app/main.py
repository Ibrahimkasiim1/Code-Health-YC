from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .auth.routes import router as auth_router
from .repositories.routes import router as repositories_router
from .issues.routes import router as issues_router
from .webhooks.routes import router as webhooks_router
from .agents.routes import router as agents_router

settings = get_settings()

app = FastAPI(
    title="Code Health Platform API",
    description="AI-Powered Code Health Analysis and Fix Generation",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix="/auth", tags=["Authentication"])
app.include_router(repositories_router, prefix="/repositories", tags=["Repositories"])
app.include_router(issues_router, prefix="/issues", tags=["Issues"])
app.include_router(webhooks_router, prefix="/webhooks", tags=["Webhooks"])
app.include_router(agents_router, prefix="/agents", tags=["Agents"])


@app.get("/")
async def root():
    return {"message": "Code Health Platform API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
