/**
 * Error handling analysis utilities
 */

export interface ErrorHandlingIssue {
    file_path: string;
    line_number: number;
    code_snippet: string;
    issue_type: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
    suggested_fix: string;
}

/**
 * Detect empty catch blocks
 */
export function detectEmptyCatchBlocks(code: string, filePath: string): ErrorHandlingIssue[] {
    const results: ErrorHandlingIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/catch\s*\(/.test(line)) {
            // Check the next few lines for the catch block body
            let braceCount = 0;
            let foundContent = false;
            let catchStart = i;

            for (let j = i; j < Math.min(i + 10, lines.length); j++) {
                const currentLine = lines[j];
                braceCount += (currentLine.match(/{/g) || []).length;
                braceCount -= (currentLine.match(/}/g) || []).length;

                // Check if there's any meaningful content (not just console.log or comments)
                if (j > catchStart && /[a-zA-Z]/.test(currentLine) && !/console\.log|\/\/|\/\*/.test(currentLine)) {
                    foundContent = true;
                }

                if (braceCount === 0 && j > catchStart) {
                    if (!foundContent) {
                        results.push({
                            file_path: filePath,
                            line_number: catchStart + 1,
                            code_snippet: lines.slice(catchStart, j + 1).join('\n'),
                            issue_type: 'empty_catch_block',
                            severity: 'medium',
                            description: 'Empty or ineffective catch block - errors are silently ignored',
                            suggested_fix: 'Add proper error handling: log with context, show user message, or rethrow',
                        });
                    }
                    break;
                }
            }
        }
    }

    return results;
}

/**
 * Detect missing error boundaries in React
 */
export function detectMissingErrorBoundaries(code: string, filePath: string): ErrorHandlingIssue[] {
    const results: ErrorHandlingIssue[] = [];

    // Check if this is a React component file
    if (!/\.(tsx|jsx)$/.test(filePath)) return results;

    const hasComponentDidCatch = /componentDidCatch/.test(code);
    const hasErrorBoundary = /ErrorBoundary/.test(code);
    const isClassComponent = /class\s+\w+\s+extends\s+(React\.)?Component/.test(code);

    if (isClassComponent && !hasComponentDidCatch && !hasErrorBoundary) {
        results.push({
            file_path: filePath,
            line_number: 1,
            code_snippet: '',
            issue_type: 'missing_error_boundary',
            severity: 'medium',
            description: 'Class component without error boundary',
            suggested_fix: 'Wrap component with <ErrorBoundary> or implement componentDidCatch',
        });
    }

    return results;
}

/**
 * Detect missing loading states
 */
export function detectMissingLoadingStates(code: string, filePath: string): ErrorHandlingIssue[] {
    const results: ErrorHandlingIssue[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        // Check for async operations without loading states
        if (/(useState|useQuery|useFetch|fetch\()/.test(line)) {
            const componentContext = code.substring(0, code.indexOf(line));

            if (/fetch\(|useQuery|useFetch/.test(line) && !/isLoading|loading|isPending/.test(componentContext)) {
                results.push({
                    file_path: filePath,
                    line_number: index + 1,
                    code_snippet: line.trim(),
                    issue_type: 'missing_loading_state',
                    severity: 'low',
                    description: 'Async operation without loading state indicator',
                    suggested_fix: 'Add loading state to improve UX',
                });
            }
        }
    });

    return results;
}

/**
 * Detect API calls without error handling
 */
export function detectAPICallsWithoutErrorHandling(code: string, filePath: string): ErrorHandlingIssue[] {
    const results: ErrorHandlingIssue[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        // Check for API calls
        if (/(fetch\(|axios\.|http\.)/.test(line)) {
            // Check context for error handling
            const contextStart = Math.max(0, index - 3);
            const contextEnd = Math.min(index + 10, lines.length);
            const context = lines.slice(contextStart, contextEnd).join('\n');

            const hasTryCatch = /try\s*{/.test(context) && /catch\s*\(/.test(context);
            const hasCatchMethod = /\.catch\s*\(/.test(context);
            const hasErrorState = /setError|error:|onError/.test(context);

            if (!hasTryCatch && !hasCatchMethod && !hasErrorState) {
                results.push({
                    file_path: filePath,
                    line_number: index + 1,
                    code_snippet: line.trim(),
                    issue_type: 'missing_error_handling',
                    severity: 'high',
                    description: 'API call without error handling',
                    suggested_fix: 'Add try-catch, .catch(), or error state handling',
                });
            }
        }
    });

    return results;
}

/**
 * Detect missing error messages for users
 */
export function detectPoorErrorMessages(code: string, filePath: string): ErrorHandlingIssue[] {
    const results: ErrorHandlingIssue[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        // Check for generic error messages
        if (/(throw new Error|console\.error|alert)\s*\(\s*['"](?:Error|error|Something went wrong)['"]\s*\)/.test(line)) {
            results.push({
                file_path: filePath,
                line_number: index + 1,
                code_snippet: line.trim(),
                issue_type: 'poor_error_message',
                severity: 'low',
                description: 'Generic error message provides no context to users',
                suggested_fix: 'Provide specific, actionable error messages',
            });
        }
    });

    return results;
}
