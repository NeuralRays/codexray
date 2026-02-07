# CodeXRay Documentation

## Table of Contents

1. [Installation](#installation)
2. [Claude Code Integration](#claude-code-integration)
3. [Architecture](#architecture)
4. [MCP Tools Reference](#mcp-tools-reference)
5. [CLI Reference](#cli-reference)
6. [Library API](#library-api)
7. [Configuration](#configuration)
8. [Supported Languages](#supported-languages)
9. [How Indexing Works](#how-indexing-works)
10. [Semantic Search](#semantic-search)
11. [Git Integration](#git-integration)
12. [Troubleshooting](#troubleshooting)

---

## Installation

CodeXRay works with every major JavaScript package manager and runtime.

### npm (recommended)
```bash
npx codexray              # Zero-install, runs interactive installer
npm install -g codexray   # Global install
```

### pnpm
```bash
pnpm add -g codexray
pnpm dlx codexray         # Zero-install equivalent
```

### yarn
```bash
yarn global add codexray
```

### bun
```bash
bun add -g codexray
bunx codexray             # Zero-install equivalent
```

### Requirements

Node.js ≥ 18.0.0 is required. CodeXRay uses native tree-sitter bindings, `glob` v11, `fs.promises`, and ES2022 features that require Node 18+.

To check your version: `node -v`

---

## Claude Code Integration

### How It Works

CodeXRay runs as an MCP (Model Context Protocol) server. When Claude Code starts, it launches the CodeXRay server as a subprocess. Claude's explore agents can then call CodeXRay tools directly to query the code graph instead of scanning files.

### Automatic Setup

```bash
npx codexray
```

This interactive installer:

1. **Writes `~/.claude.json`** — adds the `codexray` MCP server entry
2. **Sets auto-allow permissions** — all 16 tools are pre-approved so Claude never asks for permission
3. **Handles Windows** — automatically wraps `npx` in `cmd /c` on Windows
4. **Project init** — optionally initializes `.codexray/` and indexes the current project
5. **CLAUDE.md** — optionally writes tool usage instructions for Claude

### Manual Setup

If you prefer to configure manually, add this to `~/.claude.json`:

```json
{
  "mcpServers": {
    "codexray": {
      "command": "npx",
      "args": ["-y", "codexray", "serve"]
    }
  },
  "autoAllowPermissions": [
    "mcp__codexray__codexray_search",
    "mcp__codexray__codexray_context",
    "mcp__codexray__codexray_callers",
    "mcp__codexray__codexray_callees",
    "mcp__codexray__codexray_impact",
    "mcp__codexray__codexray_node",
    "mcp__codexray__codexray_deps",
    "mcp__codexray__codexray_overview",
    "mcp__codexray__codexray_deadcode",
    "mcp__codexray__codexray_hotspots",
    "mcp__codexray__codexray_files",
    "mcp__codexray__codexray_status",
    "mcp__codexray__codexray_semantic",
    "mcp__codexray__codexray_path",
    "mcp__codexray__codexray_circular",
    "mcp__codexray__codexray_complexity"
  ]
}
```

On Windows, use `cmd /c` wrapping:
```json
{
  "mcpServers": {
    "codexray": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "codexray", "serve"]
    }
  }
}
```

After adding the config, **restart Claude Code** for the MCP server to load.

### Using with Other MCP Clients

CodeXRay works with any MCP client (Cursor, Windsurf, etc.) that supports stdio-based MCP servers. The command to start the server is:

```bash
codexray serve [path]
```

---

## Architecture

```
codexray/
├── src/
│   ├── core/
│   │   ├── database.ts     # SQLite graph engine, TF-IDF, FTS5
│   │   ├── indexer.ts       # File discovery, parsing, watch mode
│   │   └── context.ts       # Smart context builder with scoring
│   ├── parsers/
│   │   ├── registry.ts      # Language detection, tree-sitter loading
│   │   └── extractor.ts     # AST → symbols + edges extraction
│   ├── mcp/
│   │   └── server.ts        # MCP protocol server with 16 tools
│   ├── cli/
│   │   └── index.ts         # CLI + Claude Code installer
│   ├── utils/
│   │   └── config.ts        # Config, git hooks, gitignore
│   └── index.ts             # Public library API
```

### Data Flow

```
Source Files → tree-sitter AST → Symbol Extraction → SQLite Graph
                                                         │
                                        ┌────────────────┼────────────────┐
                                        ▼                ▼                ▼
                                   FTS5 Index      TF-IDF Index     Graph Edges
                                   (keyword)       (semantic)       (calls, imports)
```

### Database Schema

**nodes** — every extracted symbol (function, class, method, etc.)
- `id`, `kind`, `name`, `qualified_name`, `file_path`, `start_line`, `end_line`
- `language`, `signature`, `docstring`, `exported`, `complexity`

**edges** — relationships between symbols
- `source_id → target_id`, `kind` (calls, imports, extends, implements, etc.)

**files** — indexed file tracking for incremental sync
- `file_path`, `hash`, `language`, `node_count`, `line_count`

**search_tokens** — TF-IDF index for semantic search
- `node_id`, `token`, `tf` (term frequency), `source` (name/signature/docstring)

**idf_cache** — inverse document frequency cache
- `token`, `idf`, `doc_count`

**nodes_fts** — FTS5 virtual table for keyword search

---

## MCP Tools Reference

### codexray_overview
Get a high-level project overview. **Use this first when starting work on any project.**

Returns: file count, languages, symbol distribution, directory structure, hotspot symbols.

### codexray_context
Build comprehensive task-relevant context. **The most powerful tool — replaces reading multiple files.**

Parameters:
- `query` (required) — task description, e.g. "fix authentication bug"
- `maxNodes` — max symbols to return (default: 25)
- `includeCode` — include source code snippets (default: true)
- `format` — `markdown`, `json`, or `compact`
- `fileFilter` — only include files matching this string

### codexray_search
FTS5 keyword search for symbols by name.

Parameters:
- `query` (required) — symbol name or keyword
- `kind` — filter by kind (function, class, method, etc.)
- `limit` — max results (default: 20)

### codexray_semantic
TF-IDF semantic search — find code by **meaning**, not just name.

Parameters:
- `query` (required) — natural language description
- `limit` — max results (default: 20)

Example: Search "user authentication" and find `login()`, `validateToken()`, `AuthService`.

### codexray_node
Get detailed info about a specific symbol including full source code.

Parameters:
- `name` (required) — symbol name
- `kind` — optional kind filter
- `includeCode` — include source (default: true)

### codexray_callers
Find all functions/methods that CALL the specified symbol.

Parameters:
- `name` (required) — symbol name
- `limit` — max results (default: 30)

### codexray_callees
Find all functions/methods that the specified symbol CALLS.

Parameters:
- `name` (required) — symbol name
- `limit` — max results (default: 30)

### codexray_deps
Get the full dependency tree — everything a symbol imports, extends, implements, or uses.

Parameters:
- `name` (required) — symbol name

### codexray_impact
Blast radius analysis — recursive BFS tracing all transitive callers, grouped by depth.

Parameters:
- `name` (required) — symbol name
- `depth` — max BFS depth (default: 3)

### codexray_path
Find the shortest connection between two symbols in the graph.

Parameters:
- `from` (required) — source symbol name
- `to` (required) — target symbol name
- `maxDepth` — max search depth (default: 10)

### codexray_hotspots
Rank symbols by total connectivity (callers + dependencies).

Parameters:
- `limit` — max results (default: 20)

### codexray_deadcode
Find unreferenced symbols — functions/classes never called or imported.

Parameters:
- `kinds` — symbol kinds to check (default: function, method, class)
- `exportedOnly` — if false, only check non-exported symbols

### codexray_circular
Detect circular import/call dependencies using DFS.

No parameters. Returns all detected cycles up to 20.

### codexray_complexity
Find functions exceeding a cyclomatic complexity threshold.

Parameters:
- `threshold` — minimum complexity score (default: 10)

### codexray_files
Browse the indexed file tree with per-file symbol counts.

Parameters:
- `filter` — filter by path substring
- `language` — filter by language

### codexray_status
Index health check — total files, symbols, edges, languages, freshness.

---

## CLI Reference

### Commands

| Command | Description |
|---------|-------------|
| `codexray` | Interactive Claude Code installer |
| `codexray install` | Same as above (explicit) |
| `codexray init [path]` | Initialize project |
| `codexray index [path]` | Full index + semantic build |
| `codexray sync [path]` | Incremental sync |
| `codexray watch [path]` | Real-time file watching |
| `codexray status [path]` | Index statistics |
| `codexray query <q>` | FTS5 search from CLI |
| `codexray semantic <q>` | TF-IDF semantic search |
| `codexray context <q>` | Build task context |
| `codexray overview [path]` | Project overview |
| `codexray hooks <action>` | Git hook management |
| `codexray serve [path]` | Start MCP server |
| `codexray uninstall` | Remove from Claude Code |

### Short Alias

`cxr` works for all commands: `cxr init -i`, `cxr status`, `cxr query auth`, etc.

---

## Library API

```typescript
import CodeXRay from 'codexray';

// Initialize
const cxr = await CodeXRay.init('/path/to/project', { index: true });

// Or open existing
const cxr = CodeXRay.open('/path/to/project');

// Search
cxr.search(query, kind?, limit?)       // FTS5 keyword search
cxr.semanticSearch(query, limit?)       // TF-IDF semantic search

// Graph traversal
cxr.getCallers(nodeId)                  // Who calls this?
cxr.getCallees(nodeId)                  // What does this call?
cxr.getDependencies(nodeId)             // Full dep tree
cxr.getImpact(nodeId, depth?)           // Blast radius
cxr.findPath(fromId, toId)              // Shortest path

// Analysis
cxr.findDeadCode(kinds?)                // Unreferenced symbols
cxr.findHotspots(limit?)                // Most connected
cxr.findCircularDeps()                  // Circular imports
cxr.getComplexityReport(threshold?)     // High complexity
cxr.getStats()                          // Index statistics

// Context
cxr.buildContext(query, opts?)           // Smart context
cxr.formatContext(result, format?)       // Format output
cxr.buildOverview()                     // Project overview

// Index management
await cxr.index(force?)                 // Full index
await cxr.sync()                        // Incremental sync

// Cleanup
cxr.close()
```

---

## Configuration

### `.codexray/config.json`

```json
{
  "version": 1,
  "projectName": "my-app",
  "exclude": [
    "node_modules/**", "dist/**", "build/**", ".git/**",
    "*.min.js", "*.bundle.js", "*.lock", "*.map"
  ],
  "maxFileSize": 1048576,
  "gitHooksEnabled": true
}
```

### Options

| Field | Default | Description |
|-------|---------|-------------|
| `exclude` | common patterns | Glob patterns to exclude |
| `maxFileSize` | 1048576 (1MB) | Skip files larger than this |
| `gitHooksEnabled` | false | Enable post-commit auto-sync |

---

## Supported Languages

| Language | Extensions | Parser |
|----------|-----------|--------|
| TypeScript | `.ts`, `.tsx` | tree-sitter-typescript |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | tree-sitter-javascript |
| Python | `.py`, `.pyw` | tree-sitter-python |
| Go | `.go` | tree-sitter-go |
| Rust | `.rs` | tree-sitter-rust |
| Java | `.java` | tree-sitter-java |
| C# | `.cs` | tree-sitter-c-sharp |
| PHP | `.php` | tree-sitter-php |
| Ruby | `.rb` | tree-sitter-ruby |
| C | `.c`, `.h` | tree-sitter-c |
| C++ | `.cpp`, `.hpp`, `.cc`, `.cxx` | tree-sitter-cpp |
| Swift | `.swift` | tree-sitter-swift |
| Kotlin | `.kt`, `.kts` | tree-sitter-kotlin |

### Extracted Symbol Types

Functions, methods, classes, interfaces, types, enums, structs, traits, variables, constants, modules, namespaces, React components, React hooks, routes, middleware, tests, decorators, properties.

### Extracted Edge Types

calls, imports, extends, implements, returns_type, uses_type, has_method, has_property, contains, exports, renders, decorates, overrides, tests.

---

## How Indexing Works

### Full Index (`codexray index`)

1. **Scan** — discover all source files matching supported extensions, excluding configured patterns
2. **Hash** — compute SHA-256 hash for each file to detect changes
3. **Parse** — tree-sitter parses each file into an AST
4. **Extract** — walk AST to find symbols (functions, classes, etc.) and references (calls, imports)
5. **Store** — upsert nodes and intra-file edges into SQLite
6. **Resolve** — match cross-file references to their target symbols (import → definition, call → function)
7. **TF-IDF** — build semantic search index from symbol names, signatures, and docstrings

### Incremental Sync (`codexray sync`)

1. Compare file hashes with stored values
2. Re-parse only added/modified files
3. Remove symbols from deleted files
4. Re-resolve cross-file references
5. Rebuild TF-IDF index

### Watch Mode (`codexray watch`)

Uses chokidar with 300ms debouncing to detect file changes and trigger incremental sync in real-time.

---

## Semantic Search

CodeXRay implements TF-IDF (Term Frequency × Inverse Document Frequency) for semantic code search with zero external dependencies.

### How It Works

1. **Tokenization** — splits camelCase, snake_case, dot.notation into individual words
2. **Term Frequency (TF)** — how often a token appears in a symbol's name/signature/docstring
3. **Inverse Document Frequency (IDF)** — how rare a token is across all symbols
4. **Weighted Scoring** — name matches score 4x, signature 2x, docstring 1.5x, qualified name 1x
5. **Stop Words** — common programming keywords filtered out

### Why TF-IDF Instead of Vector Embeddings?

- **Zero dependencies** — no transformers.js (~500MB), no ONNX runtime, no model downloads
- **Instant build** — builds in <1 second for most projects vs minutes for embedding generation
- **Deterministic** — same query always returns same results
- **No GPU needed** — runs on any machine
- **Sufficient quality** — for code symbol search, TF-IDF with domain-aware tokenization performs comparably to embeddings

---

## Git Integration

### Post-Commit Hook

```bash
codexray hooks install    # Install hook
codexray hooks remove     # Remove hook
codexray hooks status     # Check status
```

The hook runs `codexray sync` in the background after each commit, keeping the index fresh without blocking your workflow.

### .gitignore

CodeXRay automatically adds `.codexray/` to your `.gitignore` during init. The database is local to each developer's machine.

---

## Troubleshooting

### MCP server not loading in Claude Code

1. Verify `~/.claude.json` contains the `codexray` entry: `cat ~/.claude.json`
2. Fully restart Claude Code (quit and reopen, not just new conversation)
3. On Windows, ensure `cmd /c` wrapping is present in the args

### "Not initialized" error

Run `codexray init --index` in your project directory to create `.codexray/`.

### tree-sitter build fails

tree-sitter uses native bindings that need compilation:
```bash
npm rebuild tree-sitter
```

If that fails, ensure you have build tools installed:
- macOS: `xcode-select --install`
- Ubuntu: `apt install build-essential`
- Windows: `npm install -g windows-build-tools`

### Index seems stale

```bash
codexray index --force    # Force full re-index
codexray hooks install    # Enable auto-sync
```

### Large projects are slow to index

Increase the exclude patterns in `.codexray/config.json` to skip generated code, vendored dependencies, etc.

### Claude Code doesn't use CodeXRay tools

Ensure `CLAUDE.md` exists in your project root with CodeXRay instructions:
```bash
codexray init --claude-md
```

This tells Claude's agents to prefer CodeXRay tools over file scanning.
