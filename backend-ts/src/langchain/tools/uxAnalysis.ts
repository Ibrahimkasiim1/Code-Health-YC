/**
 * UX and Accessibility analysis utilities
 */

export interface UXIssue {
    file_path: string;
    line_number: number;
    code_snippet: string;
    issue_type: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
    suggested_fix: string;
    wcag_violation?: string;
}

/**
 * Detect missing alt text on images
 */
export function detectMissingAltText(code: string, filePath: string): UXIssue[] {
    const results: UXIssue[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        // Check for <img> tags without alt attribute
        if (/<img\s/.test(line) && !/alt\s*=/.test(line)) {
            results.push({
                file_path: filePath,
                line_number: index + 1,
                code_snippet: line.trim(),
                issue_type: 'missing_alt_text',
                severity: 'high',
                description: 'Image without alt text fails accessibility standards',
                suggested_fix: 'Add descriptive alt text: alt="description of image"',
                wcag_violation: 'WCAG 2.1 Level A - 1.1.1 Non-text Content',
            });
        }

        // Check for React Image components without alt
        if (/<Image\s/.test(line) && !/alt\s*=/.test(line) && filePath.endsWith('.tsx')) {
            results.push({
                file_path: filePath,
                line_number: index + 1,
                code_snippet: line.trim(),
                issue_type: 'missing_alt_text',
                severity: 'high',
                description: 'Image component without alt text',
                suggested_fix: 'Add alt prop with descriptive text',
                wcag_violation: 'WCAG 2.1 Level A - 1.1.1 Non-text Content',
            });
        }
    });

    return results;
}

/**
 * Detect missing ARIA labels
 */
export function detectMissingAriaLabels(code: string, filePath: string): UXIssue[] {
    const results: UXIssue[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        // Check for icon buttons without aria-label
        if (/<button[^>]*>/.test(line)) {
            const buttonContent = line.match(/<button[^>]*>(.*?)<\/button>/);
            if (buttonContent) {
                const hasText = /[a-zA-Z]/.test(buttonContent[1].replace(/<[^>]*>/g, ''));
                const hasAriaLabel = /aria-label\s*=/.test(line);
                const hasAriaLabelledby = /aria-labelledby\s*=/.test(line);

                // If button has icon but no text and no aria-label
                if (!hasText && !hasAriaLabel && !hasAriaLabelledby && (/<svg|<Icon|className="icon"/.test(buttonContent[1]))) {
                    results.push({
                        file_path: filePath,
                        line_number: index + 1,
                        code_snippet: line.trim(),
                        issue_type: 'missing_aria_label',
                        severity: 'high',
                        description: 'Icon button without accessible label',
                        suggested_fix: 'Add aria-label="description of action"',
                        wcag_violation: 'WCAG 2.1 Level A - 4.1.2 Name, Role, Value',
                    });
                }
            }
        }

        // Check for inputs without labels
        if (/<input\s/.test(line) && !/type\s*=\s*["']hidden["']/.test(line)) {
            const hasLabel = /<label/.test(code.substring(Math.max(0, code.indexOf(line) - 200), code.indexOf(line) + 200));
            const hasAriaLabel = /aria-label\s*=/.test(line);
            const hasPlaceholder = /placeholder\s*=/.test(line);

            if (!hasLabel && !hasAriaLabel) {
                results.push({
                    file_path: filePath,
                    line_number: index + 1,
                    code_snippet: line.trim(),
                    issue_type: 'missing_input_label',
                    severity: 'high',
                    description: 'Input without associated label',
                    suggested_fix: hasPlaceholder
                        ? 'Placeholder is not a substitute for label. Add <label> or aria-label'
                        : 'Add <label> element or aria-label attribute',
                    wcag_violation: 'WCAG 2.1 Level A - 3.3.2 Labels or Instructions',
                });
            }
        }
    });

    return results;
}

/**
 * Detect missing focus indicators
 */
export function detectMissingFocusStates(code: string, filePath: string): UXIssue[] {
    const results: UXIssue[] = [];

    // Check CSS/styles for outline:none without alternative focus indicator
    if (/outline\s*:\s*none/.test(code)) {
        const lines = code.split('\n');
        lines.forEach((line, index) => {
            if (/outline\s*:\s*none/.test(line)) {
                // Check if there's an alternative focus style nearby
                const context = lines.slice(Math.max(0, index - 5), Math.min(index + 5, lines.length)).join('\n');
                if (!/border|box-shadow|background.*focus/.test(context)) {
                    results.push({
                        file_path: filePath,
                        line_number: index + 1,
                        code_snippet: line.trim(),
                        issue_type: 'missing_focus_indicator',
                        severity: 'high',
                        description: 'Removed outline without alternative focus indicator',
                        suggested_fix: 'Add visible focus style: box-shadow, border, or background change',
                        wcag_violation: 'WCAG 2.1 Level AA - 2.4.7 Focus Visible',
                    });
                }
            }
        });
    }

    return results;
}

