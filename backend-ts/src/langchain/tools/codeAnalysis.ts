import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Extract dependencies from package manifests
 */
export const parseDependencies = tool(
  async (input) => {
    try {
      const dependencies: Array<{ name: string; version: string; dev_dependency: boolean }> = [];

      if (input.file_type === "package.json") {
        const pkg = JSON.parse(input.file_content);
        for (const [name, version] of Object.entries(pkg.dependencies || {})) {
          dependencies.push({ name, version: String(version), dev_dependency: false });
        }
        for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
          dependencies.push({ name, version: String(version), dev_dependency: true });
        }
      } else if (input.file_type === "requirements.txt") {
        const lines = input.file_content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const match = trimmed.match(/^([a-zA-Z0-9_-]+)([=<>!~]+.*)?$/);
          if (match) {
            dependencies.push({ name: match[1], version: match[2] || "*", dev_dependency: false });
          }
        }
      } else if (input.file_type === "Cargo.toml") {
        const depSection = input.file_content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
        if (depSection) {
          const lines = depSection[1].split("\n");
          for (const line of lines) {
            const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*["']?([^"'\n]+)["']?/);
            if (match) dependencies.push({ name: match[1], version: match[2], dev_dependency: false });
          }
        }
      } else if (input.file_type === "go.mod") {
        const lines = input.file_content.split("\n");
        for (const line of lines) {
          const match = line.match(/^\s*([^\s]+)\s+v([^\s]+)/);
          if (match) dependencies.push({ name: match[1], version: match[2], dev_dependency: false });
        }
      }

      return JSON.stringify(dependencies);
    } catch (error) {
      return JSON.stringify({ error: `Parse failed: ${error}` });
    }
  },
  {
    name: "parse_dependencies",
    description: "Extract dependencies from package manifests. Supports package.json, requirements.txt, Cargo.toml, go.mod.",
    schema: z.object({
      file_content: z.string().describe("Content of the package manifest file"),
      file_type: z.enum(["package.json", "requirements.txt", "Cargo.toml", "go.mod"]).describe("Type of manifest file"),
    }),
  }
);

/**
 * Parse code into Abstract Syntax Tree for structural analysis
 * Note: This is a simplified implementation - in production, use proper AST parsers
 */
