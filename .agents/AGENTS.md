# SportsEdge Agent Rules

## Pre-Commit Verification
- **Testing**: Always ensure that all local tests are passing before committing and pushing any code. Run backend tests (`uv run pytest` inside `apps/api`) and frontend tests (`pnpm test run` inside `apps/web`).
- **SonarQube Analysis**: Always run SonarQube analysis and fix any discovered issues before committing and pushing code. You can use the `sonarqube` MCP server tools or a local Sonar scanner (if available) to analyze code and verify quality gates. Ensure the quality gate passes and no new critical issues are introduced.
