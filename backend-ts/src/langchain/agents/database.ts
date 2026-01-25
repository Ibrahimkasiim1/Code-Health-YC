import { BaseAgent, AgentConfig, AgentContext } from "./base.js";
import { databaseAgentTools } from "../tools/index.js";
import { Issue } from "../schemas/issue.js";

const DATABASE_AGENT_PROMPT = `You are the Database Agent for a code health platform. Your job is to identify N+1 queries and other database inefficiencies.

You have access to tools to:
- Search and read files from GitHub
- Detect ORM patterns and N+1 queries
- Parse code structure
- Use LLM for database analysis

Focus on finding:
1. **N+1 Queries**: Database queries inside loops
2. **Missing Eager Loading**: Related data fetched separately
3. **Inefficient Queries**: SELECT * when only few columns needed
4. **Missing Transactions**: Multiple related writes without transaction
5. **Connection Leaks**: Database connections not properly closed
6. **Raw SQL Injection**: Unsanitized input in raw queries
7. **Missing Indexes**: Queries on unindexed columns (inferred from patterns)

For each database issue found, provide:
- File and line location
- The problematic query pattern
- Why it's inefficient
- Expected performance impact
- Suggested fix with code example

Output as JSON:
{
  "issues": [
    {
      "issue_id": "db-xxx",
      "type": "database_inefficiency",
      "severity": "high|medium|low",
      "title": "Brief title",
      "description": "Detailed description",
      "file_path": "path/to/file.ts",
      "line_start": 10,
      "line_end": 20,
      "code_snippet": "inefficient query code",
      "root_cause": "Why this is inefficient",
      "impact": "X extra queries per request",
      "suggested_fix": "How to optimize",
      "confidence": 0.9,
      "metadata": {
        "query_type": "N+1",
        "orm": "prisma",
        "estimated_extra_queries": 50
      }
    }
  ]
}`;

export class DatabaseAgent extends BaseAgent {
  constructor() {
    const agentConfig: AgentConfig = {
      name: "DatabaseAgent",
      description: "Identifies N+1 queries and database inefficiencies",
      priority: 5,
      systemPrompt: DATABASE_AGENT_PROMPT,
      tools: databaseAgentTools,
    };
    super(agentConfig);
  }

  protected buildUserMessage(context: AgentContext): string {
    const repoContext = context.repositoryContext;
    const databases = (repoContext?.databases as string[]) || [];
    const frameworks = (repoContext?.frameworks as string[]) || [];
    
    // Detect likely ORM from frameworks
    let ormHint = "";
    if (frameworks.some(f => f.toLowerCase().includes("prisma"))) ormHint = "prisma";
    else if (frameworks.some(f => f.toLowerCase().includes("sequelize"))) ormHint = "sequelize";
    else if (frameworks.some(f => f.toLowerCase().includes("typeorm"))) ormHint = "typeorm";
    
    return `Analyze database usage for repository ${context.owner}/${context.repo}.

Repository Context:
- Databases: ${databases.join(", ") || "Unknown"}
- Likely ORM: ${ormHint || "Unknown"}

Steps:
1. Search for database-related files (models, repositories, queries)
2. Detect ORM patterns and identify the ORM being used
3. Find N+1 query patterns (queries inside loops)
4. Look for missing eager loading / includes
5. Check for raw SQL with potential injection risks
6. Identify missing transaction patterns

Provide all database inefficiency findings as JSON with the standard issue format.`;
  }

  protected parseIssues(result: { messages: Array<{ content: string }> }): Issue[] {
    const baseIssues = super.parseIssues(result);
    
    return baseIssues.map(issue => ({
      ...issue,
      type: "database_inefficiency" as const,
      agent: this.name,
    }));
  }
}

export const databaseAgent = new DatabaseAgent();

