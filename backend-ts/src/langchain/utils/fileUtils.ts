/**
 * Shared utilities for all agents
 */

import { Octokit } from 'octokit';
import { AgentContext } from '../agents/base.js';

export interface FileContent {
    path: string;
    content: string;
}

/**
 * Fetch source files from a GitHub repository
 * Used by all scanner agents to get actual code to analyze
 */
export async function fetchRepositoryFiles(
    context: AgentContext,
    options: {
        extensions?: string[];
        maxFiles?: number;
        excludePatterns?: string[];
    } = {}
): Promise<FileContent[]> {
    const {
        extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rb', '.php', '.html', '.css'],
        maxFiles = 100,
        excludePatterns = ['node_modules', 'dist', 'build', '.min.', 'vendor', '__pycache__'],
    } = options;

    const octokit = new Octokit({ auth: context.accessToken });
    const files: FileContent[] = [];

    try {
        // Get repository tree
        const { data: tree } = await octokit.rest.git.getTree({
            owner: context.owner,
            repo: context.repo,
            tree_sha: 'HEAD',
            recursive: 'true',
        });

        // Filter to desired files
        const targetFiles = tree.tree.filter(item => {
            if (item.type !== 'blob' || !item.path) return false;

            // Check if matches extension
            const matchesExtension = extensions.some(ext => item.path!.endsWith(ext));
            if (!matchesExtension) return false;

            // Check exclude patterns
            const isExcluded = excludePatterns.some(pattern => item.path!.includes(pattern));
            if (isExcluded) return false;

            return true;
        });

        const filesToFetch = targetFiles.slice(0, maxFiles);

        console.log(`[FileUtils] Fetching ${filesToFetch.length} files (${targetFiles.length} matched, limited to ${maxFiles})`);

        // Fetch file contents in batches
        const batchSize = 10;
        for (let i = 0; i < filesToFetch.length; i += batchSize) {
            const batch = filesToFetch.slice(i, i + batchSize);

            const batchResults = await Promise.all(
                batch.map(async (file) => {
                    try {
                        const { data } = await octokit.rest.repos.getContent({
                            owner: context.owner,
                            repo: context.repo,
                            path: file.path!,
                        });

                        if ('content' in data && data.encoding === 'base64') {
                            return {
                                path: file.path!,
                                content: Buffer.from(data.content, 'base64').toString('utf-8'),
                            };
                        }
                        return null;
                    } catch (error) {
                        console.error(`[FileUtils] Failed to fetch ${file.path}:`, error);
                        return null;
                    }
                })
            );

            files.push(...(batchResults.filter(f => f !== null) as FileContent[]));

            // Small delay between batches
            if (i + batchSize < filesToFetch.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return files;
    } catch (error) {
        console.error(`[FileUtils] Failed to fetch repository files:`, error);
        throw error;
    }
}

/**
 * Determine if a file should be skipped for security analysis
 */
export function shouldSkipSecurityFile(filePath: string): boolean {
    const fileName = filePath.toLowerCase().split('/').pop() || '';

    const skipPatterns = [
        '.env',
        'config.json',
        'settings.json',
        'secrets.json',
        'credentials.json',
        '.example',
        'docker-compose',
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        '.test.',
        '.spec.',
        '__tests__',
    ];

    return skipPatterns.some(pattern => fileName.includes(pattern));
}
