import fs from 'fs';
import path from 'path';
import { GraphDatabase, GraphNode, NodeKind } from './database';

export interface ContextOptions {
  maxNodes?: number;
  maxCodeLength?: number;
  includeCode?: boolean;
  includeGraph?: boolean;
  format?: 'markdown' | 'json' | 'compact';
  kinds?: NodeKind[];
  fileFilter?: string;
}

export interface ContextResult {
  query: string;
  nodes: ScoredNode[];
  stats: { searched: number; returned: number; filesSpanned: number };
}

interface ScoredNode {
  node: GraphNode;
  score: number;
  code?: string;
  callers?: string[];
  callees?: string[];
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'it',
  'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him',
  'she', 'her', 'they', 'them', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'whom', 'whose',
  'fix', 'add', 'create', 'make', 'build', 'implement', 'change',
  'update', 'modify', 'write', 'code', 'file', 'files', 'function',
  'class', 'method', 'get', 'set', 'new', 'use', 'using',
]);

export class ContextBuilder {
  private db: GraphDatabase;
  private root: string;

  constructor(db: GraphDatabase, root: string) {
    this.db = db;
    this.root = root;
  }

  build(query: string, opts: ContextOptions = {}): ContextResult {
    const {
      maxNodes = 25, maxCodeLength = 500, includeCode = true,
      includeGraph = true, kinds, fileFilter,
    } = opts;

    const keywords = this.extractKeywords(query);
    if (!keywords.length) {
      return { query, nodes: [], stats: { searched: 0, returned: 0, filesSpanned: 0 } };
    }

    // Phase 1: Search for matching nodes
    let candidates = new Map<string, { node: GraphNode; score: number }>();

    for (const kw of keywords) {
      const results = this.db.searchNodes(kw, undefined, 50);
      for (const node of results) {
        if (kinds && !kinds.includes(node.kind)) continue;
        if (fileFilter && !node.filePath.includes(fileFilter)) continue;

        const existing = candidates.get(node.id);
        const score = this.scoreNode(node, keywords);
        if (!existing || score > existing.score) {
          candidates.set(node.id, { node, score });
        }
      }
    }

    // Phase 2: Graph expansion — add related nodes
    if (includeGraph) {
      const topCandidates = Array.from(candidates.values())
        .sort((a, b) => b.score - a.score).slice(0, 10);

      for (const { node } of topCandidates) {
        // Add callers and callees with reduced score
        for (const { node: dep } of this.db.getDependencies(node.id)) {
          if (!candidates.has(dep.id)) {
            candidates.set(dep.id, { node: dep, score: 0.5 });
          }
        }
        for (const { node: caller } of this.db.getDependents(node.id)) {
          if (!candidates.has(caller.id)) {
            candidates.set(caller.id, { node: caller, score: 0.4 });
          }
        }
      }
    }

    // Phase 3: Sort by score and limit
    const sorted = Array.from(candidates.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxNodes);

    // Phase 4: Enrich with code snippets and graph info
    const enriched: ScoredNode[] = sorted.map(({ node, score }) => {
      const result: ScoredNode = { node, score };

      if (includeCode) {
        result.code = this.getCodeSnippet(node, maxCodeLength);
      }

      if (includeGraph) {
        result.callers = this.db.getCallers(node.id, 5).map(c => c.node.qualifiedName);
        result.callees = this.db.getCallees(node.id, 5).map(c => c.node.qualifiedName);
      }

      return result;
    });

    const files = new Set(enriched.map(n => n.node.filePath));
    return {
      query,
      nodes: enriched,
      stats: { searched: candidates.size, returned: enriched.length, filesSpanned: files.size },
    };
  }

  format(result: ContextResult, fmt: 'markdown' | 'json' | 'compact' = 'markdown'): string {
    if (fmt === 'json') return JSON.stringify(result, null, 2);
    if (fmt === 'compact') return this.formatCompact(result);
    return this.formatMarkdown(result);
  }

  // ─── Project Overview ────────────────────────────────────────

  buildOverview(): string {
    const stats = this.db.getStats();
    const tree = this.db.getFileTree();
    const hotspots = this.db.findHotspots(10);

    const langSummary = Object.entries(stats.filesByLanguage)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `${lang}: ${count} files`)
      .join(', ');

