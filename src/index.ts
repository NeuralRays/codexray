export { GraphDatabase, GraphNode, GraphEdge, FileRecord, NodeKind, EdgeKind } from './core/database';
export { Indexer, IndexResult, SyncResult, IndexProgress } from './core/indexer';
export { ContextBuilder, ContextResult, ContextOptions } from './core/context';
export { MCPServer } from './mcp/server';
export { SymbolExtractor, ExtractionResult } from './parsers/extractor';
export { detectLanguage, LANGUAGES, allExtensions } from './parsers/registry';
export {
  loadConfig, saveConfig, createConfig, isInitialized,
  dbPath, configDir, CodeXRayConfig,
  installHook, removeHook, isHookInstalled,
} from './utils/config';

import { GraphDatabase, NodeKind } from './core/database';
import { Indexer } from './core/indexer';
import { ContextBuilder, ContextResult, ContextOptions } from './core/context';
import { loadConfig, dbPath, configDir, isInitialized, createConfig } from './utils/config';
import path from 'path';
import fs from 'fs';

/**
 * CodeXRay — High-level API for semantic code intelligence.
 *
 * @example
 * ```typescript
 * const cxr = await CodeXRay.init('/path/to/project', { index: true });
 * const results = cxr.search('UserService');
 * const semantic = cxr.semanticSearch('user authentication');
 * const callers = cxr.getCallers(results[0].id);
 * const context = cxr.buildContext('fix login bug');
 * console.log(cxr.formatContext(context));
 * cxr.close();
 * ```
 */
export default class CodeXRay {
  readonly db: GraphDatabase;
  readonly indexer: Indexer;
  readonly context: ContextBuilder;
  readonly root: string;

  private constructor(root: string) {
    this.root = root;
    const config = loadConfig(root);
    this.db = new GraphDatabase(dbPath(root));
    this.indexer = new Indexer(this.db, root, config);
    this.context = new ContextBuilder(this.db, root);
  }

  static async init(root: string, opts: { index?: boolean; force?: boolean } = {}): Promise<CodeXRay> {
    const abs = path.resolve(root);
    if (!isInitialized(abs)) {
      const dir = configDir(abs);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      createConfig(abs);
    }
    const cxr = new CodeXRay(abs);
    if (opts.index) {
      await cxr.indexer.indexAll({ force: opts.force });
      cxr.db.buildSearchIndex();
    }
    return cxr;
  }

  static open(root: string): CodeXRay {
    const abs = path.resolve(root);
    if (!isInitialized(abs)) throw new Error(`Not initialized: ${abs}`);
    return new CodeXRay(abs);
  }

  // Search
  search(query: string, kind?: NodeKind, limit?: number) { return this.db.searchNodes(query, kind, limit); }
  semanticSearch(query: string, limit?: number) { return this.db.semanticSearch(query, limit); }

  // Graph traversal
  getCallers(nodeId: string) { return this.db.getCallers(nodeId); }
  getCallees(nodeId: string) { return this.db.getCallees(nodeId); }
  getImpact(nodeId: string, depth?: number) { return this.db.getImpactRadius(nodeId, depth); }
  getDependencies(nodeId: string) { return this.db.getDependencies(nodeId); }
  findPath(fromId: string, toId: string) { return this.db.findPath(fromId, toId); }

  // Analysis
  findDeadCode(kinds?: NodeKind[]) { return this.db.findDeadCode({ kinds }); }
  findHotspots(limit?: number) { return this.db.findHotspots(limit); }
  findCircularDeps() { return this.db.findCircularDeps(); }
  getComplexityReport(threshold?: number) { return this.db.getComplexityReport(threshold); }
  getStats() { return this.db.getStats(); }

  // Context
  buildContext(query: string, opts?: ContextOptions) { return this.context.build(query, opts); }
  formatContext(result: ContextResult, fmt?: 'markdown' | 'json' | 'compact') { return this.context.format(result, fmt); }
  buildOverview() { return this.context.buildOverview(); }

  // Index management
  async index(force?: boolean) {
    const r = await this.indexer.indexAll({ force });
    this.db.buildSearchIndex();
    return r;
  }
  async sync() {
    const r = await this.indexer.sync();
    this.db.buildSearchIndex();
    return r;
  }

  close() { this.db.close(); }
}