export const parseCodeAst = tool(
  async (input) => {
    try {
      const lines = input.code.split("\n");
      const functions: Array<{ name: string; line_start: number; line_end: number }> = [];
      const imports: string[] = [];
      const exports: string[] = [];

      // Simple regex-based parsing (production should use proper AST parsers)
      if (input.language === "javascript" || input.language === "typescript") {
        lines.forEach((line, idx) => {
          // Imports
          const importMatch = line.match(/import\s+.*from\s+['"]([^'"]+)['"]/);
          if (importMatch) imports.push(importMatch[1]);
          const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
          if (requireMatch) imports.push(requireMatch[1]);

          // Functions
          const funcMatch = line.match(/(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(?.*\)?\s*=>/);
          if (funcMatch) {
            const name = funcMatch[1] || funcMatch[2];
            functions.push({ name, line_start: idx + 1, line_end: idx + 1 });
          }

          // Exports
          const exportMatch = line.match(/export\s+(?:default\s+)?(?:const|let|var|function|class)\s+(\w+)/);
          if (exportMatch) exports.push(exportMatch[1]);
        });
      } else if (input.language === "python") {
        lines.forEach((line, idx) => {
          const importMatch = line.match(/(?:from\s+(\S+)\s+)?import\s+(.+)/);
          if (importMatch) imports.push(importMatch[1] || importMatch[2]);

          const funcMatch = line.match(/def\s+(\w+)\s*\(/);
          if (funcMatch) functions.push({ name: funcMatch[1], line_start: idx + 1, line_end: idx + 1 });
        });
      }

      return JSON.stringify({ functions, imports, exports });
    } catch (error) {
      return JSON.stringify({ error: `Parse failed: ${error}` });
    }
  },
  {
    name: "parse_code_ast",
    description: "Parse code to extract functions, imports, and exports. Use for structural analysis.",
    schema: z.object({
      code: z.string().describe("Source code to parse"),
      language: z.enum(["javascript", "typescript", "python", "go"]).describe("Programming language"),
    }),
  }
);

/**
 * Find ORM usage and detect N+1 query patterns
 */
export const detectOrmPatterns = tool(
  async (input) => {
    try {
      const queries: Array<{ type: string; line_number: number; pattern: string; n_plus_one_risk: boolean }> = [];
      const lines = input.code.split("\n");
      let ormDetected = "unknown";

      if (input.code.includes("sequelize") || input.code.includes("Sequelize")) ormDetected = "sequelize";
      else if (input.code.includes("prisma") || input.code.includes("PrismaClient")) ormDetected = "prisma";
      else if (input.code.includes("TypeORM") || input.code.includes("getRepository")) ormDetected = "typeorm";
      else if (input.code.includes("sqlalchemy") || input.code.includes("Session")) ormDetected = "sqlalchemy";

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        if (line.match(/\.(findAll|findMany|find|select)\s*\(/)) {
          const inLoop = lines.slice(Math.max(0, idx - 5), idx).some((l) => l.match(/for\s*\(|\.forEach|\.map\s*\(/));
          queries.push({ type: "select", line_number: lineNum, pattern: line.trim(), n_plus_one_risk: inLoop });
        }
        if (line.match(/\.(query|raw|execute)\s*\(/)) {
          const inLoop = lines.slice(Math.max(0, idx - 5), idx).some((l) => l.match(/for\s*\(|\.forEach|\.map\s*\(/));
          queries.push({ type: "raw_query", line_number: lineNum, pattern: line.trim(), n_plus_one_risk: inLoop });
        }
      });

      return JSON.stringify({ orm_detected: ormDetected, queries });
    } catch (error) {
      return JSON.stringify({ error: `Detection failed: ${error}` });
    }
  },
  {
    name: "detect_orm_patterns",
    description: "Find ORM usage and detect N+1 query patterns.",
    schema: z.object({
      code: z.string().describe("Source code to analyze"),
      orm_type: z.enum(["sequelize", "prisma", "typeorm", "sqlalchemy"]).optional().describe("Expected ORM type"),
    }),
  }
);

/**
 * Find route/endpoint definitions in code
 */
export const extractApiEndpoints = tool(
  async (input) => {
    try {
      const endpoints: Array<{ path: string; method: string; handler_function: string; line_number: number }> = [];
      const lines = input.code.split("\n");

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;

        if (input.framework === "express" || input.framework === "hono") {
          const match = line.match(/\.(get|post|put|patch|delete|all)\s*\(\s*['"]([^'"]+)['"]/i);
          if (match) {
            const handlerMatch = line.match(/,\s*(\w+)\s*\)/);
            endpoints.push({ path: match[2], method: match[1].toUpperCase(), handler_function: handlerMatch?.[1] || "anonymous", line_number: lineNum });
          }
        } else if (input.framework === "flask") {
          const match = line.match(/@(?:app|blueprint)\.route\s*\(\s*['"]([^'"]+)['"]/);
          if (match) {
            const methodMatch = line.match(/methods\s*=\s*\[([^\]]+)\]/);
            const methods = methodMatch ? methodMatch[1].replace(/['"]/g, "").split(",").map((m) => m.trim()) : ["GET"];
            for (const method of methods) {
              endpoints.push({ path: match[1], method, handler_function: "decorated", line_number: lineNum });
            }
          }
        } else if (input.framework === "fastapi") {
          const match = line.match(/@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/i);
          if (match) {
            endpoints.push({ path: match[2], method: match[1].toUpperCase(), handler_function: "decorated", line_number: lineNum });
          }
        }
      });

      return JSON.stringify(endpoints);
    } catch (error) {
      return JSON.stringify({ error: `Extraction failed: ${error}` });
    }
  },
  {
    name: "extract_api_endpoints",
    description: "Find route/endpoint definitions in code.",
    schema: z.object({
      code: z.string().describe("Source code to analyze"),
      framework: z.enum(["express", "flask", "fastapi", "hono"]).describe("Web framework"),
    }),
  }
);

export const codeAnalysisTools = [parseDependencies, parseCodeAst, detectOrmPatterns, extractApiEndpoints];
