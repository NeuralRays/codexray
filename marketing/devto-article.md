---
title: "I Built an MCP Server That Gives AI Coding Agents X-Ray Vision Into Codebases"
published: true
description: "CodeXRay: 16 MCP tools, TF-IDF semantic search, tree-sitter AST parsing, call graphs, dead code detection, and blast radius analysis -- all local, zero cloud dependencies. Saves AI agents 30%+ tokens."
tags: ai, opensource, productivity, programming
cover_image: https://raw.githubusercontent.com/NeuralRays/codexray/main/assets/cover.png
---

## The Problem: AI Agents Are Blind

Here is what happens every time you ask Claude Code to fix a bug:

```
You: "Fix the authentication bug"

Claude: Let me find the relevant code...
  → grep "auth" across all files
  → Read auth/handler.ts (2,400 tokens)
  → Read auth/middleware.ts (1,800 tokens)
  → grep "login" across all files
  → Read users/service.ts (3,100 tokens)
  → Read users/controller.ts (2,200 tokens)
  → Read utils/jwt.ts (1,500 tokens)
  → grep "validateToken" across all files
  → Read auth/validator.ts (1,900 tokens)
  → ...8 more file reads...

Total: 60 tool calls, 157k tokens, $0.47 per question
```

Your AI agent is essentially stumbling through your codebase in the dark, reading files one at a time, hoping to find what it needs. It has no map, no index, no understanding of how your code connects. Every. Single. Time.

