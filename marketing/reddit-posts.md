# CodeXRay Reddit Posts

---

## r/ClaudeAI

**Title:** I built an MCP server that cuts Claude Code's token usage by 30%+ on large codebases

**Body:**

I kept watching Claude Code burn through tokens when working on my projects. The pattern was always the same: Claude gets a task, greps around, reads 10-15 files, greps again, reads more files. By the time it actually starts working, it's used 150k+ tokens just on exploration.

So I built CodeXRay -- an MCP server that pre-indexes your codebase into a local SQLite knowledge graph. Tree-sitter parses everything into ASTs, extracts every function, class, method, and their relationships (calls, imports, extends, etc.), then builds a TF-IDF semantic search index on top.

The key tool is `codexray_context`. Instead of Claude doing 5-10 file reads to understand a feature, it makes one call like `codexray_context("authentication flow")` and gets back all the relevant symbols, their source code, and how they connect to each other. Done.

In my testing, it consistently saves 30%+ tokens and 25%+ tool calls across real tasks.

**What it actually does:**

- 16 MCP tools: semantic search, call graph traversal, dead code detection, impact analysis, circular dependency detection, complexity reports, path finding between any two symbols
- TF-IDF semantic search -- search "authentication" and it finds `login()`, `validateToken()`, `AuthService` even though the names are different. No API keys, no embeddings model, fully local
- One-command setup: `npx codexray` configures everything in `~/.claude.json`, sets up auto-allow for all tools, indexes your project, writes CLAUDE.md
- Git hooks keep the index in sync automatically