    const kindSummary = Object.entries(stats.nodesByKind)
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => `${count} ${kind}s`)
      .join(', ');

    let out = `# Project Overview\n\n`;
    out += `**${stats.totalFiles}** files, **${stats.totalNodes}** symbols, **${stats.totalEdges}** relationships, **${stats.totalLines}** lines\n\n`;
    out += `**Languages:** ${langSummary}\n`;
    out += `**Symbols:** ${kindSummary}\n\n`;

    if (hotspots.length > 0) {
      out += `## Key Symbols (highest connectivity)\n`;
      for (const h of hotspots) {
        out += `- **${h.node.qualifiedName}** (${h.node.kind}) — ${h.inDegree} callers, ${h.outDegree} deps\n`;
      }
      out += '\n';
    }

    // Group files by directory
    const dirs = new Map<string, typeof tree>();
    for (const f of tree) {
      const dir = path.dirname(f.path);
      if (!dirs.has(dir)) dirs.set(dir, []);
      dirs.get(dir)!.push(f);
    }

    out += `## File Structure\n`;
    for (const [dir, files] of Array.from(dirs.entries()).sort()) {
      const totalNodes = files.reduce((s, f) => s + f.nodeCount, 0);
      out += `📁 ${dir}/ (${files.length} files, ${totalNodes} symbols)\n`;
    }

    return out;
  }

  // ─── Scoring ─────────────────────────────────────────────────

  private scoreNode(node: GraphNode, keywords: string[]): number {
    let score = 0;
    const name = node.name.toLowerCase();
    const qual = node.qualifiedName.toLowerCase();
    const sig = (node.signature || '').toLowerCase();
    const doc = (node.docstring || '').toLowerCase();

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      if (name === kwLower) score += 10;
      else if (name.includes(kwLower)) score += 5;

      if (qual.includes(kwLower)) score += 3;
      if (sig.includes(kwLower)) score += 2;
      if (doc.includes(kwLower)) score += 2;
    }

    // Boost exported symbols
    if (node.exported) score += 2;

    // Boost certain kinds
    if (['class', 'interface', 'component'].includes(node.kind)) score += 1;

    // Slight boost for entry-point-like names
    if (/^(main|index|app|server|handler|controller|route|api)/i.test(name)) score += 1;

    return score;
  }

  private extractKeywords(query: string): string[] {
    // Split camelCase and snake_case
    const expanded = query.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return expanded.toLowerCase()
      .split(/[\s,;:.!?/\\]+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w))
      .filter((w, i, arr) => arr.indexOf(w) === i);
  }

  private getCodeSnippet(node: GraphNode, maxLen: number): string | undefined {
    try {
      const fp = path.join(this.root, node.filePath);
      if (!fs.existsSync(fp)) return undefined;
      const lines = fs.readFileSync(fp, 'utf-8').split('\n');
      const start = Math.max(0, node.startLine - 1);
      const end = Math.min(lines.length, node.endLine);
      const snippet = lines.slice(start, end).join('\n');
      return snippet.length > maxLen ? snippet.slice(0, maxLen) + '\n// ... truncated' : snippet;
    } catch { return undefined; }
  }

  // ─── Formatters ──────────────────────────────────────────────

  private formatMarkdown(result: ContextResult): string {
    let out = `# Context: "${result.query}"\n`;
    out += `Found ${result.stats.returned} symbols across ${result.stats.filesSpanned} files\n\n`;

    const grouped = new Map<string, ScoredNode[]>();
    for (const sn of result.nodes) {
      if (!grouped.has(sn.node.filePath)) grouped.set(sn.node.filePath, []);
      grouped.get(sn.node.filePath)!.push(sn);
    }

    for (const [file, nodes] of grouped) {
      out += `## ${file}\n`;
      for (const sn of nodes) {
        out += `### ${sn.node.kind}: ${sn.node.name}`;
        if (sn.node.exported) out += ' (exported)';
        out += ` [L${sn.node.startLine}-${sn.node.endLine}]\n`;
        if (sn.node.signature) out += `**Signature:** \`${sn.node.signature}\`\n`;
        if (sn.node.docstring) out += `> ${sn.node.docstring.slice(0, 200)}\n`;
        if (sn.callers?.length) out += `**Called by:** ${sn.callers.join(', ')}\n`;
        if (sn.callees?.length) out += `**Calls:** ${sn.callees.join(', ')}\n`;
        if (sn.code) out += `\`\`\`\n${sn.code}\n\`\`\`\n`;
        out += '\n';
      }
    }
    return out;
  }

  private formatCompact(result: ContextResult): string {
    return result.nodes.map(sn => {
      let line = `[${sn.node.kind}] ${sn.node.qualifiedName} (${sn.node.filePath}:${sn.node.startLine})`;
      if (sn.node.signature) line += ` — ${sn.node.signature.slice(0, 120)}`;
      return line;
    }).join('\n');
  }
}
