import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { glob } from 'glob';
import { GraphDatabase, GraphEdge } from './database';
import { SymbolExtractor } from '../parsers/extractor';
import { detectLanguage, allExtensions } from '../parsers/registry';
import { CodeXRayConfig } from '../utils/config';

export interface IndexProgress {
  phase: 'scanning' | 'parsing' | 'resolving' | 'done';
  current: number;
  total: number;
  file?: string;
}

export interface IndexResult {
  filesIndexed: number;
  nodesCreated: number;
  edgesCreated: number;
  errors: { file: string; error: string }[];
  durationMs: number;
}

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  durationMs: number;
}

export class Indexer {
  private db: GraphDatabase;
  private extractor: SymbolExtractor;
  private config: CodeXRayConfig;
  private root: string;

  constructor(db: GraphDatabase, root: string, config: CodeXRayConfig) {
    this.db = db;
    this.extractor = new SymbolExtractor();
    this.config = config;
    this.root = root;
  }

  async indexAll(opts: { force?: boolean; onProgress?: (p: IndexProgress) => void } = {}): Promise<IndexResult> {
    const t0 = Date.now();
    const errors: { file: string; error: string }[] = [];
    let nodesCreated = 0, edgesCreated = 0;
    const progress = opts.onProgress || (() => {});

    progress({ phase: 'scanning', current: 0, total: 0 });
    const files = await this.discoverFiles();
    progress({ phase: 'scanning', current: files.length, total: files.length });

    if (opts.force) this.db.reset();

    const allUnresolved: any[] = [];

    for (let i = 0; i < files.length; i++) {
      const fp = files[i];
      const rel = path.relative(this.root, fp);
      progress({ phase: 'parsing', current: i + 1, total: files.length, file: rel });

      try {
        const content = fs.readFileSync(fp, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

        if (!opts.force) {
          const existing = this.db.getFile(rel);
          if (existing && existing.hash === hash) continue;
        }

        const lang = detectLanguage(fp);
        if (!lang) continue;

        this.db.deleteEdgesByFile(rel);
        this.db.deleteNodesByFile(rel);

        const result = this.extractor.extract(content, rel, lang);
        this.db.upsertNodes(result.nodes);
        this.db.upsertEdges(result.edges);
        nodesCreated += result.nodes.length;
        edgesCreated += result.edges.length;
        allUnresolved.push(...result.unresolvedRefs);

        this.db.upsertFile({
          filePath: rel, hash, language: lang.name,
          indexedAt: new Date().toISOString(),
          nodeCount: result.nodes.length,
          lineCount: content.split('\n').length,
        });
      } catch (err: any) {
        errors.push({ file: rel, error: err.message || String(err) });
      }
    }

    // Resolve cross-file references
    progress({ phase: 'resolving', current: 0, total: allUnresolved.length });
    const resolved = this.resolveRefs(allUnresolved);
    this.db.upsertEdges(resolved);
    edgesCreated += resolved.length;

    progress({ phase: 'done', current: files.length, total: files.length });
    return { filesIndexed: files.length, nodesCreated, edgesCreated, errors, durationMs: Date.now() - t0 };
  }

  async sync(onProgress?: (p: IndexProgress) => void): Promise<SyncResult> {
    const t0 = Date.now();
    let added = 0, modified = 0, removed = 0;

    const current = new Set((await this.discoverFiles()).map(f => path.relative(this.root, f)));
    const indexed = this.db.getAllFiles();
    const indexedSet = new Set(indexed.map(f => f.filePath));

    // Remove deleted files
    for (const f of indexed) {
      if (!current.has(f.filePath)) {
        this.db.deleteEdgesByFile(f.filePath);
        this.db.deleteNodesByFile(f.filePath);
        this.db.deleteFile(f.filePath);
        removed++;
      }
    }

    // Find added/modified
    const toIndex: string[] = [];
    for (const rel of current) {
      const fp = path.join(this.root, rel);
      const content = fs.readFileSync(fp, 'utf-8');
      const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
      const existing = this.db.getFile(rel);

      if (!existing) { toIndex.push(fp); added++; }
      else if (existing.hash !== hash) { toIndex.push(fp); modified++; }
    }

    if (toIndex.length > 0) {
      const allUnresolved: any[] = [];
      for (let i = 0; i < toIndex.length; i++) {
        const fp = toIndex[i];
        const rel = path.relative(this.root, fp);
        onProgress?.({ phase: 'parsing', current: i + 1, total: toIndex.length, file: rel });

        try {
          const content = fs.readFileSync(fp, 'utf-8');
          const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
          const lang = detectLanguage(fp);
          if (!lang) continue;

          this.db.deleteEdgesByFile(rel);
          this.db.deleteNodesByFile(rel);

          const result = this.extractor.extract(content, rel, lang);
          this.db.upsertNodes(result.nodes);
          this.db.upsertEdges(result.edges);
          allUnresolved.push(...result.unresolvedRefs);

          this.db.upsertFile({
            filePath: rel, hash, language: lang.name,
            indexedAt: new Date().toISOString(),
            nodeCount: result.nodes.length,
            lineCount: content.split('\n').length,
          });
        } catch {}
      }
      const resolved = this.resolveRefs(allUnresolved);
      this.db.upsertEdges(resolved);
    }

    return { added, modified, removed, durationMs: Date.now() - t0 };
  }

  // ─── Watch Mode (Real-time) ─────────────────────────────────

  async watch(onEvent?: (event: string, file: string) => void): Promise<{ close: () => void }> {
    const chokidar = require('chokidar');
    const extensions = allExtensions();

    const watcher = chokidar.watch(this.root, {
      ignored: [
        /node_modules/, /\.git/, /dist/, /build/, /\.codexray/,
        /\.next/, /coverage/, /target/, /vendor/,
      ],
      persistent: true,
      ignoreInitial: true,
    });

    const debounce = new Map<string, NodeJS.Timeout>();

    const handleChange = (fp: string) => {
      const ext = path.extname(fp).toLowerCase();
      if (!extensions.includes(ext)) return;

      // Debounce rapid changes
      if (debounce.has(fp)) clearTimeout(debounce.get(fp)!);
      debounce.set(fp, setTimeout(() => {
        debounce.delete(fp);
        const rel = path.relative(this.root, fp);
        try {
          const content = fs.readFileSync(fp, 'utf-8');
          const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
          const lang = detectLanguage(fp);
          if (!lang) return;

          this.db.deleteEdgesByFile(rel);
          this.db.deleteNodesByFile(rel);

          const result = this.extractor.extract(content, rel, lang);
          this.db.upsertNodes(result.nodes);
          this.db.upsertEdges(result.edges);

          // Resolve references
          const resolved = this.resolveRefs(result.unresolvedRefs);
          this.db.upsertEdges(resolved);

          this.db.upsertFile({
            filePath: rel, hash, language: lang.name,
            indexedAt: new Date().toISOString(),
            nodeCount: result.nodes.length,
            lineCount: content.split('\n').length,
          });

          onEvent?.('update', rel);
        } catch (err) {
          onEvent?.('error', rel);
        }
      }, 300));
    };

    const handleDelete = (fp: string) => {
      const rel = path.relative(this.root, fp);
      this.db.deleteEdgesByFile(rel);
      this.db.deleteNodesByFile(rel);
      this.db.deleteFile(rel);
      onEvent?.('delete', rel);
    };

    watcher.on('change', handleChange);
    watcher.on('add', handleChange);
    watcher.on('unlink', handleDelete);

    return { close: () => watcher.close() };
  }

  // ─── Reference Resolution ──────────────────────────────────

  private resolveRefs(refs: any[]): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const seen = new Set<string>(); // Deduplicate edges

    for (const ref of refs) {
      const candidates = this.db.searchNodes(ref.refName, undefined, 10);
      if (!candidates.length) continue;

      let best = candidates[0], bestScore = -1;
      for (const c of candidates) {
        let score = 0;

        // Exact name match (strongest signal)
        if (c.name === ref.refName) score += 10;

        // Same file (likely local reference)
        if (c.filePath === ref.filePath) score += 8;

        // Same directory (sibling module)
        else if (path.dirname(c.filePath) === path.dirname(ref.filePath)) score += 5;

        // Parent/child directory (nearby module)
        else {
          const refParts = ref.filePath.split('/');
          const candParts = c.filePath.split('/');
          const shared = refParts.filter((p: string, i: number) => candParts[i] === p).length;
          score += Math.min(shared, 3); // Up to 3 points for shared path depth
        }

        // Exported symbols preferred (public API)
        if (c.exported) score += 3;

        // For imports, strongly prefer matching kind
        if (ref.refKind === 'imports' && (c.kind === 'class' || c.kind === 'interface' || c.kind === 'module')) score += 2;

        // Deterministic tie-break: prefer shorter file path (closer to root = more likely public)
        if (score === bestScore && best) {
          if (c.filePath.length < best.filePath.length) { best = c; continue; }
        }

        if (score > bestScore) { bestScore = score; best = c; }
      }

      if (best && best.id !== ref.fromNodeId) {
        const edgeId = GraphDatabase.edgeId(ref.fromNodeId, best.id, ref.refKind);
        if (!seen.has(edgeId)) {
          seen.add(edgeId);
          edges.push({
            id: edgeId,
            sourceId: ref.fromNodeId, targetId: best.id, kind: ref.refKind,
          });
        }
      }
    }
    return edges;
  }

  // ─── File Discovery ─────────────────────────────────────────

  private async discoverFiles(): Promise<string[]> {
    const patterns = allExtensions().map(ext => `**/*${ext}`);
    const defaultExcludes = [
      'node_modules/**', 'dist/**', 'build/**', '.git/**', 'vendor/**',
      '__pycache__/**', '.next/**', '.nuxt/**', 'coverage/**', '.codexray/**',
      '*.min.js', '*.min.css', '*.bundle.js', '*.map', 'target/**',
      'out/**', 'bin/**', '.venv/**', 'venv/**',
    ];
    const excludes = [...defaultExcludes, ...(this.config.exclude || [])];
    const maxSize = this.config.maxFileSize || 1048576;

    const allFiles: string[] = [];
    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: this.root, absolute: true, ignore: excludes, nodir: true, dot: false,
      });
      allFiles.push(...files);
    }

    return allFiles.filter(f => {
      try { return fs.statSync(f).size <= maxSize; }
      catch { return false; }
    });
  }
}
