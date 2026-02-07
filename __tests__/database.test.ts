import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphDatabase, GraphNode, GraphEdge, NodeKind } from '../src/core/database';
import fs from 'fs';
import path from 'path';
import os from 'os';

let db: GraphDatabase;
let testDbPath: string;

beforeEach(() => {
  testDbPath = path.join(os.tmpdir(), `codexray-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = new GraphDatabase(testDbPath);
});

afterEach(() => {
  db.close();
  try { fs.unlinkSync(testDbPath); } catch {}
});

const makeNode = (name: string, kind: NodeKind = 'function', exported = false, filePath = 'test.ts'): GraphNode => ({
  id: GraphDatabase.nodeId(kind, filePath, name, 1),
  kind,
  name,
  qualifiedName: `test.${name}`,
  filePath,
  startLine: 1,
  endLine: 10,
  language: 'typescript',
  signature: `function ${name}()`,
  exported,
});

describe('GraphDatabase', () => {
  describe('Node CRUD', () => {
    it('upserts and retrieves nodes', () => {
      const node = makeNode('hello');
      db.upsertNode(node);
      const found = db.getNode(node.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('hello');
    });

    it('searches by name (FTS)', () => {
      db.upsertNodes([makeNode('getUserById'), makeNode('getPostById'), makeNode('createUser')]);
      const results = db.searchNodes('getUser');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.name === 'getUserById')).toBe(true);
    });

    it('filters by kind', () => {
      db.upsertNodes([makeNode('Foo', 'class'), makeNode('foo', 'function')]);
      const classes = db.searchNodes('foo', 'class');
      expect(classes.length).toBe(1);
      expect(classes[0].kind).toBe('class');
    });

    it('gets nodes by file', () => {
      db.upsertNodes([makeNode('a'), makeNode('b')]);
      const nodes = db.getNodesByFile('test.ts');
      expect(nodes.length).toBe(2);
    });

    it('deletes by file', () => {
      db.upsertNodes([makeNode('x'), makeNode('y')]);
      db.deleteNodesByFile('test.ts');
      expect(db.getNodesByFile('test.ts').length).toBe(0);
    });
  });

  describe('Edges', () => {
    it('creates and queries edges', () => {
      const a = makeNode('caller');
      const b = makeNode('callee');
      db.upsertNodes([a, b]);
      db.upsertEdge({
        id: GraphDatabase.edgeId(a.id, b.id, 'calls'),
        sourceId: a.id, targetId: b.id, kind: 'calls',
      });

      const callers = db.getCallers(b.id);
      expect(callers.length).toBe(1);
      expect(callers[0].node.name).toBe('caller');

      const callees = db.getCallees(a.id);
      expect(callees.length).toBe(1);
      expect(callees[0].node.name).toBe('callee');
    });
  });

  describe('Impact Analysis', () => {
    it('traces impact through graph', () => {
      const a = makeNode('baseFunc');
      const b = makeNode('middleFunc');
      const c = makeNode('topFunc');
      db.upsertNodes([a, b, c]);
      db.upsertEdges([
        { id: GraphDatabase.edgeId(b.id, a.id, 'calls'), sourceId: b.id, targetId: a.id, kind: 'calls' },
        { id: GraphDatabase.edgeId(c.id, b.id, 'calls'), sourceId: c.id, targetId: b.id, kind: 'calls' },
      ]);

      const impact = db.getImpactRadius(a.id, 3);
      expect(impact.size).toBe(2);
      expect(impact.get(b.id)!.depth).toBe(1);
      expect(impact.get(c.id)!.depth).toBe(2);
    });
  });

  describe('Dead Code Detection', () => {
    it('finds unreferenced symbols', () => {
      const used = makeNode('usedFunc');
      const unused = makeNode('unusedFunc');
      const caller = makeNode('main');
      db.upsertNodes([used, unused, caller]);
      db.upsertEdge({
        id: GraphDatabase.edgeId(caller.id, used.id, 'calls'),
        sourceId: caller.id, targetId: used.id, kind: 'calls',
      });

      const dead = db.findDeadCode({ kinds: ['function'] });
      const names = dead.map(n => n.name);
      expect(names).toContain('unusedFunc');
      expect(names).not.toContain('usedFunc');
    });
  });

  describe('Hotspots', () => {
    it('ranks by connectivity', () => {
      const hub = makeNode('hubFunc');
      const a = makeNode('a');
      const b = makeNode('b');
      const c = makeNode('c2');
      db.upsertNodes([hub, a, b, c]);
      db.upsertEdges([
        { id: GraphDatabase.edgeId(a.id, hub.id, 'calls'), sourceId: a.id, targetId: hub.id, kind: 'calls' },
        { id: GraphDatabase.edgeId(b.id, hub.id, 'calls'), sourceId: b.id, targetId: hub.id, kind: 'calls' },
        { id: GraphDatabase.edgeId(c.id, hub.id, 'calls'), sourceId: c.id, targetId: hub.id, kind: 'calls' },
      ]);

      const hotspots = db.findHotspots(5);
      expect(hotspots[0].node.name).toBe('hubFunc');
      expect(hotspots[0].inDegree).toBe(3);
    });
  });

  describe('Stats', () => {
    it('returns accurate counts', () => {
      db.upsertNodes([makeNode('a', 'function'), makeNode('B', 'class')]);
      db.upsertFile({ filePath: 'test.ts', hash: 'abc', language: 'typescript', indexedAt: '', nodeCount: 2, lineCount: 50 });

      const stats = db.getStats();
      expect(stats.totalNodes).toBe(2);
      expect(stats.totalFiles).toBe(1);
      expect(stats.nodesByKind.function).toBe(1);
      expect(stats.nodesByKind.class).toBe(1);
    });
  });

  describe('Semantic Search (TF-IDF)', () => {
    it('finds symbols by meaning', () => {
      db.upsertNodes([
        { ...makeNode('authenticateUser'), signature: 'function authenticateUser(email: string, password: string)' },
        { ...makeNode('validateToken'), signature: 'function validateToken(jwt: string): boolean' },
        { ...makeNode('renderDashboard'), signature: 'function renderDashboard(): JSX.Element' },
      ]);
      db.buildSearchIndex();

      const results = db.semanticSearch('authenticate user password');
      expect(results.length).toBeGreaterThan(0);
      // authenticateUser should rank higher than renderDashboard for "authenticate"
      const names = results.map(r => r.node.name);
      expect(names[0]).toBe('authenticateUser');
    });
  });

  describe('Path Finding', () => {
    it('finds shortest path between nodes', () => {
      const a = makeNode('start');
      const b = makeNode('middle');
      const c = makeNode('end');
      db.upsertNodes([a, b, c]);
      db.upsertEdges([
        { id: GraphDatabase.edgeId(a.id, b.id, 'calls'), sourceId: a.id, targetId: b.id, kind: 'calls' },
        { id: GraphDatabase.edgeId(b.id, c.id, 'calls'), sourceId: b.id, targetId: c.id, kind: 'calls' },
      ]);

      const pathResult = db.findPath(a.id, c.id);
      expect(pathResult).not.toBeNull();
      expect(pathResult!.length).toBe(3);
      expect(pathResult![0].name).toBe('start');
      expect(pathResult![2].name).toBe('end');
    });

    it('returns null for unconnected nodes', () => {
      const a = makeNode('isolated1');
      const b = makeNode('isolated2');
      db.upsertNodes([a, b]);

      const pathResult = db.findPath(a.id, b.id);
      expect(pathResult).toBeNull();
    });
  });

  describe('Dependencies', () => {
    it('tracks outgoing deps', () => {
      const a = makeNode('Component');
      const b = makeNode('Service', 'class');
      db.upsertNodes([a, b]);
      db.upsertEdge({
        id: GraphDatabase.edgeId(a.id, b.id, 'imports'),
        sourceId: a.id, targetId: b.id, kind: 'imports',
      });

      const deps = db.getDependencies(a.id);
      expect(deps.length).toBe(1);
      expect(deps[0].node.name).toBe('Service');
      expect(deps[0].edgeKind).toBe('imports');
    });
  });

  describe('Complexity Report', () => {
    it('finds high-complexity functions', () => {
      db.upsertNode({ ...makeNode('simpleFunc'), complexity: 3 });
      db.upsertNode({ ...makeNode('complexFunc'), complexity: 25 });
      db.upsertNode({ ...makeNode('mediumFunc'), complexity: 12 });

      const report = db.getComplexityReport(10);
      expect(report.length).toBe(2);
      expect(report[0].name).toBe('complexFunc');
      expect(report[0].complexity).toBe(25);
    });
  });

  describe('ID Generation', () => {
    it('produces deterministic IDs', () => {
      const id1 = GraphDatabase.nodeId('function', 'test.ts', 'foo', 1);
      const id2 = GraphDatabase.nodeId('function', 'test.ts', 'foo', 1);
      expect(id1).toBe(id2);
    });

    it('produces different IDs for different inputs', () => {
      const id1 = GraphDatabase.nodeId('function', 'test.ts', 'foo', 1);
      const id2 = GraphDatabase.nodeId('function', 'test.ts', 'bar', 1);
      expect(id1).not.toBe(id2);
    });
  });
});
