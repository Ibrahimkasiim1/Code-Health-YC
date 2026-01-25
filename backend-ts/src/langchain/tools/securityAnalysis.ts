import * as ts from 'typescript';

/**
 * Secret patterns to detect in code
 */
const SECRET_PATTERNS = {
    aws_access_key: {
        pattern: /AKIA[0-9A-Z]{16}/g,
        severity: 'critical' as const,
        description: 'AWS Access Key ID exposed in code',
    },
    aws_secret_key: {
        pattern: /aws.{0,20}?(?:key|pwd|pw|password|pass|token).{0,20}?['\"][0-9a-zA-Z\/+]{40}['\"]/gi,
        severity: 'critical' as const,
        description: 'AWS Secret Access Key exposed in code',
    },
    openai_key: {
        pattern: /sk-[a-zA-Z0-9]{48}/g,
        severity: 'critical' as const,
        description: 'OpenAI API Key exposed in code',
    },
    anthropic_key: {
        pattern: /sk-ant-[a-zA-Z0-9-]{95}/g,
        severity: 'critical' as const,
        description: 'Anthropic API Key exposed in code',
    },
    github_token: {
        pattern: /gh[pousr]_[a-zA-Z0-9]{36}/g,
        severity: 'critical' as const,
        description: 'GitHub Token exposed in code',
    },
    generic_api_key: {
        pattern: /['\"]?(?:api|API)[_-]?(?:key|KEY)['\"]?\s*[:=]\s*['\"]([a-zA-Z0-9_\-]{20,})['\"]/gi,
        severity: 'high' as const,
        description: 'Generic API Key pattern detected',
    },
    private_key: {
        pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
        severity: 'critical' as const,
        description: 'Private Key exposed in code',
    },
    jwt_token: {
        pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
        severity: 'medium' as const,
        description: 'JWT Token found in code',
    },
    stripe_key: {
        pattern: /(?:sk|pk)_(?:live|test)_[0-9a-zA-Z]{24,}/g,
        severity: 'critical' as const,
        description: 'Stripe API Key exposed in code',
    },
    google_api_key: {
        pattern: /AIza[0-9A-Za-z\\-_]{35}/g,
        severity: 'critical' as const,
        description: 'Google API Key exposed in code',
    },
    slack_token: {
        pattern: /xox[baprs]-[0-9a-zA-Z]{10,48}/g,
        severity: 'high' as const,
        description: 'Slack Token exposed in code',
    },
    password_in_code: {
        pattern: /(?:password|passwd|pwd)\s*[:=]\s*['\"]([^'\"]{8,})['\"]/gi,
        severity: 'high' as const,
        description: 'Hardcoded password detected',
    },
};

export interface SecretMatch {
    type: string;
    pattern: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    line_number: number;
    match: string;
    file_path: string;
}

/**
 * Scan code for exposed secrets and API keys
 */
export function scanForSecrets(code: string, filePath: string): SecretMatch[] {
    const results: SecretMatch[] = [];
    const lines = code.split('\n');

    // Skip environment files and config files
    const fileName = filePath.toLowerCase().split('/').pop() || '';
    const skipPatterns = [
        '.env',
        'config.json',
        'settings.json',
        'secrets.json',
        'credentials.json',
        '.example',
        'docker-compose',
    ];

    if (skipPatterns.some(pattern => fileName.includes(pattern))) {
        return []; // Don't scan config files
    }

    for (const [type, config] of Object.entries(SECRET_PATTERNS)) {
        lines.forEach((line, index) => {
            const matches = line.matchAll(config.pattern);
            for (const match of matches) {
                // Additional validation: skip if it's in a comment
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#') || trimmedLine.startsWith('/*')) {
                    continue;
                }

                // Skip if it's a placeholder or example
                if (match[0].includes('YOUR_') || match[0] === 'xxx' || match[0].includes('example')) {
                    continue;
                }

                results.push({
                    type,
                    pattern: config.pattern.source,
                    severity: config.severity,
                    description: config.description,
                    line_number: index + 1,
                    match: match[0],
                    file_path: filePath,
                });
            }
        });
    }

    return results;
}

export interface SQLInjectionIssue {
    file_path: string;
    line_number: number;
    code_snippet: string;
    query_type: 'template_literal' | 'string_concatenation' | 'raw_query';
    severity: 'critical' | 'high' | 'medium';
    description: string;
}

/**
 * Detect SQL injection vulnerabilities using AST analysis
 */
export function detectSQLInjections(code: string, filePath: string): SQLInjectionIssue[] {
    const results: SQLInjectionIssue[] = [];

    try {
        const sourceFile = ts.createSourceFile(
            filePath,
            code,
            ts.ScriptTarget.Latest,
            true
        );

        function visit(node: ts.Node) {
            // Check for SQL in template literals
            if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
                const text = node.getText();
                const upperText = text.toUpperCase();

                if (/SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER/.test(upperText)) {
                    // Check if it has substitutions (potential SQL injection)
                    if (ts.isTemplateExpression(node) && node.templateSpans.length > 0) {
                        const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1;
                        results.push({
                            file_path: filePath,
                            line_number: lineNumber,
                            code_snippet: text.substring(0, 100),
                            query_type: 'template_literal',
                            severity: 'high',
                            description: 'SQL query using template literal with variables - potential SQL injection',
                        });
                    }
                }
            }

            // Check for string concatenation with SQL keywords
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
                const text = node.getText();
                const upperText = text.toUpperCase();

                if (/SELECT|INSERT|UPDATE|DELETE|WHERE|FROM/.test(upperText)) {
                    const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1;
                    results.push({
                        file_path: filePath,
                        line_number: lineNumber,
                        code_snippet: text.substring(0, 100),
                        query_type: 'string_concatenation',
                        severity: 'critical',
                        description: 'SQL query using string concatenation - critical SQL injection risk',
                    });
                }
            }

            // Check for .query() or .execute() calls with non-parameterized queries
            if (ts.isCallExpression(node)) {
                const text = node.getText();
                if (/(\.query|\.execute|\.raw)\s*\(/.test(text)) {
                    const args = node.arguments;
                    if (args.length > 0) {
                        const firstArg = args[0];
                        // If first argument is a template literal or concatenation, flag it
                        if (ts.isTemplateExpression(firstArg) || ts.isBinaryExpression(firstArg)) {
                            const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1;
                            results.push({
                                file_path: filePath,
                                line_number: lineNumber,
                                code_snippet: text.substring(0, 100),
                                query_type: 'raw_query',
                                severity: 'high',
                                description: 'Raw database query with dynamic content - use parameterized queries',
                            });
                        }
                    }
                }
            }

            ts.forEachChild(node, visit);
        }

        visit(sourceFile);
    } catch (error) {
        console.error(`[SQL Injection Scanner] Failed to parse ${filePath}:`, error);
    }

    return results;
}

export interface XSSIssue {
    file_path: string;
    line_number: number;
    code_snippet: string;
    vulnerability_type: 'dangerouslySetInnerHTML' | 'eval' | 'innerHTML' | 'document.write';
    severity: 'critical' | 'high' | 'medium';
    description: string;
}

/**
 * Detect XSS vulnerabilities in React/JavaScript code
 */
export function detectXSSVulnerabilities(code: string, filePath: string): XSSIssue[] {
    const results: XSSIssue[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        const lineNumber = index + 1;

        // Check for dangerouslySetInnerHTML
        if (/dangerouslySetInnerHTML/.test(line)) {
            // Check if it's sanitized
            if (!/DOMPurify|sanitize/.test(line)) {
                results.push({
                    file_path: filePath,
                    line_number: lineNumber,
                    code_snippet: line.trim(),
                    vulnerability_type: 'dangerouslySetInnerHTML',
                    severity: 'high',
                    description: 'Using dangerouslySetInnerHTML without sanitization - XSS risk',
                });
            }
        }

        // Check for eval()
        if (/\beval\s*\(/.test(line)) {
            results.push({
                file_path: filePath,
                line_number: lineNumber,
                code_snippet: line.trim(),
                vulnerability_type: 'eval',
                severity: 'critical',
                description: 'Using eval() - critical security risk',
            });
        }

        // Check for innerHTML
        if (/\.innerHTML\s*=/.test(line)) {
            if (!/DOMPurify|sanitize/.test(line)) {
                results.push({
                    file_path: filePath,
                    line_number: lineNumber,
                    code_snippet: line.trim(),
                    vulnerability_type: 'innerHTML',
                    severity: 'high',
                    description: 'Direct innerHTML assignment without sanitization - XSS risk',
                });
            }
        }

        // Check for document.write
        if (/document\.write/.test(line)) {
            results.push({
                file_path: filePath,
                line_number: lineNumber,
                code_snippet: line.trim(),
                vulnerability_type: 'document.write',
                severity: 'medium',
                description: 'Using document.write - potential XSS risk and bad practice',
            });
        }
    });

    return results;
}

export interface UnhandledPromiseIssue {
    file_path: string;
    line_number: number;
    code_snippet: string;
    promise_type: 'fetch' | 'async_call' | 'promise_chain';
    severity: 'high' | 'medium';
    description: string;
}

/**
 * Detect unhandled promise rejections
 */
export function detectUnhandledPromises(code: string, filePath: string): UnhandledPromiseIssue[] {
    const results: UnhandledPromiseIssue[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        const lineNumber = index + 1;

        // Check for fetch without .catch
        if (/fetch\s*\(/.test(line)) {
            // Check if this line or next few lines have .catch
            const context = lines.slice(index, Math.min(index + 3, lines.length)).join('\n');
            if (!/\.catch\s*\(|try\s*{|await/.test(context)) {
                results.push({
                    file_path: filePath,
                    line_number: lineNumber,
                    code_snippet: line.trim(),
                    promise_type: 'fetch',
                    severity: 'high',
                    description: 'fetch() call without .catch() or try-catch - unhandled promise rejection',
                });
            }
        }

        // Check for .then without .catch
        if (/\.then\s*\(/.test(line)) {
            const context = lines.slice(index, Math.min(index + 5, lines.length)).join('\n');
            if (!/\.catch\s*\(/.test(context) && /Promise|async/.test(line)) {
                results.push({
                    file_path: filePath,
                    line_number: lineNumber,
                    code_snippet: line.trim(),
                    promise_type: 'promise_chain',
                    severity: 'medium',
                    description: 'Promise chain without .catch() handler',
                });
            }
        }
    });

    return results;
}
