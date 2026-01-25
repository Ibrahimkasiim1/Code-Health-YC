import difflib
from typing import Optional
from .base_agent import BaseAgent


class FixAgent(BaseAgent):
    """Agent for generating code fixes based on detected issues."""

    SYSTEM_PROMPT = """You are an expert software engineer specializing in code optimization.
Your job is to generate high-quality code fixes that address cost and performance issues.

When generating fixes:
1. Preserve the existing code style and patterns
2. Add proper error handling
3. Include clear comments explaining the optimization
4. Ensure the fix is production-ready
5. Minimize changes - only fix the issue, don't refactor unrelated code

For caching fixes specifically:
- Use appropriate cache TTL based on data freshness requirements
- Include cache invalidation when needed
- Handle cache misses gracefully
- Add proper logging for cache hits/misses

Always output complete, working code that can be directly applied."""

    async def generate_fix(
        self,
        issue_id: str,
        access_token: str,
        owner: str,
        repo: str,
    ) -> Optional[dict]:
        """Generate a fix for a given issue."""
        # Get issue details
        issue = self.supabase.table("issues").select("*").eq("id", issue_id).single().execute()

        if not issue.data:
            return None

        issue_data = issue.data
        file_path = issue_data.get("file_path")

        if not file_path:
            return None

        # Get current file content
        original_code = await self.get_github_file(access_token, owner, repo, file_path)

        if not original_code:
            return None

        # Generate fix based on issue type
        if issue_data["issue_type"] == "cost_optimization":
            fixed_code = await self._generate_cache_fix(
                issue_data, file_path, original_code
            )
        else:
            fixed_code = await self._generate_generic_fix(
                issue_data, file_path, original_code
            )

        if not fixed_code:
            return None

        # Generate diff
        diff = self._generate_diff(original_code, fixed_code, file_path)

        # Calculate confidence score
        confidence = self._calculate_confidence(original_code, fixed_code)

        # Generate explanation
        explanation = await self._generate_explanation(
            issue_data, original_code, fixed_code
        )

        # Save fix
        fix = self.save_fix(
            issue_id=issue_id,
            original_code=original_code,
            fixed_code=fixed_code,
            diff=diff,
            confidence_score=confidence,
            explanation=explanation,
        )

        return fix

    async def _generate_cache_fix(
        self,
        issue: dict,
        file_path: str,
        original_code: str,
    ) -> Optional[str]:
        """Generate a caching fix for cost optimization issues."""
        metrics = issue.get("metrics", {})

        prompt = f"""Generate a fix for this API cost optimization issue.

## Issue
Title: {issue['title']}
Description: {issue['description']}

## Current Code ({file_path})
```
{original_code}
```

## Context
- Monthly API spending: ${metrics.get('monthly_spending', 0):.2f}
- Potential monthly savings: ${metrics.get('potential_monthly_savings', 0):.2f}
- Root cause: Missing caching layer

## Requirements
1. Add appropriate caching (Redis, in-memory, or file-based depending on the stack)
2. Choose sensible cache TTL (e.g., 5-15 minutes for AI responses)
3. Create cache keys based on the request parameters
4. Handle cache misses by calling the original API
5. Keep the existing function signatures and return types

Output ONLY the complete fixed code, no explanations. The code should be a drop-in replacement."""

        try:
            response = await self.invoke_llm(self.SYSTEM_PROMPT, prompt)

            # Extract code from response
            if "```" in response:
                # Find the code block
                parts = response.split("```")
                for i, part in enumerate(parts):
                    if i % 2 == 1:  # Odd indices are code blocks
                        # Remove language identifier if present
                        lines = part.split("\n")
                        if lines[0].strip() in ["python", "javascript", "typescript", "js", "ts", "py"]:
                            return "\n".join(lines[1:])
                        return part

            return response
        except Exception:
            return None

    async def _generate_generic_fix(
        self,
        issue: dict,
        file_path: str,
        original_code: str,
    ) -> Optional[str]:
        """Generate a generic fix for other issue types."""
        prompt = f"""Generate a fix for this code issue.

## Issue
Title: {issue['title']}
Description: {issue['description']}
Severity: {issue['severity']}

## Current Code ({file_path})
```
{original_code}
```

Output ONLY the complete fixed code, no explanations."""

        try:
            response = await self.invoke_llm(self.SYSTEM_PROMPT, prompt)

            if "```" in response:
                parts = response.split("```")
                for i, part in enumerate(parts):
                    if i % 2 == 1:
                        lines = part.split("\n")
                        if lines[0].strip() in ["python", "javascript", "typescript", "js", "ts", "py"]:
                            return "\n".join(lines[1:])
                        return part

            return response
        except Exception:
            return None

    def _generate_diff(
        self,
        original: str,
        fixed: str,
        file_path: str,
    ) -> str:
        """Generate a unified diff between original and fixed code."""
        original_lines = original.splitlines(keepends=True)
        fixed_lines = fixed.splitlines(keepends=True)

        diff = difflib.unified_diff(
            original_lines,
            fixed_lines,
            fromfile=f"a/{file_path}",
            tofile=f"b/{file_path}",
        )

        return "".join(diff)

    def _calculate_confidence(
        self,
        original: str,
        fixed: str,
    ) -> float:
        """Calculate confidence score for the fix."""
        # Basic heuristics for confidence
        confidence = 0.8  # Start with high base confidence

        # Penalize if the fix is too different
        similarity = difflib.SequenceMatcher(None, original, fixed).ratio()
        if similarity < 0.3:
            confidence -= 0.3  # Major changes
        elif similarity < 0.5:
            confidence -= 0.15  # Moderate changes

        # Penalize if the fix is too similar (might not be fixing anything)
        if similarity > 0.98:
            confidence -= 0.2

        # Bonus if the fix adds caching keywords
        cache_keywords = ["cache", "redis", "memo", "lru_cache", "ttl"]
        if any(kw in fixed.lower() and kw not in original.lower() for kw in cache_keywords):
            confidence += 0.1

        return max(0.1, min(1.0, confidence))

    async def _generate_explanation(
        self,
        issue: dict,
        original: str,
        fixed: str,
    ) -> str:
        """Generate a human-readable explanation of the fix."""
        metrics = issue.get("metrics", {})

        prompt = f"""Explain this code fix in 2-3 sentences for a developer.

## Issue
{issue['title']}

## Savings
- Potential monthly savings: ${metrics.get('potential_monthly_savings', 0):.2f}
- Potential weekly savings: ${metrics.get('potential_weekly_savings', 0):.2f}

## What changed
The fix adds caching to reduce API calls.

Write a brief, clear explanation of what the fix does and why it saves money."""

        try:
            response = await self.invoke_llm(
                "You are a technical writer. Be concise and clear.",
                prompt
            )
            return response.strip()
        except Exception:
            return f"This fix implements caching for API responses, which can save approximately ${metrics.get('potential_monthly_savings', 0):.2f}/month by reducing redundant API calls."
