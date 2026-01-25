import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Check CVE database for known vulnerabilities
 */
export const checkCveDatabase = tool(
  async (input) => {
    try {
      // Query NVD (National Vulnerability Database) API
      const url = new URL("https://services.nvd.nist.gov/rest/json/cves/2.0");
      url.searchParams.set("keywordSearch", input.package_name);
      if (input.version) url.searchParams.set("versionStart", input.version);

      const response = await fetch(url.toString(), {
        headers: { "User-Agent": "CodeHealthPlatform/1.0" },
      });

      if (!response.ok) {
        return JSON.stringify({ error: `NVD API error: ${response.status}` });
      }

      const data = await response.json();
      const vulnerabilities = (data.vulnerabilities || []).slice(0, 20).map((v: { cve: { id: string; descriptions: Array<{ lang: string; value: string }>; metrics?: { cvssMetricV31?: Array<{ cvssData: { baseScore: number; baseSeverity: string } }> } } }) => ({
        cve_id: v.cve.id,
        description: v.cve.descriptions?.find((d: { lang: string }) => d.lang === "en")?.value || "",
        severity: v.cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity || "UNKNOWN",
        score: v.cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore || 0,
      }));

      return JSON.stringify({ package: input.package_name, version: input.version, vulnerabilities });
    } catch (error) {
      return JSON.stringify({ error: `CVE check failed: ${error}` });
    }
  },
  {
    name: "check_cve_database",
    description: "Check CVE database for known vulnerabilities in a package.",
    schema: z.object({
      package_name: z.string().describe("Package name to check"),
      version: z.string().optional().describe("Specific version to check"),
    }),
  }
);

/**
 * Validate code syntax using external linters
 */
export const validateSyntax = tool(
  async (input) => {
    try {
      // This is a simplified implementation - in production, use actual linter APIs
      const errors: Array<{ line: number; column: number; message: string; severity: string }> = [];
      const lines = input.code.split("\n");

      if (input.language === "javascript" || input.language === "typescript") {
        // Basic syntax checks
        let braceCount = 0, parenCount = 0, bracketCount = 0;
        lines.forEach((line, idx) => {
          braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
          parenCount += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
          bracketCount += (line.match(/\[/g) || []).length - (line.match(/]/g) || []).length;

          // Check for common issues
          if (line.match(/console\.log/)) {
            errors.push({ line: idx + 1, column: line.indexOf("console.log"), message: "console.log statement found", severity: "warning" });
          }
          if (line.match(/debugger/)) {
            errors.push({ line: idx + 1, column: line.indexOf("debugger"), message: "debugger statement found", severity: "error" });
          }
        });

        if (braceCount !== 0) errors.push({ line: lines.length, column: 0, message: "Unbalanced braces", severity: "error" });
        if (parenCount !== 0) errors.push({ line: lines.length, column: 0, message: "Unbalanced parentheses", severity: "error" });
        if (bracketCount !== 0) errors.push({ line: lines.length, column: 0, message: "Unbalanced brackets", severity: "error" });
      } else if (input.language === "python") {
        lines.forEach((line, idx) => {
          if (line.match(/print\s*\(/)) {
            errors.push({ line: idx + 1, column: line.indexOf("print"), message: "print statement found", severity: "warning" });
          }
          if (line.match(/import\s+\*/)) {
            errors.push({ line: idx + 1, column: line.indexOf("import"), message: "Wildcard import found", severity: "warning" });
          }
        });
      }

      return JSON.stringify({ valid: errors.filter((e) => e.severity === "error").length === 0, errors });
    } catch (error) {
      return JSON.stringify({ error: `Validation failed: ${error}` });
    }
  },
  {
    name: "validate_syntax",
    description: "Validate code syntax and check for common issues.",
    schema: z.object({
      code: z.string().describe("Code to validate"),
      language: z.enum(["javascript", "typescript", "python", "go"]).describe("Programming language"),
    }),
  }
);

export const externalTools = [checkCveDatabase, validateSyntax];

