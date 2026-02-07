import { GraphDatabase, NodeKind } from '../core/database';
import { Indexer } from '../core/indexer';
import { ContextBuilder } from '../core/context';
import { loadConfig, dbPath, isInitialized } from '../utils/config';
import path from 'path';
import fs from 'fs';

// ─── MCP Protocol Types ───────────────────────────────────────

interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: { code: number; message: string };
}

// ─── Tool Definitions ─────────────────────────────────────────

const TOOLS = [
  {
    name: 'codexray_search',
    description: 'Search for code symbols (functions, classes, methods, types, etc.) by name or keyword. Returns matching symbols with their locations, signatures, and export status. Use this as your FIRST tool when exploring unfamiliar code.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query — symbol name, keyword, or partial match' },
        kind: { type: 'string', description: 'Filter by kind: function, method, class, interface, type, enum, component, hook, struct, trait, variable, constant, route, middleware, test', enum: ['function', 'method', 'class', 'interface', 'type', 'enum', 'component', 'hook', 'struct', 'trait', 'variable', 'constant', 'route', 'middleware', 'test'] },
        limit: { type: 'number', description: 'Max results (default: 20)', default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'codexray_context',
    description: 'Build comprehensive task-relevant context for a coding task. Analyzes your query, finds relevant symbols, includes their code snippets, call relationships, and dependency info. This is the MOST POWERFUL tool — use it to understand code needed for a task instead of reading multiple files.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What you need context for, e.g. "user authentication flow" or "fix payment processing bug"' },
        maxNodes: { type: 'number', description: 'Max symbols to return (default: 25)', default: 25 },
        includeCode: { type: 'boolean', description: 'Include code snippets (default: true)', default: true },
        format: { type: 'string', description: 'Output format', enum: ['markdown', 'json', 'compact'], default: 'markdown' },
        fileFilter: { type: 'string', description: 'Only include symbols from files matching this string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'codexray_callers',
    description: 'Find all functions/methods that CALL the specified symbol. Essential for understanding usage patterns and impact before making changes.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name to find callers of' },
        file: { type: 'string', description: 'File path to disambiguate when multiple symbols share the same name' },
        limit: { type: 'number', description: 'Max results (default: 30)', default: 30 },
      },
      required: ['name'],
    },
  },
  {
    name: 'codexray_callees',
    description: 'Find all functions/methods that the specified symbol CALLS. Use to understand what a function depends on.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name to find callees of' },
        file: { type: 'string', description: 'File path to disambiguate when multiple symbols share the same name' },
        limit: { type: 'number', description: 'Max results (default: 30)', default: 30 },
      },
      required: ['name'],
    },
  },
  {
    name: 'codexray_impact',
    description: 'Analyze the blast radius of changing a symbol. Traces all callers/dependents recursively to show everything that could break. Use BEFORE making changes to critical code.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name to analyze impact of' },
        file: { type: 'string', description: 'File path to disambiguate when multiple symbols share the same name' },
        depth: { type: 'number', description: 'Max depth of impact analysis (default: 3)', default: 3 },
      },
      required: ['name'],
    },
  },
  {
    name: 'codexray_node',
    description: 'Get detailed info about a specific symbol including its full source code, signature, docstring, complexity, and position.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name' },
        kind: { type: 'string', description: 'Optional kind filter' },
        file: { type: 'string', description: 'File path to disambiguate when multiple symbols share the same name' },
        includeCode: { type: 'boolean', description: 'Include full source code (default: true)', default: true },
      },
      required: ['name'],
    },
  },
  {
    name: 'codexray_deps',
    description: 'Get the full dependency tree of a symbol — everything it imports, extends, implements, or uses. Use to understand what a symbol needs.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name' },
        file: { type: 'string', description: 'File path to disambiguate when multiple symbols share the same name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'codexray_overview',
    description: 'Get a high-level project overview including file count, languages, symbol distribution, key hotspot symbols, and directory structure. Use this FIRST when starting work on an unfamiliar project.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'codexray_deadcode',
    description: 'Find potentially unused/dead code — symbols that are never called or referenced by other symbols. Useful for cleanup tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        kinds: { type: 'array', items: { type: 'string' }, description: 'Symbol kinds to check (default: function, method, class)' },
        exportedOnly: { type: 'boolean', description: 'If false, only check non-exported symbols', default: false },
      },
    },
  },
  {
    name: 'codexray_hotspots',
    description: 'Find the most connected/critical symbols in the codebase — those with the highest number of callers and dependencies. These are the riskiest to change.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default: 20)', default: 20 },
      },
    },
  },
  {
    name: 'codexray_files',
    description: 'Get the indexed file tree with symbol counts per file. Use to understand project structure and find where code lives.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filter files by path substring' },
        language: { type: 'string', description: 'Filter by language' },
      },
    },
  },
  {
    name: 'codexray_status',
    description: 'Check the health and statistics of the CodeXRay index — total symbols, edges, files, languages, and index freshness.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'codexray_semantic',
    description: 'Find code by MEANING, not just name. Search "authentication" and find login, validateToken, AuthService — even with different naming conventions. Uses TF-IDF scoring across names, signatures, and docstrings.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language description of what you\'re looking for' },
        limit: { type: 'number', description: 'Max results (default: 20)', default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'codexray_path',
    description: 'Find the shortest connection path between two symbols in the dependency graph. Useful for understanding how two pieces of code are related.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source symbol name' },
        to: { type: 'string', description: 'Target symbol name' },
        fromFile: { type: 'string', description: 'File path to disambiguate source symbol' },
        toFile: { type: 'string', description: 'File path to disambiguate target symbol' },
        maxDepth: { type: 'number', description: 'Max search depth (default: 10)', default: 10 },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'codexray_circular',
    description: 'Detect circular dependencies in the codebase. Finds import/call cycles that can cause issues. Use for refactoring and dependency cleanup.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'codexray_complexity',
    description: 'Find the most complex functions/methods in the codebase by cyclomatic complexity score. High complexity = hard to maintain and test.',
    inputSchema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', description: 'Minimum complexity score (default: 10)', default: 10 },
      },
    },
  },
];