It supports 15 languages (TypeScript, Python, Go, Rust, Java, C#, and more).

Setup is literally:

```
npx codexray
```

Restart Claude Code, and it starts using the tools automatically.

Open source, MIT licensed: https://github.com/NeuralRays/codexray

Curious if anyone else has been frustrated by how many tokens Claude spends just reading files before doing actual work.

---

## r/cursor

**Title:** MCP server that gives Cursor's AI a pre-built knowledge graph of your codebase

**Body:**

I've been working on an MCP server called CodeXRay that might be useful for Cursor users. It indexes your entire codebase into a local SQLite graph database, so the AI doesn't have to scan through files one by one to understand your code.

**The problem it solves:** When you ask the AI to fix something or add a feature, it spends a lot of time (and context window) reading files to figure out what's where. With CodeXRay, it can query a pre-built graph instead.

**How it works with Cursor:**

CodeXRay runs as a stdio MCP server. You point Cursor at it, and the AI gets access to 16 tools:

- `codexray_context` -- describe what you're working on in natural language, get back all relevant code with call relationships. Replaces reading 5-10 files.
- `codexray_semantic` -- TF-IDF semantic search. Search by meaning, not just exact names.
- `codexray_impact` -- before you change something, see the full blast radius (all transitive callers).
- `codexray_callers` / `codexray_callees` -- trace the call graph in either direction.
- `codexray_deadcode` -- find unused functions/classes the AI doesn't need to worry about.
- `codexray_hotspots` -- identify the most connected symbols in your codebase (riskiest to change).

Everything runs locally. No API calls, no cloud. The index lives in `.codexray/graph.db`.

Supports 15 languages including TypeScript, Python, Go, Rust, Java, C#, and more. Tree-sitter does the parsing, so it handles real-world code accurately.

Install: `npm install -g codexray` then `codexray init --index` in your project.

To connect to Cursor, start the server with `codexray serve` and configure it as an MCP server.

MIT licensed, open source: https://github.com/NeuralRays/codexray

Would love feedback from anyone who tries it. Particularly interested in whether the semantic search results are useful for your codebases.

---

## r/opensource

**Title:** CodeXRay -- semantic code intelligence with zero external dependencies for the search engine (MIT, TypeScript)

**Body:**

I just open-sourced CodeXRay, a tool that builds a knowledge graph of your codebase and exposes it to AI coding agents via the Model Context Protocol (MCP).

**What makes it interesting technically:**

The semantic search engine uses TF-IDF with no external dependencies. No transformers.js (which is ~500MB), no ONNX runtime, no embedding models to download, no API keys. It tokenizes code by splitting camelCase/snake_case identifiers, computes term frequencies weighted by where they appear (symbol name 4x, signature 2x, docstring 1.5x), and applies inverse document frequency across all symbols. The result: you search "user authentication" and it finds `login()`, `validateToken()`, `AuthService` -- different names, same semantic domain.

**Architecture:**

- Tree-sitter parses 15 languages into ASTs
- Custom extractor walks each AST to pull out functions, classes, methods, types, plus relationships (calls, imports, extends, implements, renders, decorates, etc.)
- Everything goes into a SQLite database with FTS5 for keyword search and custom TF-IDF tables for semantic search
- Graph algorithms (BFS/DFS) power impact analysis, path finding, dead code detection, circular dependency detection
- MCP server exposes 16 tools over stdio

**The numbers:**

Testing against real coding tasks, it saves AI agents 30%+ tokens and 25%+ tool calls compared to the agent scanning files manually. One `codexray_context("fix the auth bug")` call replaces what would otherwise be 5-10 file reads.

**Stack:** TypeScript, better-sqlite3, tree-sitter, commander, chokidar. No runtime cloud dependencies.

**Install:** `npx codexray` or `npm install -g codexray`

MIT licensed. PRs welcome.

GitHub: https://github.com/NeuralRays/codexray
npm: https://www.npmjs.com/package/codexray

---

## r/node

**Title:** Built a code knowledge graph in TypeScript -- tree-sitter AST parsing, SQLite graph with FTS5, and a from-scratch TF-IDF engine

**Body:**

I built CodeXRay, a TypeScript project that indexes codebases into a SQLite knowledge graph. Wanted to share some of the technical details since there were some interesting Node.js-specific decisions.

**Tree-sitter in Node:**

tree-sitter has native bindings for Node via `node-gyp`. The 13 language grammars are optional dependencies so you only compile what you need. The parser registry lazy-loads grammars -- it detects the language from file extensions and only requires the tree-sitter grammar package on first use. Keeps startup fast.

**SQLite via better-sqlite3:**

The graph database uses better-sqlite3 with WAL mode, 64MB cache, and 256MB mmap. Schema has five core tables: `nodes` (every symbol), `edges` (relationships), `files` (tracking for incremental sync), `search_tokens` (TF-IDF term frequencies), and `idf_cache` (inverse document frequencies). Plus an FTS5 virtual table for keyword search.

All writes use prepared statements and transactions. Upserts handle re-indexing without duplicates.

**TF-IDF from scratch:**

Instead of pulling in a vector embedding library, I implemented TF-IDF directly:

1. Tokenizer splits camelCase, snake_case, PascalCase, dot.notation into individual words
2. Stop words filtered (common programming keywords like `function`, `return`, `const`)
3. Term frequency computed per symbol, weighted by source: name tokens get 4x weight, signature 2x, docstring 1.5x
4. IDF computed across all symbols and cached in SQLite
5. Search queries go through the same tokenizer, then score against every symbol using cosine-like TF-IDF scoring

The whole thing builds in under a second for most projects. No GPU, no model downloads, no external APIs.

**Graph algorithms:**

- BFS for impact analysis (blast radius) and path finding between symbols
- DFS for circular dependency detection
- Connectivity scoring for hotspot analysis (most connected = riskiest to change)

**MCP server:**

The MCP (Model Context Protocol) server is a stdio JSON-RPC implementation. No HTTP, no WebSocket -- the AI tool spawns it as a subprocess and communicates over stdin/stdout. Handles `initialize`, `tools/list`, and `tools/call` methods. 16 tools total.

**Other Node-specific stuff:**

- chokidar v4 for watch mode with 300ms debouncing
- commander for the CLI (12 commands including an interactive installer)
- `glob` v13 for file discovery
- SHA-256 hashing for incremental sync (only re-parses changed files)
- Cross-platform: auto-detects Windows and applies `cmd /c` wrapping for MCP config

Requires Node 18-24. Uses native fetch, fs.promises, and ES2022 features.

GitHub: https://github.com/NeuralRays/codexray
npm: `npm install codexray` (or `npx codexray` for zero-install)

MIT licensed. Happy to answer questions about any of the internals.

---

## r/programming

**Title:** Using knowledge graphs instead of file scanning for AI code agents -- AST parsing, TF-IDF search, and graph algorithms on source code

**Body:**

I've been working on a problem that I think is underexplored: how AI coding agents understand codebases. Right now, tools like Claude Code, Cursor, and Windsurf basically grep and read files until they build up enough context. It works, but it's slow, expensive, and wasteful.

CodeXRay takes a different approach. It pre-indexes the codebase into a knowledge graph, then lets the AI query the graph instead of scanning files.

**The architecture:**

```
Source Files
    |
    v
Tree-sitter (AST parsing, 15 languages)
    |
    v
Symbol Extraction (functions, classes, methods, types, ...)
Edge Extraction (calls, imports, extends, implements, ...)
    |
    v
SQLite Graph Database
    |
    +-- FTS5 Index (keyword search)
    +-- TF-IDF Index (semantic search)
    +-- Graph Edges (call graph, dependency graph)
```

**Why tree-sitter:** It produces concrete syntax trees, not abstract ones, and it's incremental. But more importantly, it has grammars for practically every language, and they're maintained by the community. One extractor module can walk ASTs from 15 different languages and pull out the same types of symbols and relationships.

**The semantic search problem:**

Most code search tools use either keyword matching (fast, misses semantic connections) or vector embeddings (accurate, but requires ~500MB of transformers.js + model downloads + GPU for reasonable speed).

I went with TF-IDF, which sits in between. The key insight is that code symbols contain rich semantic information in their names. Developers name things descriptively: `validateUserToken`, `AuthenticationService`, `loginHandler`. A TF-IDF engine that properly tokenizes these (splitting camelCase/snake_case, filtering programming stop words, weighting by where the token appears) gets surprisingly good semantic recall.

Search "authentication" and it returns `login()`, `validateToken()`, `AuthService`, `checkCredentials()` -- all with different names but sharing semantic tokens after splitting.

No model to download, builds in under a second, deterministic results.

**Graph algorithms on code:**

Once you have a graph, standard algorithms become incredibly useful:

- **BFS from a symbol** gives you blast radius -- everything that would break if you changed it, grouped by distance
- **Reverse BFS** gives you the dependency tree
- **DFS with cycle detection** finds circular dependencies
- **Connectivity scoring** (in-degree + out-degree) identifies hotspots -- the most critical symbols in your codebase
- **Bidirectional BFS** finds the shortest path between any two symbols (useful for understanding how components connect)
- **Dead code detection** is just finding nodes with zero in-edges (excluding exports)

These are well-known algorithms, but applying them to a code graph and exposing them as tools for AI agents turns out to be really practical.

**Results:**

In testing, AI agents using the graph save 30%+ tokens and 25%+ tool calls compared to their default file-scanning behavior. One context query replaces 5-10 file reads because the graph already knows which symbols are relevant and how they connect.

The whole thing is open source (MIT), written in TypeScript, ~50MB installed, runs on Node 18+, stores everything in a local SQLite file.

GitHub: https://github.com/NeuralRays/codexray

Interested in thoughts from anyone working on similar problems -- code intelligence, static analysis, or AI tooling.
