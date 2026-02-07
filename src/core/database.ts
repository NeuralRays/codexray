import Database from 'better-sqlite3';
import crypto from 'crypto';

// ─── Type Definitions ─────────────────────────────────────────────

export type NodeKind =
  | 'function' | 'method' | 'class' | 'interface' | 'type'
  | 'enum' | 'variable' | 'constant' | 'module' | 'namespace'
  | 'struct' | 'trait' | 'component' | 'hook' | 'decorator'
  | 'property' | 'route' | 'middleware' | 'test';

export type EdgeKind =
  | 'calls' | 'imports' | 'extends' | 'implements'
  | 'returns_type' | 'uses_type' | 'has_method' | 'has_property'
  | 'contains' | 'exports' | 'renders' | 'decorates'
  | 'overrides' | 'tests';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  qualifiedName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  signature?: string;
  docstring?: string;
  exported: boolean;
  complexity?: number;
  metadata?: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: EdgeKind;
  metadata?: string;
}

export interface FileRecord {
  filePath: string;
  hash: string;
  language: string;
  indexedAt: string;
  nodeCount: number;
  lineCount: number;
}

// ─── Database Engine ──────────────────────────────────────────────

export class GraphDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 268435456'); // 256MB mmap
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        qualified_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        language TEXT NOT NULL,
        signature TEXT,
        docstring TEXT,
        exported INTEGER DEFAULT 0,
        complexity INTEGER DEFAULT 0,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        metadata TEXT,
        FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS files (
        file_path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        language TEXT NOT NULL,
        indexed_at TEXT DEFAULT (datetime('now')),
        node_count INTEGER DEFAULT 0,
        line_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS embeddings (
        node_id TEXT PRIMARY KEY,
        vector BLOB NOT NULL,
        model TEXT NOT NULL,
        FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
      );

      -- TF-IDF semantic search index
      CREATE TABLE IF NOT EXISTS search_tokens (
        node_id TEXT NOT NULL,
        token TEXT NOT NULL,
        tf REAL NOT NULL,
        source TEXT NOT NULL,
        PRIMARY KEY (node_id, token, source),
        FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS idf_cache (
        token TEXT PRIMARY KEY,
        idf REAL NOT NULL,
        doc_count INTEGER NOT NULL
      );

      -- Performance indices
      CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
      CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
      CREATE INDEX IF NOT EXISTS idx_nodes_qualified ON nodes(qualified_name);
      CREATE INDEX IF NOT EXISTS idx_nodes_lang ON nodes(language);
      CREATE INDEX IF NOT EXISTS idx_nodes_exported ON nodes(exported);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
      CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
      CREATE INDEX IF NOT EXISTS idx_edges_src_kind ON edges(source_id, kind);
      CREATE INDEX IF NOT EXISTS idx_edges_tgt_kind ON edges(target_id, kind);
      CREATE INDEX IF NOT EXISTS idx_files_lang ON files(language);
      CREATE INDEX IF NOT EXISTS idx_search_token ON search_tokens(token);

      -- FTS5 full-text search with trigram tokenizer
      CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
        name, qualified_name, signature, docstring,
        content='nodes', content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
        INSERT INTO nodes_fts(rowid, name, qualified_name, signature, docstring)
        VALUES (new.rowid, new.name, new.qualified_name, new.signature, new.docstring);
      END;
      CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
        INSERT INTO nodes_fts(nodes_fts, rowid, name, qualified_name, signature, docstring)
        VALUES('delete', old.rowid, old.name, old.qualified_name, old.signature, old.docstring);
      END;
      CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
        INSERT INTO nodes_fts(nodes_fts, rowid, name, qualified_name, signature, docstring)
        VALUES('delete', old.rowid, old.name, old.qualified_name, old.signature, old.docstring);
        INSERT INTO nodes_fts(rowid, name, qualified_name, signature, docstring)
        VALUES (new.rowid, new.name, new.qualified_name, new.signature, new.docstring);
      END;
    `);
  }

  // ─── Batch Transactions ───────────────────────────────────────

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ─── Node CRUD ────────────────────────────────────────────────

  private _upsertNodeStmt: Database.Statement | null = null;
  private get upsertNodeStmt(): Database.Statement {
    if (!this._upsertNodeStmt) {
      this._upsertNodeStmt = this.db.prepare(`
        INSERT INTO nodes (id, kind, name, qualified_name, file_path, start_line, end_line,
          language, signature, docstring, exported, complexity, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          kind=excluded.kind, name=excluded.name, qualified_name=excluded.qualified_name,
          file_path=excluded.file_path, start_line=excluded.start_line, end_line=excluded.end_line,
          language=excluded.language, signature=excluded.signature, docstring=excluded.docstring,
          exported=excluded.exported, complexity=excluded.complexity, metadata=excluded.metadata,
          updated_at=datetime('now')
      `);
    }
    return this._upsertNodeStmt;
  }

  upsertNode(node: GraphNode): void {
    this.upsertNodeStmt.run(
      node.id, node.kind, node.name, node.qualifiedName, node.filePath,
      node.startLine, node.endLine, node.language,
      node.signature || null, node.docstring || null,
      node.exported ? 1 : 0, node.complexity || 0, node.metadata || null
    );
  }

  upsertNodes(nodes: GraphNode[]): void {
    this.transaction(() => { for (const n of nodes) this.upsertNode(n); });
  }

  getNode(id: string): GraphNode | undefined {
    return this.rowToNode(this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as any);
  }

  getNodeByName(name: string, kind?: NodeKind, filePath?: string): GraphNode | undefined {
    if (filePath) {
      const sql = kind
        ? 'SELECT * FROM nodes WHERE name = ? AND kind = ? AND file_path = ? LIMIT 1'
        : 'SELECT * FROM nodes WHERE name = ? AND file_path = ? LIMIT 1';
      const row = kind
        ? this.db.prepare(sql).get(name, kind, filePath)
        : this.db.prepare(sql).get(name, filePath);
      return this.rowToNode(row as any);
    }
    // Try exact match first, prefer exported symbols
    const sql = kind
      ? 'SELECT * FROM nodes WHERE name = ? AND kind = ? ORDER BY exported DESC, file_path LIMIT 1'
      : 'SELECT * FROM nodes WHERE name = ? ORDER BY exported DESC, file_path LIMIT 1';
    const row = kind
      ? this.db.prepare(sql).get(name, kind)
      : this.db.prepare(sql).get(name);
    return this.rowToNode(row as any);
  }

  getNodesByName(name: string, kind?: NodeKind): GraphNode[] {
    // Try exact name match first
    const exactSql = kind
      ? 'SELECT * FROM nodes WHERE name = ? AND kind = ? ORDER BY exported DESC, file_path'
      : 'SELECT * FROM nodes WHERE name = ? ORDER BY exported DESC, file_path';
    const exactRows = kind
      ? this.db.prepare(exactSql).all(name, kind)
      : this.db.prepare(exactSql).all(name);
    if (exactRows.length > 0) {
      return (exactRows as any[]).map(r => this.rowToNode(r)).filter(Boolean) as GraphNode[];
    }

    // Fall back to qualified name match (e.g. "auth.utils.login")
    const qualSql = kind
      ? 'SELECT * FROM nodes WHERE qualified_name = ? AND kind = ? ORDER BY exported DESC, file_path'
      : 'SELECT * FROM nodes WHERE qualified_name = ? ORDER BY exported DESC, file_path';
    const qualRows = kind
      ? this.db.prepare(qualSql).all(name, kind)
      : this.db.prepare(qualSql).all(name);
    if (qualRows.length > 0) {
      return (qualRows as any[]).map(r => this.rowToNode(r)).filter(Boolean) as GraphNode[];
    }

    // Last resort: partial qualified name match
    const likeSql = kind
      ? 'SELECT * FROM nodes WHERE qualified_name LIKE ? AND kind = ? ORDER BY exported DESC, file_path LIMIT 20'
      : 'SELECT * FROM nodes WHERE qualified_name LIKE ? ORDER BY exported DESC, file_path LIMIT 20';
    const likeRows = kind
      ? this.db.prepare(likeSql).all(`%${name}%`, kind)
      : this.db.prepare(likeSql).all(`%${name}%`);
    return (likeRows as any[]).map(r => this.rowToNode(r)).filter(Boolean) as GraphNode[];
  }

  searchNodes(query: string, kind?: NodeKind, limit = 20): GraphNode[] {
    const ftsQuery = query.replace(/[^\w\s]/g, ' ').trim();
    let sql: string;
    let params: any[];

    if (ftsQuery.length > 0) {
      sql = kind
        ? `SELECT n.* FROM nodes n JOIN nodes_fts f ON n.rowid = f.rowid WHERE nodes_fts MATCH ? AND n.kind = ? ORDER BY rank LIMIT ?`
        : `SELECT n.* FROM nodes n JOIN nodes_fts f ON n.rowid = f.rowid WHERE nodes_fts MATCH ? ORDER BY rank LIMIT ?`;
      params = kind ? [ftsQuery + '*', kind, limit] : [ftsQuery + '*', limit];
    } else {
      sql = kind
        ? 'SELECT * FROM nodes WHERE name LIKE ? AND kind = ? LIMIT ?'
        : 'SELECT * FROM nodes WHERE name LIKE ? LIMIT ?';
      params = kind ? [`%${query}%`, kind, limit] : [`%${query}%`, limit];
    }

    try {
      return (this.db.prepare(sql).all(...params) as any[])
        .map(r => this.rowToNode(r)).filter(Boolean) as GraphNode[];
    } catch {
      // FTS match error fallback — use LIKE
      const fallbackSql = kind
        ? 'SELECT * FROM nodes WHERE (name LIKE ? OR qualified_name LIKE ?) AND kind = ? LIMIT ?'
        : 'SELECT * FROM nodes WHERE (name LIKE ? OR qualified_name LIKE ?) LIMIT ?';
      const fallbackParams = kind
        ? [`%${query}%`, `%${query}%`, kind, limit]
        : [`%${query}%`, `%${query}%`, limit];
      return (this.db.prepare(fallbackSql).all(...fallbackParams) as any[])
        .map(r => this.rowToNode(r)).filter(Boolean) as GraphNode[];
    }
  }

  // ─── Semantic Search (TF-IDF) ─────────────────────────────────

  semanticSearch(query: string, limit = 20): { node: GraphNode; score: number }[] {
    const tokens = this.tokenize(query);
    if (!tokens.length) return [];

    // Get IDF values for query tokens
    const placeholders = tokens.map(() => '?').join(',');
    const idfRows = this.db.prepare(
      `SELECT token, idf FROM idf_cache WHERE token IN (${placeholders})`
    ).all(...tokens) as { token: string; idf: number }[];

    const idfMap = new Map(idfRows.map(r => [r.token, r.idf]));
    const totalDocs = (this.db.prepare('SELECT COUNT(*) as c FROM nodes').get() as any).c || 1;

    // Default IDF for unknown tokens (max rarity)
    const defaultIdf = Math.log(totalDocs + 1);
    for (const t of tokens) {
      if (!idfMap.has(t)) idfMap.set(t, defaultIdf);
    }

    // Score each matching node
    const scoreMap = new Map<string, number>();
    const tokenStmt = this.db.prepare(
      `SELECT node_id, tf, source FROM search_tokens WHERE token = ?`
    );

    for (const token of tokens) {
      const idf = idfMap.get(token) || defaultIdf;
      const rows = tokenStmt.all(token) as { node_id: string; tf: number; source: string }[];
      for (const row of rows) {
        // Weight: name > signature > docstring > qualified_name
        const sourceWeight = row.source === 'name' ? 4
          : row.source === 'signature' ? 2
          : row.source === 'docstring' ? 1.5
          : 1;
        const tfidf = row.tf * idf * sourceWeight;
        scoreMap.set(row.node_id, (scoreMap.get(row.node_id) || 0) + tfidf);
      }
    }

    // Sort and return top results
    const sorted = Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return sorted.map(([id, score]) => {
      const node = this.getNode(id);
      return node ? { node, score } : null;
    }).filter(Boolean) as { node: GraphNode; score: number }[];
  }

  // Build TF-IDF index for all nodes
  buildSearchIndex(): void {
    this.db.exec('DELETE FROM search_tokens; DELETE FROM idf_cache;');

    const nodes = this.db.prepare('SELECT * FROM nodes').all() as any[];
    const totalDocs = nodes.length || 1;
    const docFreq = new Map<string, number>();

    const insertToken = this.db.prepare(
      `INSERT OR REPLACE INTO search_tokens (node_id, token, tf, source) VALUES (?, ?, ?, ?)`
    );

    this.transaction(() => {
      for (const row of nodes) {
        const node = this.rowToNode(row)!;
        const fields: [string, string][] = [
          ['name', node.name],
          ['qualified_name', node.qualifiedName],
          ['signature', node.signature || ''],
          ['docstring', node.docstring || ''],
        ];

        const nodeTokens = new Set<string>();

        for (const [source, text] of fields) {
          const tokens = this.tokenize(text);
          const freq = new Map<string, number>();
          for (const t of tokens) {
            freq.set(t, (freq.get(t) || 0) + 1);
            nodeTokens.add(t);
          }
          const maxFreq = Math.max(...freq.values(), 1);
          for (const [token, count] of freq) {
            insertToken.run(node.id, token, count / maxFreq, source);
          }
        }

        for (const t of nodeTokens) {
          docFreq.set(t, (docFreq.get(t) || 0) + 1);
        }
      }
    });

    // Build IDF cache
    const insertIdf = this.db.prepare(
      `INSERT OR REPLACE INTO idf_cache (token, idf, doc_count) VALUES (?, ?, ?)`
    );
    this.transaction(() => {
      for (const [token, count] of docFreq) {
        const idf = Math.log((totalDocs + 1) / (count + 1)) + 1;
        insertIdf.run(token, idf, count);
      }
    });
  }

  private tokenize(text: string): string[] {
    return text
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase split
      .replace(/[_\-./\\:]/g, ' ')          // separator split
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 1 && t.length < 40)
      .filter(t => !STOP_WORDS.has(t));
  }

  getNodesByFile(filePath: string): GraphNode[] {
    return (this.db.prepare('SELECT * FROM nodes WHERE file_path = ? ORDER BY start_line').all(filePath) as any[])
      .map(r => this.rowToNode(r)).filter(Boolean) as GraphNode[];
  }

  deleteNodesByFile(filePath: string): number {
    return this.db.prepare('DELETE FROM nodes WHERE file_path = ?').run(filePath).changes;
  }

  // ─── Edge CRUD ────────────────────────────────────────────────

  private _upsertEdgeStmt: Database.Statement | null = null;
  private get upsertEdgeStmt(): Database.Statement {
    if (!this._upsertEdgeStmt) {
      this._upsertEdgeStmt = this.db.prepare(`
        INSERT INTO edges (id, source_id, target_id, kind, metadata)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, metadata=excluded.metadata
      `);
    }
    return this._upsertEdgeStmt;
  }

  upsertEdge(edge: GraphEdge): void {
    this.upsertEdgeStmt.run(edge.id, edge.sourceId, edge.targetId, edge.kind, edge.metadata || null);
  }

  upsertEdges(edges: GraphEdge[]): void {
    this.transaction(() => { for (const e of edges) this.upsertEdge(e); });
  }

  deleteEdgesByFile(filePath: string): void {
    this.db.prepare(`
      DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE file_path = ?)
      OR target_id IN (SELECT id FROM nodes WHERE file_path = ?)
    `).run(filePath, filePath);
  }

  // ─── File CRUD ────────────────────────────────────────────────

  upsertFile(file: FileRecord): void {
    this.db.prepare(`
      INSERT INTO files (file_path, hash, language, indexed_at, node_count, line_count)
      VALUES (?, ?, ?, datetime('now'), ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        hash=excluded.hash, language=excluded.language, indexed_at=datetime('now'),
        node_count=excluded.node_count, line_count=excluded.line_count
    `).run(file.filePath, file.hash, file.language, file.nodeCount, file.lineCount || 0);
  }

  getFile(filePath: string): FileRecord | undefined {
    return this.db.prepare('SELECT * FROM files WHERE file_path = ?').get(filePath) as FileRecord | undefined;
  }

  getAllFiles(): FileRecord[] {
    return this.db.prepare('SELECT * FROM files ORDER BY file_path').all() as FileRecord[];
  }

  deleteFile(filePath: string): void {
    this.db.prepare('DELETE FROM files WHERE file_path = ?').run(filePath);
  }

  // ─── Graph Queries ────────────────────────────────────────────

  getCallers(nodeId: string, limit = 50): { node: GraphNode; edge: GraphEdge }[] {
    return (this.db.prepare(`
      SELECT n.*, e.id as eid, e.source_id as esrc, e.target_id as etgt, e.kind as ekind, e.metadata as emeta
      FROM edges e JOIN nodes n ON n.id = e.source_id
      WHERE e.target_id = ? AND e.kind = 'calls' LIMIT ?
    `).all(nodeId, limit) as any[]).map(r => ({
      node: this.rowToNode(r)!,
      edge: { id: r.eid, sourceId: r.esrc, targetId: r.etgt, kind: r.ekind, metadata: r.emeta }
    }));
  }

  getCallees(nodeId: string, limit = 50): { node: GraphNode; edge: GraphEdge }[] {
    return (this.db.prepare(`
      SELECT n.*, e.id as eid, e.source_id as esrc, e.target_id as etgt, e.kind as ekind, e.metadata as emeta
      FROM edges e JOIN nodes n ON n.id = e.target_id
      WHERE e.source_id = ? AND e.kind = 'calls' LIMIT ?
    `).all(nodeId, limit) as any[]).map(r => ({
      node: this.rowToNode(r)!,
      edge: { id: r.eid, sourceId: r.esrc, targetId: r.etgt, kind: r.ekind, metadata: r.emeta }
    }));
  }

  getImpactRadius(nodeId: string, maxDepth = 3): Map<string, { node: GraphNode; depth: number; path: string[] }> {
    const visited = new Map<string, { node: GraphNode; depth: number; path: string[] }>();
    const queue: { id: string; depth: number; path: string[] }[] = [{ id: nodeId, depth: 0, path: [] }];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur.id) || cur.depth > maxDepth) continue;

      const node = this.getNode(cur.id);
      if (!node) continue;

      visited.set(cur.id, { node, depth: cur.depth, path: cur.path });

      const deps = this.db.prepare(`
        SELECT DISTINCT source_id FROM edges
        WHERE target_id = ? AND kind IN ('calls','imports','extends','implements','uses_type')
      `).all(cur.id) as { source_id: string }[];

      for (const d of deps) {
        if (!visited.has(d.source_id)) {
          queue.push({ id: d.source_id, depth: cur.depth + 1, path: [...cur.path, cur.id] });
        }
      }
    }

    visited.delete(nodeId);
    return visited;
  }

  getDependencies(nodeId: string): { node: GraphNode; edgeKind: EdgeKind }[] {
    return (this.db.prepare(`
      SELECT n.*, e.kind as edge_kind FROM edges e
      JOIN nodes n ON n.id = e.target_id WHERE e.source_id = ? ORDER BY e.kind, n.name
    `).all(nodeId) as any[]).map(r => ({ node: this.rowToNode(r)!, edgeKind: r.edge_kind }));
  }

  getDependents(nodeId: string): { node: GraphNode; edgeKind: EdgeKind }[] {
    return (this.db.prepare(`
      SELECT n.*, e.kind as edge_kind FROM edges e
      JOIN nodes n ON n.id = e.source_id WHERE e.target_id = ? ORDER BY e.kind, n.name
    `).all(nodeId) as any[]).map(r => ({ node: this.rowToNode(r)!, edgeKind: r.edge_kind }));
  }

  // ─── Shortest Path (Dijkstra) ─────────────────────────────────

  findPath(fromId: string, toId: string, maxDepth = 10): GraphNode[] | null {
    const visited = new Map<string, string | null>();
    const queue: { id: string; depth: number }[] = [{ id: fromId, depth: 0 }];
    visited.set(fromId, null);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.id === toId) {
        // Reconstruct path
        const path: GraphNode[] = [];
        let nodeId: string | null = toId;
        while (nodeId) {
          const node = this.getNode(nodeId);
          if (node) path.unshift(node);
          nodeId = visited.get(nodeId) ?? null;
          if (nodeId === fromId) { const n = this.getNode(fromId); if (n) path.unshift(n); break; }
        }
        return path;
      }
      if (cur.depth >= maxDepth) continue;

      const neighbors = this.db.prepare(`
        SELECT DISTINCT target_id as id FROM edges WHERE source_id = ?
        UNION SELECT DISTINCT source_id as id FROM edges WHERE target_id = ?
      `).all(cur.id, cur.id) as { id: string }[];

      for (const n of neighbors) {
        if (!visited.has(n.id)) {
          visited.set(n.id, cur.id);
          queue.push({ id: n.id, depth: cur.depth + 1 });
        }
      }
    }
    return null;
  }

  // ─── Circular Dependency Detection ────────────────────────────

  findCircularDeps(): { cycle: GraphNode[]; via: EdgeKind }[] {
    const cycles: { cycle: GraphNode[]; via: EdgeKind }[] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();
    const parent = new Map<string, string>();

    const nodes = this.db.prepare(
      `SELECT DISTINCT source_id as id FROM edges WHERE kind IN ('imports','calls','extends','implements')`
    ).all() as { id: string }[];

    const dfs = (nodeId: string) => {
      visited.add(nodeId);
      stack.add(nodeId);

      const deps = this.db.prepare(
        `SELECT target_id, kind FROM edges WHERE source_id = ? AND kind IN ('imports','calls','extends','implements')`
      ).all(nodeId) as { target_id: string; kind: string }[];

      for (const dep of deps) {
        if (stack.has(dep.target_id)) {
          // Found cycle — reconstruct
          const cycleNodes: GraphNode[] = [];
          let cur = nodeId;
          while (cur !== dep.target_id) {
            const n = this.getNode(cur);
            if (n) cycleNodes.unshift(n);
            cur = parent.get(cur) || dep.target_id;
          }
          const target = this.getNode(dep.target_id);
          if (target) { cycleNodes.unshift(target); cycleNodes.push(target); }
          if (cycleNodes.length >= 2 && cycles.length < 20) {
            cycles.push({ cycle: cycleNodes, via: dep.kind as EdgeKind });
          }
        } else if (!visited.has(dep.target_id)) {
          parent.set(dep.target_id, nodeId);
          dfs(dep.target_id);
        }
      }

      stack.delete(nodeId);
    };

    for (const n of nodes) {
      if (!visited.has(n.id)) dfs(n.id);
    }
    return cycles;
  }

  // ─── Dead Code Detection ──────────────────────────────────────

  findDeadCode(opts: { kinds?: NodeKind[]; exportedOnly?: boolean } = {}): GraphNode[] {
    const kinds = opts.kinds || ['function', 'method', 'class'];
    const placeholders = kinds.map(() => '?').join(',');

    let sql = `
      SELECT n.* FROM nodes n
      LEFT JOIN edges e ON e.target_id = n.id AND e.kind IN ('calls','imports','extends','implements','uses_type')
      WHERE n.kind IN (${placeholders}) AND e.id IS NULL
    `;
    const params: any[] = [...kinds];

    if (opts.exportedOnly === false) {
      sql += ' AND n.exported = 0';
    }

    sql += ' ORDER BY n.file_path, n.start_line';
    return (this.db.prepare(sql).all(...params) as any[])
      .map(r => this.rowToNode(r)).filter(Boolean) as GraphNode[];
  }

  // ─── Hotspot Detection ────────────────────────────────────────

  findHotspots(limit = 20): { node: GraphNode; inDegree: number; outDegree: number; totalDegree: number }[] {
    return (this.db.prepare(`
      SELECT n.*,
        (SELECT COUNT(*) FROM edges WHERE target_id = n.id) as in_degree,
        (SELECT COUNT(*) FROM edges WHERE source_id = n.id) as out_degree,
        (SELECT COUNT(*) FROM edges WHERE target_id = n.id) +
        (SELECT COUNT(*) FROM edges WHERE source_id = n.id) as total_degree
      FROM nodes n
      WHERE n.kind IN ('function','method','class','interface','component','hook')
      ORDER BY total_degree DESC LIMIT ?
    `).all(limit) as any[]).map(r => ({
      node: this.rowToNode(r)!,
      inDegree: r.in_degree,
      outDegree: r.out_degree,
      totalDegree: r.total_degree,
    }));
  }

  // ─── Complexity Report ────────────────────────────────────────

  getComplexityReport(threshold = 10): GraphNode[] {
    return (this.db.prepare(`
      SELECT * FROM nodes WHERE complexity >= ? ORDER BY complexity DESC
    `).all(threshold) as any[]).map(r => this.rowToNode(r)).filter(Boolean) as GraphNode[];
  }

  // ─── File Tree ────────────────────────────────────────────────

  getFileTree(): { path: string; language: string; nodeCount: number; lineCount: number }[] {
    return this.db.prepare(
      'SELECT file_path as path, language, node_count as nodeCount, line_count as lineCount FROM files ORDER BY file_path'
    ).all() as any[];
  }

  // ─── Hierarchy (class → methods/properties) ───────────────────

  getChildren(nodeId: string): GraphNode[] {
    return (this.db.prepare(`
      SELECT n.* FROM edges e JOIN nodes n ON n.id = e.target_id
      WHERE e.source_id = ? AND e.kind IN ('has_method','has_property','contains')
      ORDER BY n.start_line
    `).all(nodeId) as any[]).map(r => this.rowToNode(r)).filter(Boolean) as GraphNode[];
  }

  // ─── Statistics ───────────────────────────────────────────────

  getStats(): {
    totalNodes: number; totalEdges: number; totalFiles: number; totalLines: number;
    nodesByKind: Record<string, number>;
    filesByLanguage: Record<string, number>;
    edgesByKind: Record<string, number>;
  } {
    const totalNodes = (this.db.prepare('SELECT COUNT(*) as c FROM nodes').get() as any).c;
    const totalEdges = (this.db.prepare('SELECT COUNT(*) as c FROM edges').get() as any).c;
    const totalFiles = (this.db.prepare('SELECT COUNT(*) as c FROM files').get() as any).c;
    const totalLines = (this.db.prepare('SELECT COALESCE(SUM(line_count),0) as c FROM files').get() as any).c;

    const nodesByKind: Record<string, number> = {};
    for (const r of this.db.prepare('SELECT kind, COUNT(*) as c FROM nodes GROUP BY kind').all() as any[])
      nodesByKind[r.kind] = r.c;

    const filesByLanguage: Record<string, number> = {};
    for (const r of this.db.prepare('SELECT language, COUNT(*) as c FROM files GROUP BY language').all() as any[])
      filesByLanguage[r.language] = r.c;

    const edgesByKind: Record<string, number> = {};
    for (const r of this.db.prepare('SELECT kind, COUNT(*) as c FROM edges GROUP BY kind').all() as any[])
      edgesByKind[r.kind] = r.c;

    return { totalNodes, totalEdges, totalFiles, totalLines, nodesByKind, filesByLanguage, edgesByKind };
  }

  // ─── Utilities ────────────────────────────────────────────────

  reset(): void {
    this.db.exec('DELETE FROM search_tokens; DELETE FROM idf_cache; DELETE FROM embeddings; DELETE FROM edges; DELETE FROM nodes; DELETE FROM files;');
  }

  close(): void { this.db.close(); }
  vacuum(): void { this.db.exec('VACUUM'); }

  static nodeId(kind: string, filePath: string, name: string, line: number): string {
    return crypto.createHash('sha256').update(`${kind}:${filePath}:${name}:${line}`).digest('hex').slice(0, 16);
  }

  static edgeId(srcId: string, tgtId: string, kind: string): string {
    return crypto.createHash('sha256').update(`${srcId}->${tgtId}:${kind}`).digest('hex').slice(0, 16);
  }

  private rowToNode(row: any): GraphNode | undefined {
    if (!row) return undefined;
    return {
      id: row.id, kind: row.kind as NodeKind, name: row.name,
      qualifiedName: row.qualified_name, filePath: row.file_path,
      startLine: row.start_line, endLine: row.end_line, language: row.language,
      signature: row.signature || undefined, docstring: row.docstring || undefined,
      exported: row.exported === 1, complexity: row.complexity || undefined,
      metadata: row.metadata || undefined,
    };
  }
}

// Stop words for tokenization
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'this', 'that', 'these', 'those', 'it', 'its', 'i', 'we', 'you',
  'he', 'she', 'they', 'me', 'my', 'our', 'your', 'and', 'or', 'but',
  'if', 'not', 'no', 'so', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',
  'than', 'too', 'very', 'just', 'about', 'up', 'out', 'new',
  'get', 'set', 'let', 'var', 'const', 'return', 'void', 'null',
  'true', 'false', 'undefined', 'import', 'export', 'from', 'require',
  'function', 'class', 'interface', 'type', 'enum', 'struct',
]);