// ─── MCP Server ───────────────────────────────────────────────

export class MCPServer {
  private db: GraphDatabase | null = null;
  private indexer: Indexer | null = null;
  private context: ContextBuilder | null = null;
  private root: string;

  constructor(root?: string) {
    this.root = root || process.cwd();
  }

  private ensureDB(): boolean {
    if (this.db) return true;

    // Walk up to find .codexray directory
    let dir = this.root;
    while (dir !== path.dirname(dir)) {
      if (isInitialized(dir)) {
        this.root = dir;
        const config = loadConfig(dir);
        this.db = new GraphDatabase(dbPath(dir));
        this.indexer = new Indexer(this.db, dir, config);
        this.context = new ContextBuilder(this.db, dir);
        return true;
      }
      dir = path.dirname(dir);
    }
    return false;
  }

  /**
   * Resolve a symbol name to a single node, handling disambiguation.
   * Returns { node } on success, or { error } with a disambiguation list if ambiguous.
   */
  private resolveNode(name: string, file?: string, kind?: string): { node: import('../core/database').GraphNode } | { error: string } {
    // If file specified, use it directly
    if (file) {
      // Support partial file matching (e.g. "handler.ts" matches "src/auth/handler.ts")
      const allMatches = this.db!.getNodesByName(name, kind as NodeKind);
      const fileMatch = allMatches.find(n =>
        n.filePath === file || n.filePath.endsWith(file) || n.filePath.includes(file)
      );
      if (fileMatch) return { node: fileMatch };
      return { error: `Symbol "${name}" not found in file matching "${file}"` };
    }

    const matches = this.db!.getNodesByName(name, kind as NodeKind);
    if (matches.length === 0) return { error: `Symbol "${name}" not found` };
    if (matches.length === 1) return { node: matches[0] };

    // Multiple matches — check if they're in different files
    const uniqueFiles = new Set(matches.map(n => n.filePath));
    if (uniqueFiles.size === 1) return { node: matches[0] }; // same file, return first

    // Ambiguous — return disambiguation info
    const list = matches.map(n => `  - ${n.kind}: ${n.name} → ${n.filePath}:${n.startLine}`).join('\n');
    return {
      error: `⚠️ Ambiguous: "${name}" exists in ${uniqueFiles.size} files. Use the \`file\` parameter to specify which one:\n${list}`
    };
  }

