import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Octokit } from "octokit";
import { getCachedResponse, setCachedResponse } from "./cache.js";

// Tool context that will be injected at runtime
export interface GitHubToolContext {
  accessToken: string;
  owner: string;
  repo: string;
}

/**
 * Search repository for patterns/keywords
 */
export const githubSearchCode = tool(
  async (input, config) => {
    const ctx = config?.configurable as GitHubToolContext;
    if (!ctx?.accessToken) {
      return JSON.stringify({ error: "GitHub access token not configured" });
    }

    // Check cache first
    const cacheParams = {
      owner: ctx.owner,
      repo: ctx.repo,
      query: input.query,
    };
    const cached = await getCachedResponse<any[]>('search_code', cacheParams);
    if (cached) {
      console.log(`[GitHub Cache] HIT for search: ${input.query}`);
      return JSON.stringify(cached);
    }

    const octokit = new Octokit({ auth: ctx.accessToken });

    try {
      const { data } = await octokit.rest.search.code({
        q: `${input.query} repo:${ctx.owner}/${ctx.repo}`,
        per_page: 20,
      });

      const results = data.items.map((item) => ({
        file_path: item.path,
        sha: item.sha,
        html_url: item.html_url,
        score: item.score,
      }));

      // Cache the results for 24 hours
      await setCachedResponse('search_code', cacheParams, results, 24);
      console.log(`[GitHub Cache] MISS for search: ${input.query} - cached for 24h`);

      return JSON.stringify(results);
    } catch (error: any) {
      // Handle rate limiting gracefully
      if (error?.message?.includes('quota exhausted') || error?.status === 403) {
        console.log(`[GitHub Cache] Rate limit hit for search: ${input.query}`);
        return JSON.stringify({ error: 'Rate limit exceeded. Please try again later.', results: [] });
      }
      return JSON.stringify({ error: `Search failed: ${error}`, results: [] });
    }
  },
  {
    name: "github_search_code",
    description: "Search repository for patterns/keywords. Returns array of matching files with paths.",
    schema: z.object({
      query: z.string().describe("Search query string to find in the repository"),
    }),
  }
);

/**
 * Fetch complete file content by path
 */
export const githubGetFile = tool(
  async (input, config) => {
    const ctx = config?.configurable as GitHubToolContext;
    if (!ctx?.accessToken) {
      return JSON.stringify({ error: "GitHub access token not configured" });
    }

    // Check cache first
    const cacheParams = {
      owner: ctx.owner,
      repo: ctx.repo,
      file_path: input.file_path,
      ref: input.ref || 'HEAD',
    };
    const cached = await getCachedResponse<any>('get_file', cacheParams);
    if (cached) {
      console.log(`[GitHub Cache] HIT for file: ${input.file_path}`);
      return JSON.stringify(cached);
    }

    const octokit = new Octokit({ auth: ctx.accessToken });

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: ctx.owner,
        repo: ctx.repo,
        path: input.file_path,
        ref: input.ref,
      });

      if ("content" in data && data.encoding === "base64") {
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        const result = {
          content,
          sha: data.sha,
          size: data.size,
          path: data.path,
        };

        // Cache file content for 24 hours
        await setCachedResponse('get_file', cacheParams, result, 24);
        console.log(`[GitHub Cache] MISS for file: ${input.file_path} - cached for 24h`);

        return JSON.stringify(result);
      }

      return JSON.stringify({ error: "File content not available" });
    } catch (error) {
      return JSON.stringify({ error: `Failed to get file: ${error}` });
    }
  },
  {
    name: "github_get_file",
    description: "Fetch complete file content by path. Returns file content, sha, and size.",
    schema: z.object({
      file_path: z.string().describe("Path to the file in the repository"),
      ref: z.string().optional().describe("Branch or commit ref (defaults to main)"),
    }),
  }
);

/**
 * List all files in a directory
 */