I built [CodeXRay](https://github.com/NeuralRays/codexray) to fix this.

## The Solution: A Semantic Knowledge Graph

CodeXRay is an open-source MCP server that pre-indexes your entire codebase into a local SQLite graph database. When your AI agent needs to understand your code, it queries the graph instantly instead of scanning files.

```
You: "Fix the authentication bug"

Claude: → codexray_context("authentication")
  Returns: AuthService, validateToken, loginHandler,
  JWTMiddleware -- with code snippets, call graphs,
  and dependency relationships

Total: 45 tool calls, 111k tokens (30%+ savings)
```

One `codexray_context` call replaces 5-10 file reads.

Here is the architecture in a nutshell:

```
Source Files
    |
    v
tree-sitter AST parsing (13 languages)
    |
    v
Symbol Extraction (functions, classes, methods, types...)
    |
    v
SQLite Graph Database
    |
    +--> FTS5 Index (keyword search)
    +--> TF-IDF Index (semantic search)
    +--> Graph Edges (calls, imports, extends, implements...)
    |
    v
MCP Server (16 tools)
    |
    v
Claude Code / Cursor / Windsurf
```

Everything runs locally. No API keys. No cloud. No ML models to download. Just pure local math and a SQLite database.

## How It Works Under the Hood

### Step 1: Parse Everything With Tree-sitter

CodeXRay uses [tree-sitter](https://tree-sitter.github.io/) to parse source files into concrete syntax trees. This is the same parsing technology used by GitHub, Neovim, and Zed. It is fast, accurate, and handles 13 languages:

```typescript
// From src/parsers/registry.ts
export const LANGUAGES: LanguageConfig[] = [
  { name: 'typescript', extensions: ['.ts', '.tsx'],
    treeSitterPackage: 'tree-sitter-typescript' },
  { name: 'javascript', extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    treeSitterPackage: 'tree-sitter-javascript' },
  { name: 'python', extensions: ['.py', '.pyw'],
    treeSitterPackage: 'tree-sitter-python' },
  { name: 'go',     extensions: ['.go'],
    treeSitterPackage: 'tree-sitter-go' },
  { name: 'rust',   extensions: ['.rs'],
    treeSitterPackage: 'tree-sitter-rust' },
  // + Java, C#, PHP, Ruby, C, C++, Swift, Kotlin
];
```

### Step 2: Extract Symbols and Relationships

The extractor walks each AST and pulls out every meaningful symbol -- functions, classes, methods, interfaces, types, enums, structs, traits, React components, hooks, and even test functions:

```typescript
// The extractor auto-detects React components by PascalCase convention
if (kind === 'function' && /^[A-Z]/.test(name)
    && (lang === 'typescript' || lang === 'javascript'))
  kind = 'component';

// And hooks by the use* naming pattern
if (kind === 'function' && /^use[A-Z]/.test(name))
  kind = 'hook';
```

It also extracts relationships: function calls, imports, class inheritance (`extends`), interface implementation (`implements`), and more. These become edges in the graph.

### Step 3: Build the SQLite Graph

Everything gets stored in a SQLite database with WAL mode, 64MB cache, and memory-mapped I/O for fast queries:

```sql
-- Nodes: every symbol in your codebase
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,          -- function, class, method, component...
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  language TEXT NOT NULL,
  signature TEXT,
  docstring TEXT,
  exported INTEGER DEFAULT 0,
  complexity INTEGER DEFAULT 0
);

-- Edges: how symbols relate to each other
CREATE TABLE edges (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  kind TEXT NOT NULL  -- calls, imports, extends, implements...
);

-- FTS5 full-text search with unicode61 tokenizer
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  name, qualified_name, signature, docstring
);
```

### Step 4: Build the TF-IDF Semantic Index

This is where it gets interesting. More on this below.

### Step 5: Serve via MCP

The graph is exposed through 16 MCP tools over stdio. When Claude Code starts, it launches CodeXRay as a subprocess and can query the graph directly.

## The 16 Tools

CodeXRay provides 16 specialized MCP tools, grouped by use case.

### Primary Tools (start here)

| Tool | What It Does |
|------|-------------|
| `codexray_overview` | Project structure, languages, key symbols. Use first on any new project. |
| `codexray_context` | The power tool. Build comprehensive task-relevant context with code snippets, call graphs, and dependencies. Replaces 5-10 file reads. |
| `codexray_search` | FTS5 keyword search for symbols by name. |
| `codexray_semantic` | TF-IDF semantic search -- find code by *meaning*, not just name. |

### Exploration Tools

| Tool | What It Does |
|------|-------------|
| `codexray_node` | Detailed info + full source code for any symbol. |
| `codexray_callers` | Who calls this function? |
| `codexray_callees` | What does this function call? |
| `codexray_deps` | Full dependency tree. |
| `codexray_path` | Shortest connection between any two symbols (BFS). |

### Analysis Tools

| Tool | What It Does |
|------|-------------|
| `codexray_impact` | Blast radius analysis -- trace all transitive callers via recursive BFS, grouped by depth. |
| `codexray_hotspots` | Most connected/critical symbols ranked by total degree. |
| `codexray_deadcode` | Functions and classes never called or referenced. |
| `codexray_circular` | Circular dependency detection via DFS. |
| `codexray_complexity` | Functions exceeding a cyclomatic complexity threshold. |
| `codexray_files` | Indexed file tree with per-file symbol counts. |
| `codexray_status` | Index health check. |

The key insight is that **`codexray_context` is the workhorse**. When you tell Claude "fix the authentication bug," it calls `codexray_context("authentication")`, which:

1. Extracts keywords from the query (strips stop words, splits camelCase)
2. Searches both FTS5 and TF-IDF indices for matching symbols
3. Expands through the dependency graph (adds callers and callees of top matches)
4. Scores everything by relevance (name match = 10 pts, partial match = 5, signature match = 2, exported = +2)
5. Returns the top results with code snippets, caller/callee lists, and file locations

All in a single tool call.

## TF-IDF Semantic Search: No ML, No API Keys, Just Math

This was the most fun part to build. I wanted semantic search -- the ability to search "authentication" and find `login()`, `validateToken()`, `AuthService` -- but without the typical overhead of vector embeddings.

Most semantic search solutions require:
- `transformers.js` (~500MB)
- An ONNX runtime
- A downloaded model file
- Minutes of embedding generation time
- Sometimes a GPU

CodeXRay uses **TF-IDF** (Term Frequency - Inverse Document Frequency) instead. It is a classic information retrieval algorithm that works surprisingly well for code search when you add domain-aware tokenization.

### How it works

**Step 1: Tokenize with code awareness**

```typescript
private tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → camel Case
    .replace(/[_\-./\\:]/g, ' ')          // snake_case → snake case
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 1 && t.length < 40)
    .filter(t => !STOP_WORDS.has(t));
}
```

`validateUserToken` becomes `["validate", "user", "token"]`. `get_auth_header` becomes `["auth", "header"]`. This is the secret sauce -- by splitting code identifiers into meaningful words, TF-IDF can match across naming conventions.

**Step 2: Compute Term Frequency (TF)**

For each symbol, tokenize its name, qualified name, signature, and docstring. Count how often each token appears relative to the most frequent token in that field:

```
TF("auth", name) = count("auth" in name) / max_count_in_name
```

**Step 3: Compute Inverse Document Frequency (IDF)**

How rare is this token across all symbols? Common tokens like "get" or "set" get low IDF. Rare domain terms like "authentication" or "webhook" get high IDF:

```
IDF(token) = log((totalDocs + 1) / (docsContaining(token) + 1)) + 1
```

**Step 4: Weight by field**

Not all matches are equal. A token appearing in a function's *name* is far more significant than one appearing in its docstring:

```typescript
const sourceWeight =
  row.source === 'name'           ? 4    // Name match = strongest signal
  : row.source === 'signature'    ? 2    // Signature match
  : row.source === 'docstring'    ? 1.5  // Docstring match
  : 1;                                   // Qualified name match

const score = TF * IDF * sourceWeight;
```

**Step 5: Sum scores across query tokens**

The final score for each symbol is the sum of TF-IDF scores for every query token that matches.

The result: search "user authentication" and you get `AuthService`, `loginHandler`, `validateToken`, `UserSession` -- ranked by relevance. No ML model required. Builds in under a second. Deterministic results every time.

## Token Savings: The Numbers

Here is a real before/after comparison on a typical medium-sized TypeScript project (~200 files):

### Before CodeXRay

```
Task: "Fix the authentication bug in the login flow"

Tool calls:
  grep "auth" → 12 matches
  Read auth/handler.ts → 2,400 tokens
  Read auth/middleware.ts → 1,800 tokens
  grep "login" → 8 matches
  Read users/service.ts → 3,100 tokens
  Read users/controller.ts → 2,200 tokens
  Read utils/jwt.ts → 1,500 tokens
  Read auth/validator.ts → 1,900 tokens
  grep "token" → 15 matches
  Read auth/token-service.ts → 2,600 tokens
  ... (more reads)

Total: ~60 tool calls, ~157,000 tokens
```

### After CodeXRay

```
Task: "Fix the authentication bug in the login flow"

Tool calls:
  codexray_context("authentication login flow") →
    Returns 15 relevant symbols with:
    - Code snippets
    - Call relationships
    - File locations
    - Signatures

  ... (targeted reads for actual edits)

Total: ~45 tool calls, ~111,000 tokens
```

That is **30%+ fewer tokens** and **25%+ fewer tool calls**. Over a day of active development, that adds up to real money and real time savings.

The biggest win is not just the token count -- it is the *quality* of context. Instead of Claude reading 15 files and trying to piece together how authentication works, it gets a structured graph view showing exactly which functions call which, what the dependency chain looks like, and where the relevant code lives.

## Getting Started

### Install and configure in one command

```bash
npx codexray
```

That is it. The interactive installer:

1. Configures the MCP server in `~/.claude.json`
2. Sets up auto-allow permissions for all 16 tools
3. Auto-detects Windows and applies `cmd /c` wrapping
4. Initializes and indexes your current project
5. Builds the TF-IDF semantic search index
6. Writes a `CLAUDE.md` file with tool usage instructions
7. Installs git hooks for auto-sync on every commit

Restart Claude Code and it works automatically. Your AI agent now has X-ray vision.

### Manual setup

If you prefer more control:

```bash
# Initialize and index a project
codexray init --index

# Or use the short alias
cxr init -i
```

### What gets created

```
your-project/
  .codexray/
    config.json    # Exclude patterns, max file size
    graph.db       # SQLite database with your code graph
```

The database is local to each developer's machine and automatically added to `.gitignore`.

### Keeping the index fresh

```bash
# Incremental sync (only changed files)
codexray sync

# Real-time file watching (300ms debounce)
codexray watch

# Force full re-index
codexray index --force
```

Git hooks handle this automatically. After every commit, the index syncs in the background.

### Use it from code too

CodeXRay also has a library API:

```typescript
import CodeXRay from 'codexray';

const cxr = await CodeXRay.init('/path/to/project', { index: true });

// Semantic search
const results = cxr.semanticSearch('user authentication flow');

// Call graph traversal
const callers = cxr.getCallers(results[0].id);

// Blast radius analysis
const impact = cxr.getImpact(results[0].id);

// Dead code detection
const dead = cxr.findDeadCode();

// Smart context building
const context = cxr.buildContext('fix login authentication bug');
console.log(cxr.formatContext(context));

cxr.close();
```

## What's Next

CodeXRay is actively maintained and here is what is on the roadmap:

- **More languages** -- Scala, Dart, Elixir, Haskell, and Zig support via additional tree-sitter grammars
- **VS Code extension** -- Visualize the code graph, hotspots, and dead code directly in your editor
- **Incremental TF-IDF updates** -- Currently the semantic index rebuilds fully; planning per-file delta updates
- **Cross-repository analysis** -- Index multiple repos and trace dependencies across project boundaries
- **Custom tool authoring** -- Let users define their own MCP tools powered by the graph
- **Smarter context budgets** -- Adaptive token limits based on the AI agent's context window

## Try It Out

CodeXRay is MIT licensed, 100% local, and works on macOS, Linux, and Windows.

```bash
npx codexray
```

One command. Zero config. Your AI coding agent just got a lot smarter.

If you find it useful, [give it a star on GitHub](https://github.com/NeuralRays/codexray) -- it helps others discover the project.

Got questions or ideas? [Open an issue](https://github.com/NeuralRays/codexray/issues) or [start a discussion](https://github.com/NeuralRays/codexray/discussions).

---

**GitHub:** [github.com/NeuralRays/codexray](https://github.com/NeuralRays/codexray)
**npm:** [npmjs.com/package/codexray](https://www.npmjs.com/package/codexray)
**License:** MIT