  async start(): Promise<void> {
    let buffer = '';

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const request: MCPRequest = JSON.parse(line);
          const response = this.handleRequest(request);
          process.stdout.write(JSON.stringify(response) + '\n');
        } catch (err) {
          const errResponse: MCPResponse = {
            jsonrpc: '2.0', id: 0,
            error: { code: -32700, message: 'Parse error' },
          };
          process.stdout.write(JSON.stringify(errResponse) + '\n');
        }
      }
    });

    process.stdin.resume();
  }

  private handleRequest(req: MCPRequest): MCPResponse {
    try {
      switch (req.method) {
        case 'initialize':
          return this.respond(req.id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'codexray', version: '2.0.0' },
          });

        case 'notifications/initialized':
          return this.respond(req.id, {});

        case 'tools/list':
          return this.respond(req.id, { tools: TOOLS });

        case 'tools/call':
          return this.handleToolCall(req);

        case 'ping':
          return this.respond(req.id, {});

        default:
          return this.error(req.id, -32601, `Unknown method: ${req.method}`);
      }
    } catch (err: any) {
      return this.error(req.id, -32603, err.message || 'Internal error');
    }
  }

  private handleToolCall(req: MCPRequest): MCPResponse {
    const { name, arguments: args } = req.params || {};

    if (!this.ensureDB()) {
      return this.respond(req.id, {
        content: [{
          type: 'text',
          text: '⚠️ No CodeXRay index found. Run `codexray init --index` in your project first.',
        }],
      });
    }

    try {
      const result = this.executeTool(name, args || {});
      return this.respond(req.id, {
        content: [{ type: 'text', text: result }],
      });
    } catch (err: any) {
      return this.respond(req.id, {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      });
    }
  }

  private executeTool(name: string, args: any): string {
    switch (name) {
      case 'codexray_search': {
        const results = this.db!.searchNodes(args.query, args.kind as NodeKind, args.limit || 20);
        if (!results.length) return `No symbols found matching "${args.query}"`;
        return results.map(n =>
          `${n.exported ? '📦' : '  '} [${n.kind}] **${n.name}** — ${n.filePath}:${n.startLine}` +
          (n.signature ? `\n    ${n.signature.slice(0, 150)}` : '')
        ).join('\n');
      }

      case 'codexray_context': {
        const result = this.context!.build(args.query, {
          maxNodes: args.maxNodes, includeCode: args.includeCode ?? true,
          format: args.format, fileFilter: args.fileFilter,
        });
        return this.context!.format(result, args.format || 'markdown');
      }

      case 'codexray_callers': {
        const resolved = this.resolveNode(args.name, args.file);
        if ('error' in resolved) return resolved.error;
        const node = resolved.node;
        const callers = this.db!.getCallers(node.id, args.limit || 30);
        if (!callers.length) return `No callers found for "${args.name}" (${node.filePath}:${node.startLine})`;
        return `## Callers of ${node.name} [${node.kind}] — ${node.filePath}:${node.startLine}\n` +
          callers.map(c => `- ${c.node.qualifiedName} (${c.node.filePath}:${c.node.startLine})`).join('\n');
      }

      case 'codexray_callees': {
        const resolved = this.resolveNode(args.name, args.file);
        if ('error' in resolved) return resolved.error;
        const node = resolved.node;
        const callees = this.db!.getCallees(node.id, args.limit || 30);
        if (!callees.length) return `No callees found for "${args.name}" (${node.filePath}:${node.startLine})`;
        return `## Callees of ${node.name} [${node.kind}] — ${node.filePath}:${node.startLine}\n` +
          callees.map(c => `- ${c.node.qualifiedName} (${c.node.filePath}:${c.node.startLine})`).join('\n');
      }

      case 'codexray_impact': {
        const resolved = this.resolveNode(args.name, args.file);
        if ('error' in resolved) return resolved.error;
        const node = resolved.node;
        const impact = this.db!.getImpactRadius(node.id, args.depth || 3);
        if (!impact.size) return `No impact detected for "${args.name}" (${node.filePath}:${node.startLine}) — it may not be called by anything`;

        let out = `## Impact Analysis: ${node.name}\n`;
        out += `**${impact.size} symbols** could be affected by changes\n\n`;

        const byDepth = new Map<number, typeof impact extends Map<string, infer V> ? V[] : never>();
        for (const entry of impact.values()) {
          if (!byDepth.has(entry.depth)) byDepth.set(entry.depth, []);
          byDepth.get(entry.depth)!.push(entry);
        }

        for (const [depth, entries] of Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0])) {
          out += `### Depth ${depth} (${depth === 1 ? 'direct' : 'transitive'}) — ${entries.length} symbols\n`;
          for (const e of entries) {
            out += `- ${e.node.qualifiedName} (${e.node.filePath}:${e.node.startLine})\n`;
          }
        }
        return out;
      }

      case 'codexray_node': {
        const resolved = this.resolveNode(args.name, args.file, args.kind);
        if ('error' in resolved) return resolved.error;
        const node = resolved.node;

        let out = `## ${node.kind}: ${node.name}\n`;
        out += `**File:** ${node.filePath}:${node.startLine}-${node.endLine}\n`;
        out += `**Qualified:** ${node.qualifiedName}\n`;
        out += `**Exported:** ${node.exported ? 'yes' : 'no'}\n`;
        if (node.complexity) out += `**Complexity:** ${node.complexity}\n`;
        if (node.signature) out += `**Signature:** \`${node.signature}\`\n`;
        if (node.docstring) out += `**Docs:** ${node.docstring}\n`;

        // Children (for classes)
        const children = this.db!.getChildren(node.id);
        if (children.length) {
          out += `\n**Members:**\n`;
          for (const c of children) {
            out += `- ${c.kind}: ${c.name}`;
            if (c.signature) out += ` — ${c.signature.slice(0, 100)}`;
            out += '\n';
          }
        }

        if (args.includeCode !== false) {
          try {
            const fp = path.join(this.root, node.filePath);
            if (fs.existsSync(fp)) {
              const lines = fs.readFileSync(fp, 'utf-8').split('\n');
              const code = lines.slice(node.startLine - 1, node.endLine).join('\n');
              out += `\n\`\`\`${node.language}\n${code.slice(0, 3000)}\n\`\`\``;
            }
          } catch {}
        }
        return out;
      }

      case 'codexray_deps': {
        const resolved = this.resolveNode(args.name, args.file);
        if ('error' in resolved) return resolved.error;
        const node = resolved.node;
        const deps = this.db!.getDependencies(node.id);
        if (!deps.length) return `No dependencies found for "${args.name}" (${node.filePath}:${node.startLine})`;

        const grouped = new Map<string, typeof deps>();
        for (const d of deps) {
          if (!grouped.has(d.edgeKind)) grouped.set(d.edgeKind, []);
          grouped.get(d.edgeKind)!.push(d);
        }

        let out = `## Dependencies of ${node.name}\n`;
        for (const [kind, entries] of grouped) {
          out += `\n### ${kind} (${entries.length})\n`;
          for (const e of entries) {
            out += `- ${e.node.qualifiedName} (${e.node.filePath}:${e.node.startLine})\n`;
          }
        }
        return out;
      }

      case 'codexray_overview': {
        return this.context!.buildOverview();
      }

      case 'codexray_deadcode': {
        const dead = this.db!.findDeadCode({
          kinds: args.kinds as NodeKind[],
          exportedOnly: args.exportedOnly,
        });
        if (!dead.length) return 'No potentially dead code found.';

        let out = `## Potentially Dead Code (${dead.length} symbols)\n\n`;
        const grouped = new Map<string, typeof dead>();
        for (const n of dead) {
          if (!grouped.has(n.filePath)) grouped.set(n.filePath, []);
          grouped.get(n.filePath)!.push(n);
        }
        for (const [file, nodes] of grouped) {
          out += `### ${file}\n`;
          for (const n of nodes) {
            out += `- ${n.kind}: ${n.name} (L${n.startLine})`;
            if (n.exported) out += ' ⚠️ exported but unused';
            out += '\n';
          }
        }
        return out;
      }

      case 'codexray_hotspots': {
        const hot = this.db!.findHotspots(args.limit || 20);
        if (!hot.length) return 'No hotspots found.';

        let out = `## Code Hotspots (most connected symbols)\n\n`;
        out += `| Symbol | Kind | File | Callers | Deps | Total |\n|---|---|---|---|---|---|\n`;
        for (const h of hot) {
          out += `| ${h.node.name} | ${h.node.kind} | ${h.node.filePath}:${h.node.startLine} | ${h.inDegree} | ${h.outDegree} | ${h.totalDegree} |\n`;
        }
        return out;
      }

      case 'codexray_files': {
        let tree = this.db!.getFileTree();
        if (args.filter) tree = tree.filter(f => f.path.includes(args.filter));
        if (args.language) tree = tree.filter(f => f.language === args.language);
        if (!tree.length) return 'No matching files.';

        return tree.map(f =>
          `${f.path} (${f.language}, ${f.nodeCount} symbols, ${f.lineCount} lines)`
        ).join('\n');
      }

      case 'codexray_status': {
        const stats = this.db!.getStats();
        return [
          `# CodeXRay Index Status`,
          ``,
          `**Root:** ${this.root}`,
          `**Files:** ${stats.totalFiles}`,
          `**Symbols:** ${stats.totalNodes}`,
          `**Edges:** ${stats.totalEdges}`,
          `**Lines:** ${stats.totalLines}`,
          ``,
          `**By Language:** ${Object.entries(stats.filesByLanguage).map(([l, c]) => `${l}: ${c}`).join(', ')}`,
          `**By Kind:** ${Object.entries(stats.nodesByKind).map(([k, c]) => `${k}: ${c}`).join(', ')}`,
          `**By Edge:** ${Object.entries(stats.edgesByKind).map(([k, c]) => `${k}: ${c}`).join(', ')}`,
        ].join('\n');
      }

      case 'codexray_semantic': {
        const results = this.db!.semanticSearch(args.query, args.limit || 20);
        if (!results.length) return `No semantic matches for "${args.query}". Try codexray_search for exact name matching.`;
        return `## Semantic Search: "${args.query}" (${results.length} results)\n\n` +
          results.map((r, i) =>
            `${i + 1}. ${r.node.exported ? '📦 ' : ''}**${r.node.name}** [${r.node.kind}] — ${r.node.filePath}:${r.node.startLine}` +
            (r.node.signature ? `\n   ${r.node.signature.slice(0, 150)}` : '') +
            `\n   Score: ${r.score.toFixed(2)}`
          ).join('\n\n');
      }

      case 'codexray_path': {
        const fromResolved = this.resolveNode(args.from, args.fromFile);
        if ('error' in fromResolved) return fromResolved.error;
        const toResolved = this.resolveNode(args.to, args.toFile);
        if ('error' in toResolved) return toResolved.error;
        const fromNode = fromResolved.node;
        const toNode = toResolved.node;

        const pathNodes = this.db!.findPath(fromNode.id, toNode.id, args.maxDepth || 10);
        if (!pathNodes || pathNodes.length === 0) return `No connection found between "${args.from}" and "${args.to}" within depth ${args.maxDepth || 10}`;

        let out = `## Path: ${fromNode.name} → ${toNode.name} (${pathNodes.length} hops)\n\n`;
        for (let i = 0; i < pathNodes.length; i++) {
          const n = pathNodes[i];
          out += `${i + 1}. **${n.name}** [${n.kind}] — ${n.filePath}:${n.startLine}`;
          if (i < pathNodes.length - 1) out += `\n   ↓`;
          out += '\n';
        }
        return out;
      }

      case 'codexray_circular': {
        const cycles = this.db!.findCircularDeps();
        if (!cycles.length) return 'No circular dependencies detected. 🎉';

        let out = `## Circular Dependencies (${cycles.length} found)\n\n`;
        for (let i = 0; i < cycles.length; i++) {
          const c = cycles[i];
          out += `### Cycle ${i + 1} (via ${c.via})\n`;
          out += c.cycle.map(n => `  ${n.name} (${n.filePath}:${n.startLine})`).join(' → ') + '\n\n';
        }
        return out;
      }

      case 'codexray_complexity': {
        const complex = this.db!.getComplexityReport(args.threshold || 10);
        if (!complex.length) return `No functions exceed complexity threshold ${args.threshold || 10}.`;

        let out = `## High Complexity Functions (threshold: ${args.threshold || 10})\n\n`;
        out += `| Function | Kind | File | Complexity |\n|---|---|---|---|\n`;
        for (const n of complex) {
          out += `| ${n.name} | ${n.kind} | ${n.filePath}:${n.startLine} | ${n.complexity} |\n`;
        }
        return out;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  }

  private respond(id: number | string, result: any): MCPResponse {
    return { jsonrpc: '2.0', id, result };
  }

  private error(id: number | string, code: number, message: string): MCPResponse {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }
}

// ─── Convenience export for CLI ──────────────────────────────

export async function startMCPServer(root?: string): Promise<void> {
  const server = new MCPServer(root);
  await server.start();
}
