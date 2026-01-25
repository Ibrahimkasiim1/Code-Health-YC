import * as ts from 'typescript';

export interface PerformanceIssue {
    file_path: string;
    line_number: number;
    code_snippet: string;
    issue_type: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
    suggested_fix: string;
}

/**
 * Detect N+1 query patterns in code
 */
export function detectNPlusOneQueries(code: string, filePath: string): PerformanceIssue[] {
    const results: PerformanceIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check if we're in a loop
        const isLoop = /for\s*\(|\.forEach\s*\(|\.map\s*\(|while\s*\(/.test(line);

        if (isLoop) {
            // Check next 10 lines for database queries
            const loopBody = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');

            if (/(\.find\(|\.findOne\(|\.findMany\(|\.query\(|\.execute\(|SELECT |INSERT |UPDATE )/.test(loopBody)) {
                results.push({
                    file_path: filePath,
                    line_number: i + 1,
                    code_snippet: line.trim(),
                    issue_type: 'n_plus_one_query',
                    severity: 'high',
                    description: 'Potential N+1 query pattern - database query inside loop',
                    suggested_fix: 'Use eager loading, batch queries, or dataloader pattern',
                });
            }
        }
    }

    return results;
}

/**
 * Detect inefficient algorithms (nested loops)
 */
export function detectInefficientAlgorithms(code: string, filePath: string): PerformanceIssue[] {
    const results: PerformanceIssue[] = [];

    try {
        const sourceFile = ts.createSourceFile(
            filePath,
            code,
            ts.ScriptTarget.Latest,
            true
        );

        function countNestedLoops(node: ts.Node, depth = 0): void {
            const isLoop =
                ts.isForStatement(node) ||
                ts.isWhileStatement(node) ||
                ts.isDoStatement(node) ||
                (ts.isCallExpression(node) && /forEach|map|filter/.test(node.getText()));

            if (isLoop) {
                if (depth >= 2) {
                    // Triple nested loops = O(n³) or worse
                    const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1;
                    results.push({
                        file_path: filePath,
                        line_number: lineNumber,
                        code_snippet: node.getText().substring(0, 100),
                        issue_type: 'inefficient_algorithm',
                        severity: 'medium',
                        description: `${depth + 1}-level nested loops detected - O(n^${depth + 1}) complexity`,
                        suggested_fix: 'Consider using hash maps, Set, or optimizing algorithm',
                    });
                }

                ts.forEachChild(node, (child) => countNestedLoops(child, depth + 1));
            } else {
                ts.forEachChild(node, (child) => countNestedLoops(child, depth));
            }
        }

        countNestedLoops(sourceFile);
    } catch (error) {
        console.error(`[Algorithm Scanner] Failed to parse ${filePath}:`, error);
    }

    return results;
}

/**
 * Detect large bundle dependencies
 */
export function analyzeBundleSize(dependencies: Record<string, string>): PerformanceIssue[] {
    const results: PerformanceIssue[] = [];

    const heavyDependencies: Record<string, { size: string; alternative: string }> = {
        moment: { size: '289KB', alternative: 'day.js (2.8KB) or date-fns (modular)' },
        lodash: { size: '72KB', alternative: 'lodash-es (tree-shakeable) or native methods' },
        'axios': { size: '33KB', alternative: 'native fetch API' },
        'jquery': { size: '87KB', alternative: 'vanilla JavaScript or micro-library' },
        'react-icons': { size: '~1MB', alternative: 'Import specific icons only or use SVG sprites' },
    };

    for (const [dep, info] of Object.entries(heavyDependencies)) {
        if (dependencies[dep]) {
            results.push({
                file_path: 'package.json',
                line_number: 0,
                code_snippet: `"${dep}": "${dependencies[dep]}"`,
                issue_type: 'large_dependency',
                severity: 'medium',
                description: `${dep} is a large dependency (${info.size})`,
                suggested_fix: `Consider replacing with ${info.alternative}`,
            });
        }
    }

    return results;
}

/**
 * Detect missing lazy loading for images
 */
export function detectMissingLazyLoading(code: string, filePath: string): PerformanceIssue[] {
    const results: PerformanceIssue[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        // Check for <img> tags without loading="lazy"
        if (/<img\s/.test(line) && !/loading\s*=/.test(line)) {
            results.push({
                file_path: filePath,
                line_number: index + 1,
                code_snippet: line.trim(),
                issue_type: 'missing_lazy_loading',
                severity: 'low',
                description: 'Image without lazy loading attribute',
                suggested_fix: 'Add loading="lazy" to improve page load performance',
            });
        }

        // Check for React components rendering images
        if (/<Image\s/.test(line) && !/lazy|loading/.test(line) && filePath.endsWith('.tsx')) {
            results.push({
                file_path: filePath,
                line_number: index + 1,
                code_snippet: line.trim(),
                issue_type: 'missing_lazy_loading',
                severity: 'low',
                description: 'Image component without lazy loading',
                suggested_fix: 'Enable lazy loading for better performance',
            });
        }
    });

    return results;
}

/**
 * Detect blocking operations
 */
export function detectBlockingOperations(code: string, filePath: string): PerformanceIssue[] {
    const results: PerformanceIssue[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        // Check for synchronous file operations
        if (/fs\.readFileSync|fs\.writeFileSync/.test(line)) {
            results.push({
                file_path: filePath,
                line_number: index + 1,
                code_snippet: line.trim(),
                issue_type: 'blocking_operation',
                severity: 'medium',
                description: 'Synchronous file operation blocks event loop',
                suggested_fix: 'Use async fs.readFile() or fs.promises API',
            });
        }

        // Check for large JSON.stringify on potentially large objects
        if (/JSON\.stringify\s*\(\s*(?!.*limit)/.test(line) && /response|data|result/.test(line)) {
            results.push({
                file_path: filePath,
                line_number: index + 1,
                code_snippet: line.trim(),
                issue_type: 'potential_blocking',
                severity: 'low',
                description: 'JSON.stringify on large objects can block event loop',
                suggested_fix: 'Consider streaming or chunking for large data',
            });
        }
    });

    return results;
}