export const githubListDirectory = tool(
  async (input, config) => {
    const ctx = config?.configurable as GitHubToolContext;
    if (!ctx?.accessToken) {
      return JSON.stringify({ error: "GitHub access token not configured" });
    }

    const octokit = new Octokit({ auth: ctx.accessToken });

    async function listRecursive(path: string): Promise<Array<{ path: string; type: string; size?: number }>> {
      const { data } = await octokit.rest.repos.getContent({
        owner: ctx.owner,
        repo: ctx.repo,
        path: path || "",
      });

      if (!Array.isArray(data)) {
        return [{ path: data.path, type: data.type, size: data.size }];
      }

      const results: Array<{ path: string; type: string; size?: number }> = [];

      for (const item of data) {
        if (item.type === "file") {
          results.push({ path: item.path, type: "file", size: item.size });
        } else if (item.type === "dir") {
          results.push({ path: item.path, type: "dir" });
          if (input.recursive) {
            const subItems = await listRecursive(item.path);
            results.push(...subItems);
          }
        }
      }

      return results;
    }

    try {
      const results = await listRecursive(input.path);
      return JSON.stringify(results);
    } catch (error) {
      return JSON.stringify({ error: `Failed to list directory: ${error}` });
    }
  },
  {
    name: "github_list_directory",
    description: "List all files in a directory. Can recursively list subdirectories.",
    schema: z.object({
      path: z.string().describe("Directory path to list (empty string for root)"),
      recursive: z.boolean().optional().default(false).describe("Whether to recursively list subdirectories"),
    }),
  }
);

/**
 * Regex search across entire repository
 */
export const githubSearchPattern = tool(
  async (input, config) => {
    const ctx = config?.configurable as GitHubToolContext;
    if (!ctx?.accessToken) {
      return JSON.stringify({ error: "GitHub access token not configured" });
    }

    const octokit = new Octokit({ auth: ctx.accessToken });
    const results: Array<{ file_path: string; line_number: number; match: string }> = [];

    try {
      // First, get list of files to search
      const { data: tree } = await octokit.rest.git.getTree({
        owner: ctx.owner,
        repo: ctx.repo,
        tree_sha: "HEAD",
        recursive: "true",
      });

      const regex = new RegExp(input.pattern, "g");
      const extensions = input.file_extensions?.map((ext) => ext.toLowerCase()) || [];

      // Filter files by extension if specified
      const filesToSearch = tree.tree.filter((item) => {
        if (item.type !== "blob" || !item.path) return false;
        if (extensions.length === 0) return true;
        return extensions.some((ext) => item.path!.toLowerCase().endsWith(ext));
      });

      // Search each file (limit to first 50 files for performance)
      for (const file of filesToSearch.slice(0, 50)) {
        if (!file.path) continue;

        try {
          const { data } = await octokit.rest.repos.getContent({
            owner: ctx.owner,
            repo: ctx.repo,
            path: file.path,
          });

          if ("content" in data && data.encoding === "base64") {
            const content = Buffer.from(data.content, "base64").toString("utf-8");
            const lines = content.split("\n");

            lines.forEach((line, index) => {
              const matches = line.match(regex);
              if (matches) {
                results.push({
                  file_path: file.path!,
                  line_number: index + 1,
                  match: matches[0],
                });
              }
            });
          }
        } catch {
          // Skip files that can't be read
        }
      }

      return JSON.stringify(results);
    } catch (error) {
      return JSON.stringify({ error: `Pattern search failed: ${error}` });
    }
  },
  {
    name: "github_search_pattern",
    description: "Regex search across entire repository. Use for finding patterns like API keys, secrets, or specific code patterns.",
    schema: z.object({
      pattern: z.string().describe("Regex pattern to search for"),
      file_extensions: z.array(z.string()).optional().describe("File extensions to search (e.g., ['.js', '.ts'])"),
    }),
  }
);

// Export all GitHub tools as an array
export const githubTools = [
  githubSearchCode,
  githubGetFile,
  githubListDirectory,
  githubSearchPattern,
];

