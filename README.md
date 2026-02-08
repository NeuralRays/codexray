# CodeXRay

[![npm version](https://img.shields.io/npm/v/codexray?color=cb3837&logo=npm)](https://www.npmjs.com/package/codexray)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18--24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-8B5CF6?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+)](https://modelcontextprotocol.io/)
[![GitHub stars](https://img.shields.io/github/stars/NeuralRays/codexray?style=social)](https://github.com/NeuralRays/codexray)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/NeuralRays/codexray/pulls)
[![Maintenance](https://img.shields.io/badge/Maintained-yes-green.svg)](https://github.com/NeuralRays/codexray/commits/main)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)](https://github.com/NeuralRays/codexray)

**X-ray vision for your codebase** — semantic knowledge graph that saves AI coding agents **30%+ tokens** and **25%+ tool calls**. Zero config, zero API keys, 100% local.

> **One `codexray_context` call replaces 5-10 file reads.** Your AI agent queries a pre-built knowledge graph instead of scanning files one by one.

<details>
<summary><b>See the token savings in action</b></summary>

### Without CodeXRay (typical Claude Code session)
```
You: "Fix the authentication bug in the login flow"

Claude Code:
  1. grep "auth" across codebase          →  800 tokens
  2. Read auth/middleware.ts               → 1,200 tokens
  3. Read auth/service.ts                  → 1,500 tokens
  4. Read auth/types.ts                    →   600 tokens
  5. grep "login" across codebase          →   700 tokens
  6. Read routes/login.ts                  → 1,100 tokens
  7. Read utils/jwt.ts                     →   900 tokens
  8. Read tests/auth.test.ts              → 1,400 tokens
  9. grep "validateToken"                  →   500 tokens
  10. Read middleware/validate.ts           → 1,000 tokens
  ─────────────────────────────────────────────────
  Total: 10 tool calls, ~9,700 tokens just to FIND the code
```

### With CodeXRay (same task)
```
You: "Fix the authentication bug in the login flow"

Claude Code:
  1. codexray_context("authentication login bug")
     → Returns all relevant symbols, code snippets,
       call relationships, and file locations
  ─────────────────────────────────────────────────
  Total: 1 tool call, ~2,000 tokens — ready to fix
```

**Result: 80% fewer tokens, 90% fewer tool calls to find relevant code.**

</details>

```
┌─────────────────────────────────────────────┐
│           Claude Code / Cursor              │
│                                             │
│   "Fix the authentication bug"              │
│           │                                 │
│    ┌──────▼──────┐   ┌──────────────┐       │
│    │ Explore Agent│───│ Explore Agent│       │
│    └──────┬───────┘   └──────┬──────┘       │
└───────────┼──────────────────┼──────────────┘
            │                  │
     ┌──────▼──────────────────▼──────┐
     │     CodeXRay MCP Server        │
     │                                │
     │  16 tools • TF-IDF search      │
     │  Call graph • Impact analysis   │
     │  Dead code • Circular deps     │
     │  Complexity • Path finding     │
     │                                │
     │       ┌─────────────┐          │
     │       │ SQLite Graph│          │
     │       │ + FTS5      │          │
     │       │ + TF-IDF    │          │
     │       └─────────────┘          │
     └────────────────────────────────┘
```

## Quick Start

### Any Package Manager

```bash
# Zero-install (recommended)
npx codexray

# npm
npm install -g codexray

# pnpm
pnpm add -g codexray

# yarn
yarn global add codexray

# bun
bun add -g codexray
```

### One-Command Setup for Claude Code

```bash
npx codexray
```

The interactive installer:
1. ✅ Configures the MCP server in `~/.claude.json`
2. ✅ Sets up auto-allow permissions for all 16 CodeXRay tools
3. ✅ Auto-detects Windows and applies `cmd /c` wrapping
4. ✅ Initializes and indexes your current project
5. ✅ Builds TF-IDF semantic search index
6. ✅ Writes `CLAUDE.md` with tool usage instructions
7. ✅ Installs git hooks for auto-sync

**Restart Claude Code** and it works automatically.

### Manual Setup

```bash
codexray init --index     # Initialize + index
cxr init -i               # Short alias
```

## Why CodeXRay?

- **Save money** — 30%+ fewer tokens means lower API costs
- **Faster responses** — AI agents find code instantly via graph queries instead of scanning files
- **Better accuracy** — semantic search understands *meaning*, not just keywords
- **Zero config** — `npx codexray` and done. No API keys, no cloud, no ML models to download
- **Lightweight** — ~50MB vs ~500MB for embedding-based alternatives
- **Private** — 100% local. Your code never leaves your machine

## How It Works

1. **Index** — Tree-sitter parses your code into ASTs, extracting every function, class, method, type, and their relationships into a SQLite graph with TF-IDF semantic index
2. **Query** — Claude Code queries the graph via 16 MCP tools instead of scanning files
3. **Sync** — Git hooks keep the index up-to-date on every commit

### Without CodeXRay
```
AI agent: "Fix auth bug" → grep → read file → grep → read file → read file → ...
         15+ tool calls just to FIND the relevant code
```

### With CodeXRay
```
AI agent: "Fix auth bug" → codexray_context("auth bug") → all relevant code + relationships
         1 tool call — immediately start fixing
```

## 16 MCP Tools

### Primary (use first)
| Tool | Description |
|------|-------------|
| `codexray_overview` | Project structure, languages, key symbols |
| `codexray_context` | Task-relevant context with code snippets |
| `codexray_search` | Find symbols by name/keyword (FTS5) |
| `codexray_semantic` | Find code by **meaning** (TF-IDF) |

### Exploration
| Tool | Description |
|------|-------------|
| `codexray_node` | Detailed symbol info + full source code |
| `codexray_callers` | Who calls this symbol? |
| `codexray_callees` | What does this symbol call? |
| `codexray_deps` | Full dependency tree |
| `codexray_path` | Shortest connection between two symbols |

### Analysis
| Tool | Description |
|------|-------------|
| `codexray_impact` | Blast radius (recursive BFS) |
| `codexray_hotspots` | Most connected/critical symbols |
| `codexray_deadcode` | Find unused functions/classes |
| `codexray_circular` | Detect circular dependencies |
| `codexray_complexity` | High cyclomatic complexity functions |
| `codexray_files` | Indexed file tree with stats |
| `codexray_status` | Index health check |

## CLI Reference

```bash
codexray                  # Interactive Claude Code installer
codexray install          # Same (explicit)
codexray init [path]      # Initialize project
  -i, --index             # Index immediately
  --no-hooks              # Skip git hook
  --claude-md             # Write CLAUDE.md
codexray index [path]     # Full index + semantic build
  -f, --force             # Force re-index
  -q, --quiet             # No output
codexray sync [path]      # Incremental sync
codexray watch [path]     # Real-time file watching
codexray status [path]    # Index statistics
codexray query <q>        # FTS5 search from CLI
codexray semantic <q>     # TF-IDF semantic search from CLI
codexray context <q>      # Build context from CLI
codexray overview [path]  # Project overview
codexray hooks <action>   # install/remove/status
codexray serve [path]     # Start MCP server (stdio)
codexray uninstall        # Remove from Claude Code
```

Short alias: **`cxr`** works for all commands.

## 15 Supported Languages

TypeScript, JavaScript, Python, Go, Rust, Java, C#, PHP, Ruby, C, C++, Swift, Kotlin — all parsed with tree-sitter for accurate AST extraction.

## Key Features

### 🧠 Semantic Search (TF-IDF)
Search "authentication" and find `login`, `validateToken`, `AuthService` — even with different naming. No API keys, no external services, no embeddings model to download. Pure local TF-IDF with camelCase/snake_case splitting, weighted by name/signature/docstring.

### 🔍 Smart Context Building
One `codexray_context` call replaces 5-10 file reads. Extracts keywords from your task description, finds matching symbols via FTS5 + TF-IDF, expands through the dependency graph, scores by relevance, and returns code snippets with call relationships.

### 💀 Dead Code Detection
`codexray_deadcode` finds functions, methods, and classes that are never called or referenced.

### 🔥 Hotspot Analysis
`codexray_hotspots` identifies the most connected symbols — highest callers + dependencies. These are riskiest to change.

### 💥 Blast Radius Analysis
`codexray_impact` uses BFS to trace all transitive callers, grouped by depth.

### 🔄 Circular Dependency Detection
`codexray_circular` uses DFS to find import/call cycles.

### 📐 Complexity Analysis
`codexray_complexity` finds functions exceeding a cyclomatic complexity threshold.

### 🛤️ Path Finding
`codexray_path` finds the shortest connection between any two symbols via BFS.

### 👁 Watch Mode
`codexray watch` uses chokidar for real-time index sync with 300ms debouncing.

### ⚡ Git Hooks
Post-commit hooks auto-sync the index. Zero maintenance.

### 🖥️ Cross-Platform
macOS, Linux, Windows. Windows gets automatic `cmd /c` wrapping.

## Library API

```typescript
import CodeXRay from 'codexray';

// Initialize and index
const cxr = await CodeXRay.init('/path/to/project', { index: true });

// FTS5 search
const results = cxr.search('UserService');

// Semantic search
const semantic = cxr.semanticSearch('user authentication flow');

// Call graph
const callers = cxr.getCallers(results[0].id);
const callees = cxr.getCallees(results[0].id);

// Path finding
const path = cxr.findPath(results[0].id, results[1].id);

// Impact analysis
const impact = cxr.getImpact(results[0].id);

// Smart context
const context = cxr.buildContext('fix login authentication bug');
console.log(cxr.formatContext(context));

// Analysis
const dead = cxr.findDeadCode();
const hotspots = cxr.findHotspots(10);
const cycles = cxr.findCircularDeps();
const complex = cxr.getComplexityReport(15);
const stats = cxr.getStats();

cxr.close();
```

## Configuration

`.codexray/config.json`:
```json
{
  "version": 1,
  "projectName": "my-app",
  "exclude": ["node_modules/**", "dist/**"],
  "maxFileSize": 1048576,
  "gitHooksEnabled": true
}
```

## Requirements

- **Node.js 18–24** (for native fetch, glob, ES2022)
- No API keys, no cloud services, no external databases
- 100% local — everything in `.codexray/graph.db`

## CodeXRay vs CodeGraph

| Feature | CodeGraph | CodeXRay |
|---------|-----------|----------|
| MCP tools | 7 | **16** |
| Semantic search | vector embeddings (needs transformers.js ~500MB) | **TF-IDF** (zero deps, instant) |
| Dead code detection | ❌ | ✅ |
| Hotspot analysis | ❌ | ✅ |
| Circular dependency detection | ❌ | ✅ |
| Complexity analysis | ❌ | ✅ |
| Path finding between symbols | ❌ | ✅ |
| Watch mode (real-time) | ❌ | ✅ |
| Project overview tool | ❌ | ✅ |
| File tree tool | ❌ | ✅ |
| Dependency tree tool | ❌ | ✅ |
| Framework detection (React) | ❌ | ✅ |
| Windows `cmd /c` auto-wrapping | ❌ | ✅ |
| `cxr` short alias | ❌ | ✅ |
| Uninstall command | ❌ | ✅ |
| Library API | ❌ | ✅ |
| Node.js requirement | 18+ | 18+ |
| Zero-config `npx` install | ✅ | ✅ |
| Languages | 13 | **15** |
| Install size | ~500MB (transformers.js) | **~50MB** |

## Contributors

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/NeuralRays">
        <img src="https://github.com/NeuralRays.png" width="80" style="border-radius:50%" alt="NeuralRays"/>
        <br />
        <sub><b>NeuralRays</b></sub>
      </a>
      <br />
      <sub>Creator & Maintainer</sub>
    </td>
    <td align="center">
      <a href="https://claude.ai">
        <img src="https://avatars.githubusercontent.com/u/76263028?s=200" width="80" style="border-radius:50%" alt="Claude"/>
        <br />
        <sub><b>Claude</b></sub>
      </a>
      <br />
      <sub>AI Pair Programmer</sub>
    </td>
  </tr>
</table>

## License

MIT

---

<p align="center">
  <a href="https://github.com/NeuralRays/codexray/issues"><b>Report a Bug</b></a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/NeuralRays/codexray/issues"><b>Request a Feature</b></a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/NeuralRays/codexray/pulls"><b>Submit a PR</b></a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/NeuralRays/codexray/discussions"><b>Discussions</b></a>
  &nbsp;&middot;&nbsp;
  <a href="https://www.npmjs.com/package/codexray"><b>npm Package</b></a>
</p>

<p align="center">
  If you find CodeXRay useful, please consider giving it a <a href="https://github.com/NeuralRays/codexray">star on GitHub</a>!
</p>
