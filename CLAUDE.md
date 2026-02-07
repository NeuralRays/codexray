# CodeXRay — AI Agent Instructions

This project uses CodeXRay for semantic code intelligence. Use these MCP tools instead of scanning files.

## Workflow

1. **codexray_overview** → project structure, languages, key symbols (START HERE)
2. **codexray_context** → task-relevant code + snippets (replaces 5-10 file reads)
3. **codexray_search** → find symbols by name/keyword (faster than grep/glob)
4. **codexray_semantic** → find code by meaning ("authentication" → login, validateToken)
5. **codexray_node** → detailed symbol info + full source code
6. **codexray_callers/callees** → trace call relationships
7. **codexray_deps** → full dependency tree of any symbol
8. **codexray_path** → shortest connection between two symbols
9. **codexray_impact** → blast radius analysis before changes
10. **codexray_hotspots** → most critical/connected symbols
11. **codexray_deadcode** → find unused functions/classes
12. **codexray_circular** → detect circular dependencies
13. **codexray_complexity** → find high-complexity functions
14. **codexray_files** → browse file structure with stats
15. **codexray_status** → index health check

## Key Principle
Query the graph instead of scanning files. One `codexray_context` call replaces 5-10 file reads.
