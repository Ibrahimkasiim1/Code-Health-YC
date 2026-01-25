import json
from typing import Optional
from .base_agent import BaseAgent


class ContextAgent(BaseAgent):
    """Agent for detecting tech stack and architecture of a repository."""

    async def analyze(
        self,
        access_token: str,
        owner: str,
        repo: str,
        repo_id: str,
    ) -> dict:
        """Analyze repository to detect tech stack and architecture."""
        context = {
            "languages": [],
            "frameworks": [],
            "databases": [],
            "apis": [],
            "infrastructure": [],
        }

        # Try to fetch common config files
        files_to_check = [
            ("package.json", self._analyze_package_json),
            ("requirements.txt", self._analyze_requirements_txt),
            ("Pipfile", self._analyze_pipfile),
            ("go.mod", self._analyze_go_mod),
            ("Cargo.toml", self._analyze_cargo_toml),
            (".env.example", self._analyze_env_example),
            ("docker-compose.yml", self._analyze_docker_compose),
            ("Dockerfile", self._analyze_dockerfile),
        ]

        for file_path, analyzer in files_to_check:
            content = await self.get_github_file(access_token, owner, repo, file_path)
            if content:
                try:
                    file_context = analyzer(content)
                    self._merge_context(context, file_context)
                except Exception:
                    continue

        # Generate stack summary using LLM
        stack_summary = await self._generate_stack_summary(context)

        # Save to database
        self.supabase.table("repository_contexts").upsert({
            "repo_id": repo_id,
            "context_json": context,
            "stack_summary": stack_summary,
        }).execute()

        return {
            "context": context,
            "stack_summary": stack_summary,
        }

    def _merge_context(self, target: dict, source: dict) -> None:
        """Merge source context into target."""
        for key in target:
            if key in source:
                for item in source[key]:
                    if item not in target[key]:
                        target[key].append(item)

    def _analyze_package_json(self, content: str) -> dict:
        """Analyze package.json for JavaScript/Node.js projects."""
        data = json.loads(content)
        context = {
            "languages": ["JavaScript", "TypeScript"] if "typescript" in str(data) else ["JavaScript"],
            "frameworks": [],
            "databases": [],
            "apis": [],
            "infrastructure": [],
        }

        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}

        # Detect frameworks
        framework_map = {
            "react": "React",
            "vue": "Vue.js",
            "angular": "Angular",
            "next": "Next.js",
            "express": "Express.js",
            "fastify": "Fastify",
            "nestjs": "NestJS",
        }

        for dep, framework in framework_map.items():
            if any(dep in d.lower() for d in deps):
                context["frameworks"].append(framework)

        # Detect databases
        db_map = {
            "mongoose": "MongoDB",
            "mongodb": "MongoDB",
            "pg": "PostgreSQL",
            "mysql": "MySQL",
            "redis": "Redis",
            "prisma": "Prisma ORM",
            "sequelize": "Sequelize",
        }

        for dep, db in db_map.items():
            if dep in deps:
                context["databases"].append(db)

        # Detect API services
        api_map = {
            "openai": "OpenAI",
            "anthropic": "Anthropic",
            "@anthropic-ai": "Anthropic",
            "stripe": "Stripe",
            "twilio": "Twilio",
            "sendgrid": "SendGrid",
            "aws-sdk": "AWS",
        }

        for dep, api in api_map.items():
            if any(dep in d.lower() for d in deps):
                context["apis"].append(api)

        return context

    def _analyze_requirements_txt(self, content: str) -> dict:
        """Analyze requirements.txt for Python projects."""
        context = {
            "languages": ["Python"],
            "frameworks": [],
            "databases": [],
            "apis": [],
            "infrastructure": [],
        }

        lines = content.lower().split("\n")

        # Framework detection
        if any("django" in l for l in lines):
            context["frameworks"].append("Django")
        if any("flask" in l for l in lines):
            context["frameworks"].append("Flask")
        if any("fastapi" in l for l in lines):
            context["frameworks"].append("FastAPI")

        # Database detection
        if any("psycopg" in l or "postgres" in l for l in lines):
            context["databases"].append("PostgreSQL")
        if any("pymongo" in l for l in lines):
            context["databases"].append("MongoDB")
        if any("redis" in l for l in lines):
            context["databases"].append("Redis")

        # API detection
        if any("openai" in l for l in lines):
            context["apis"].append("OpenAI")
        if any("anthropic" in l for l in lines):
            context["apis"].append("Anthropic")
        if any("stripe" in l for l in lines):
            context["apis"].append("Stripe")

        return context

    def _analyze_pipfile(self, content: str) -> dict:
        """Analyze Pipfile for Python projects."""
        # Similar to requirements.txt analysis
        return self._analyze_requirements_txt(content)

    def _analyze_go_mod(self, content: str) -> dict:
        """Analyze go.mod for Go projects."""
        return {
            "languages": ["Go"],
            "frameworks": [],
            "databases": [],
            "apis": [],
            "infrastructure": [],
        }

    def _analyze_cargo_toml(self, content: str) -> dict:
        """Analyze Cargo.toml for Rust projects."""
        return {
            "languages": ["Rust"],
            "frameworks": [],
            "databases": [],
            "apis": [],
            "infrastructure": [],
        }

    def _analyze_env_example(self, content: str) -> dict:
        """Analyze .env.example for API services."""
        context = {
            "languages": [],
            "frameworks": [],
            "databases": [],
            "apis": [],
            "infrastructure": [],
        }

        content_lower = content.lower()

        if "openai" in content_lower:
            context["apis"].append("OpenAI")
        if "anthropic" in content_lower:
            context["apis"].append("Anthropic")
        if "stripe" in content_lower:
            context["apis"].append("Stripe")
        if "database_url" in content_lower or "postgres" in content_lower:
            context["databases"].append("PostgreSQL")
        if "redis" in content_lower:
            context["databases"].append("Redis")
        if "mongodb" in content_lower:
            context["databases"].append("MongoDB")

        return context

    def _analyze_docker_compose(self, content: str) -> dict:
        """Analyze docker-compose.yml for infrastructure."""
        context = {
            "languages": [],
            "frameworks": [],
            "databases": [],
            "apis": [],
            "infrastructure": ["Docker"],
        }

        content_lower = content.lower()

        if "postgres" in content_lower:
            context["databases"].append("PostgreSQL")
        if "redis" in content_lower:
            context["databases"].append("Redis")
        if "mongo" in content_lower:
            context["databases"].append("MongoDB")
        if "nginx" in content_lower:
            context["infrastructure"].append("Nginx")

        return context

    def _analyze_dockerfile(self, content: str) -> dict:
        """Analyze Dockerfile for infrastructure."""
        return {
            "languages": [],
            "frameworks": [],
            "databases": [],
            "apis": [],
            "infrastructure": ["Docker"],
        }

    async def _generate_stack_summary(self, context: dict) -> str:
        """Generate a human-readable stack summary."""
        parts = []

        if context["languages"]:
            parts.append(f"Languages: {', '.join(context['languages'])}")
        if context["frameworks"]:
            parts.append(f"Frameworks: {', '.join(context['frameworks'])}")
        if context["databases"]:
            parts.append(f"Databases: {', '.join(context['databases'])}")
        if context["apis"]:
            parts.append(f"APIs: {', '.join(context['apis'])}")
        if context["infrastructure"]:
            parts.append(f"Infrastructure: {', '.join(context['infrastructure'])}")

        if not parts:
            return "Unable to detect stack details"

        return " | ".join(parts)
