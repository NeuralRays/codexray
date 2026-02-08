# CodeXRay Promotional Content

---

## 1. Hacker News "Show HN" Post

### Title

Show HN: CodeXRay -- Semantic code graph for AI agents (tree-sitter, TF-IDF, MCP)

### Text

I built CodeXRay, an open-source MCP server that gives AI coding agents (Claude Code, Cursor, Windsurf) a pre-indexed semantic knowledge graph of your codebase. Instead of agents scanning files one by one with grep and read calls, they query a graph database -- saving 30%+ tokens and 25%+ tool calls.

**The problem:** When you ask Claude Code to "fix the auth bug," it grep-searches for "auth," reads 15 files, grep-searches for "login," reads 8 more. That's 60 tool calls and 157k tokens just to understand your code.

**How it works:** CodeXRay uses tree-sitter to parse 15 languages into ASTs, extracting every function, class, method, type, and their call/import relationships. Everything goes into a SQLite graph database with FTS5 full-text search. On top of that, I built TF-IDF semantic search with camelCase/snake_case token splitting, weighted across symbol names, signatures, and docstrings. No embeddings model needed -- no API keys, no 500MB transformers.js download. Pure math.

The MCP server exposes 16 tools: context building (replaces 5-10 file reads per query), call graph traversal, blast radius analysis via recursive BFS, dead code detection, circular dependency detection via DFS, cyclomatic complexity analysis, path finding between symbols, and hotspot identification.

One `codexray_context("authentication")` call returns the relevant symbols, their source code, and call relationships. The agent gets exactly what it needs in one shot.

Everything is local. SQLite database sits in `.codexray/graph.db`. Git hooks keep it in sync. Install is `npx codexray`.

MIT license. TypeScript. ~50MB install (vs ~500MB for embedding-based alternatives).

GitHub: https://github.com/NeuralRays/codexray

npm: https://www.npmjs.com/package/codexray

---

## 2. Twitter/X Thread

### Tweet 1 (Hook)

Your AI coding agent wastes 30% of its tokens just *finding* your code.

I built an open-source tool that gives it X-ray vision instead.

CodeXRay -- a semantic code graph for Claude Code, Cursor, and Windsurf.

Here's how it works:

### Tweet 2 (The Problem)

The problem is brutal:

You ask Claude Code to "fix the auth bug."

It does: grep "auth" -> read 15 files -> grep "login" -> read 8 more files -> grep "token" -> ...

60 tool calls. 157k tokens. Just to UNDERSTAND the code before writing a single line.

### Tweet 3 (The Solution)

With CodeXRay, that becomes:

codexray_context("authentication") -> done.

One call. Returns the relevant functions, their source code, call relationships, and dependencies.

Result: 30%+ fewer tokens. 25%+ fewer tool calls.

### Tweet 4 (Architecture)

The architecture is dead simple:

tree-sitter parses 15 languages into ASTs
-> extracts every symbol + call/import relationships
-> stores in SQLite graph DB with FTS5
-> TF-IDF semantic search on top
-> exposed via 16 MCP tools

No ML models. No API keys. No cloud. Pure math.

### Tweet 5 (TF-IDF)

The semantic search uses TF-IDF -- the same algorithm behind early Google.

Search "authentication" and it finds: login(), validateToken(), AuthService, checkCredentials()

It splits camelCase and snake_case, weights by symbol name/signature/docstring.

Zero external dependencies. ~50MB install vs ~500MB for embedding-based alternatives.

### Tweet 6 (Before/After)

Before CodeXRay:
- Agent reads files one by one
- Guesses which files matter
- Burns tokens on irrelevant code
- Can't see the dependency graph

After CodeXRay:
- Agent queries the graph
- Gets exactly what it needs
- Sees callers, callees, impact radius
- Understands the architecture in one call

### Tweet 7 (Analysis Features)

It's not just search. CodeXRay ships 16 tools:

- Dead code detection (find unused functions)
- Blast radius analysis (what breaks if I change this?)
- Circular dependency detection (DFS cycle finding)
- Hotspot analysis (most connected/risky symbols)
- Complexity analysis (cyclomatic complexity)
- Path finding between any two symbols

### Tweet 8 (Developer Experience)

Setup takes 30 seconds:

npx codexray

That's it. It:
- Configures the MCP server
- Indexes your codebase
- Builds the semantic search index
- Installs git hooks for auto-sync

Works with Claude Code, Cursor, Windsurf. macOS, Linux, Windows.

### Tweet 9 (Open Source)

Fully open source. MIT license.

Built with TypeScript. SQLite for the graph DB. Tree-sitter for parsing. No cloud dependencies.

Everything stays local in .codexray/graph.db

15 languages: TypeScript, JavaScript, Python, Go, Rust, Java, C#, PHP, Ruby, C, C++, Swift, Kotlin, and more.

### Tweet 10 (CTA)

If you're using AI coding agents, give CodeXRay a try:

GitHub: https://github.com/NeuralRays/codexray
Install: npx codexray
npm: https://www.npmjs.com/package/codexray

Star it if it's useful. PRs welcome. Would love your feedback.

@AnthropicAI @cursor_ai

#MCP #ClaudeCode #AICoding #OpenSource