/**
 * Detect poor color contrast (simple heuristic)
 */
export function detectPoorContrast(code: string, filePath: string): UXIssue[] {
    const results: UXIssue[] = [];
    const lines = code.split('\n');

    // Simple pattern: light text on light background or dark on dark
    const lightColors = ['white', '#fff', '#ffffff', 'rgb(255', 'hsl(.*,.*,.*9[0-9]%'];
    const darkColors = ['black', '#000', '#000000', 'rgb(0', 'hsl(.*,.*,.*[0-2][0-9]%'];

    lines.forEach((line, index) => {
        // Look for color and background-color in same context
        if (/color\s*:/.test(line) && /background/.test(line)) {
            const isLightText = lightColors.some(c => new RegExp(c, 'i').test(line));
            const isLightBg = lightColors.some(c => new RegExp(`background.*${c}`, 'i').test(line));
            const isDarkText = darkColors.some(c => new RegExp(c, 'i').test(line));
            const isDarkBg = darkColors.some(c => new RegExp(`background.*${c}`, 'i').test(line));

            if ((isLightText && isLightBg) || (isDarkText && isDarkBg)) {
                results.push({
                    file_path: filePath,
                    line_number: index + 1,
                    code_snippet: line.trim(),
                    issue_type: 'poor_contrast',
                    severity: 'medium',
                    description: 'Potential low contrast between text and background',
                    suggested_fix: 'Ensure 4.5:1 contrast ratio for normal text (WCAG AA)',
                    wcag_violation: 'WCAG 2.1 Level AA - 1.4.3 Contrast (Minimum)',
                });
            }
        }
    });

    return results;
}

/**
 * Detect forms without validation feedback
 */
export function detectPoorFormUX(code: string, filePath: string): UXIssue[] {
    const results: UXIssue[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        // Check for input validation without error message display
        if (/required|pattern\s*=/.test(line) && /<input/.test(line)) {
            const context = lines.slice(index, Math.min(index + 10, lines.length)).join('\n');

            if (!/error|Error|invalid|aria-describedby/.test(context)) {
                results.push({
                    file_path: filePath,
                    line_number: index + 1,
                    code_snippet: line.trim(),
                    issue_type: 'missing_validation_feedback',
                    severity: 'medium',
                    description: 'Input validation without user feedback',
                    suggested_fix: 'Add error message display for validation failures',
                });
            }
        }

        // Check for forms without submit button
        if (/<form/.test(line)) {
            const formContext = code.substring(code.indexOf(line));
            const formEnd = formContext.indexOf('</form>');
            const formContent = formContext.substring(0, formEnd);

            if (!/<button[^>]*type\s*=\s*["']submit["']/.test(formContent) && !/<input[^>]*type\s*=\s*["']submit["']/.test(formContent)) {
                results.push({
                    file_path: filePath,
                    line_number: index + 1,
                    code_snippet: line.trim(),
                    issue_type: 'missing_submit_button',
                    severity: 'medium',
                    description: 'Form without submit button',
                    suggested_fix: 'Add <button type="submit"> for accessibility',
                });
            }
        }
    });

    return results;
}

/**
 * Detect confusing navigation patterns
 */
export function detectNavigationIssues(code: string, filePath: string): UXIssue[] {
    const results: UXIssue[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        // Check for <a> tags with onClick but no href
        if (/<a[^>]*onClick/.test(line) && !/<a[^>]*href/.test(line)) {
            results.push({
                file_path: filePath,
                line_number: index + 1,
                code_snippet: line.trim(),
                issue_type: 'invalid_link',
                severity: 'medium',
                description: 'Clickable link without href - poor UX and accessibility',
                suggested_fix: 'Use <button> for actions, <a href="..."> for navigation',
            });
        }

        // Check for divs with onClick (should be buttons)
        if (/<div[^>]*onClick/.test(line) && !/role\s*=\s*["']button["']/.test(line)) {
            results.push({
                file_path: filePath,
                line_number: index + 1,
                code_snippet: line.trim(),
                issue_type: 'div_as_button',
                severity: 'medium',
                description: 'Div used as button - not keyboard accessible',
                suggested_fix: 'Use <button> element or add role="button" and keyboard handlers',
                wcag_violation: 'WCAG 2.1 Level A - 2.1.1 Keyboard',
            });
        }
    });

    return results;
}
