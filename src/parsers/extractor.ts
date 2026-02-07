import { GraphNode, GraphEdge, GraphDatabase, NodeKind, EdgeKind } from '../core/database';
import { LanguageConfig, loadParser } from './registry';

let Parser: any = null;
function getParser() {
  if (!Parser) Parser = require('tree-sitter');
  return Parser;
}

export interface ExtractionResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  unresolvedRefs: UnresolvedRef[];
}

export interface UnresolvedRef {
  fromNodeId: string;
  refName: string;
  refKind: EdgeKind;
  filePath: string;
}

// ─── Node type → kind mappings ────────────────────────────────

const FUNCTION_TYPES = new Set([
  'function_declaration', 'function_definition', 'arrow_function',
  'function_item', 'func_literal', 'func_declaration',
  'generator_function_declaration', 'async_function_declaration',
]);

const METHOD_TYPES = new Set([
  'method_definition', 'method_declaration',
]);

const CLASS_TYPES = new Set([
  'class_declaration', 'class_definition', 'class_specifier', 'struct_item',
]);

const INTERFACE_TYPES = new Set([
  'interface_declaration', 'type_alias_declaration',
]);

const STRUCT_TYPES = new Set([
  'struct_declaration', 'struct_specifier',
]);

const ENUM_TYPES = new Set([
  'enum_declaration', 'enum_specifier', 'enum_item',
]);

const MODULE_TYPES = new Set([
  'module', 'namespace_declaration', 'mod_item',
]);

const CLASS_BODY_TYPES = new Set([
  'class_body', 'class_declaration', 'impl_item', 'class_definition',
]);

const CALL_TYPES = new Set([
  'call_expression', 'new_expression', 'method_invocation',
]);

const IMPORT_TYPES = new Set([
  'import_statement', 'import_declaration', 'use_declaration',
]);

const EXTENDS_TYPES = new Set([
  'extends_clause', 'implements_clause', 'superclass',
]);

// ─── Extractor Class ──────────────────────────────────────────

export class SymbolExtractor {
  private parserCache = new Map<string, any>();

  private getOrCreate(lang: LanguageConfig): any {
    let p = this.parserCache.get(lang.name);
    if (p) return p;

    const TSParser = getParser();
    const langMod = loadParser(lang);
    if (!langMod) return null;

    p = new TSParser();
    p.setLanguage(langMod);
    this.parserCache.set(lang.name, p);
    return p;
  }

  extract(source: string, filePath: string, lang: LanguageConfig): ExtractionResult {
    const parser = this.getOrCreate(lang);
    if (!parser) return { nodes: [], edges: [], unresolvedRefs: [] };

    const tree = parser.parse(source);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const unresolvedRefs: UnresolvedRef[] = [];

    this.walk(tree.rootNode, filePath, lang.name, nodes, edges, unresolvedRefs, source);
    return { nodes, edges, unresolvedRefs };
  }

  private walk(
    node: any, filePath: string, language: string,
    nodes: GraphNode[], edges: GraphEdge[], refs: UnresolvedRef[],
    source: string, parentId?: string
  ): void {
    const extracted = this.extractSymbol(node, filePath, language, source);

    if (extracted) {
      nodes.push(extracted);
      if (parentId) {
        edges.push({
          id: GraphDatabase.edgeId(parentId, extracted.id, 'contains'),
          sourceId: parentId, targetId: extracted.id, kind: 'contains',
        });
      }
      this.extractRefs(node, extracted.id, filePath, refs, source);
      for (const child of node.children || [])
        this.walk(child, filePath, language, nodes, edges, refs, source, extracted.id);
    } else {
      for (const child of node.children || [])
        this.walk(child, filePath, language, nodes, edges, refs, source, parentId);
    }
  }

  private extractSymbol(node: any, filePath: string, lang: string, source: string): GraphNode | null {
    const type = node.type;
    let kind: NodeKind | null = null;
    let name: string | null = null;

    if (FUNCTION_TYPES.has(type))       kind = 'function';
    else if (METHOD_TYPES.has(type))    kind = 'method';
    else if (CLASS_TYPES.has(type))     kind = 'class';
    else if (INTERFACE_TYPES.has(type)) kind = 'interface';
    else if (STRUCT_TYPES.has(type))    kind = 'struct';
    else if (ENUM_TYPES.has(type))      kind = 'enum';
    else if (MODULE_TYPES.has(type))    kind = 'namespace';
    else if (type === 'trait_item')     kind = 'trait';
    else if (type === 'type_declaration' || type === 'type_spec') kind = 'type';
    else if (type === 'variable_declarator' || type === 'const_item') kind = 'variable';
    else return null;

    name = this.findName(node);
    if (!name) return null;

    // Upgrade function to method inside class body
    if (kind === 'function' && node.parent && CLASS_BODY_TYPES.has(node.parent.type))
      kind = 'method';

    // Detect React components (PascalCase function returning JSX)
    if (kind === 'function' && /^[A-Z]/.test(name) && (lang === 'typescript' || lang === 'javascript'))
      kind = 'component';

    // Detect hooks
    if (kind === 'function' && /^use[A-Z]/.test(name))
      kind = 'hook';

    // Detect test functions
    if (kind === 'function' && /^(test|it|describe|spec)/i.test(name))
      kind = 'test';

    // Export detection
    let exported = false;
    if (node.parent) {
      const pt = node.parent.type;
      if (pt === 'export_statement' || pt === 'export_declaration' || pt === 'decorated_definition')
        exported = true;
    }
    const prefix = source.slice(node.startIndex, Math.min(node.startIndex + 20, node.endIndex));
    if (/^(pub |public |export )/.test(prefix)) exported = true;

    // Complexity estimate (count branches)
    const complexity = this.estimateComplexity(node, source);

    // Signature extraction
    const signature = this.extractSignature(node, source);
    const docstring = this.extractDocstring(node, source);
    const qualifiedName = this.qualifiedName(filePath, name, kind);
    const id = GraphDatabase.nodeId(kind, filePath, name, node.startPosition.row + 1);

    return {
      id, kind, name, qualifiedName, filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      language: lang, signature: signature || undefined,
      docstring: docstring || undefined, exported, complexity,
    };
  }

  private extractRefs(node: any, fromId: string, filePath: string, refs: UnresolvedRef[], source: string): void {
    this.findAll(node, CALL_TYPES, n => {
      const callee = this.findName(n) || this.findChildText(n, 'function');
      if (callee) refs.push({ fromNodeId: fromId, refName: callee, refKind: 'calls', filePath });
    });
    this.findAll(node, IMPORT_TYPES, n => {
      const p = this.extractImportPath(n, source);
      if (p) refs.push({ fromNodeId: fromId, refName: p, refKind: 'imports', filePath });
    });
    this.findAll(node, EXTENDS_TYPES, n => {
      const parent = this.findName(n);
      if (parent) refs.push({
        fromNodeId: fromId, refName: parent,
        refKind: n.type.includes('implement') ? 'implements' : 'extends', filePath,
      });
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private findName(node: any): string | null {
    for (const field of ['name', 'identifier', 'type_identifier', 'property_name']) {
      const child = node.childForFieldName?.(field);
      if (child?.text) return child.text;
    }
    for (const c of node.namedChildren || []) {
      if (['identifier', 'type_identifier', 'property_identifier'].includes(c.type))
        return c.text;
    }
    for (const c of node.children || []) {
      for (const gc of c.children || []) {
        if (gc.type === 'identifier') return gc.text;
      }
    }
    return null;
  }

  private findChildText(node: any, field: string): string | null {
    const c = node.childForFieldName?.(field);
    return c?.text || null;
  }

  private extractSignature(node: any, source: string): string | null {
    const text = source.slice(node.startIndex, node.endIndex);
    const bodyStart = text.indexOf('{');
    if (bodyStart > 0) return text.slice(0, bodyStart).trim().slice(0, 300);
    const colonIdx = text.indexOf(':');
    if (colonIdx > 0 && colonIdx < 200) return text.slice(0, colonIdx).trim();
    const line = text.split('\n')[0];
    return line.length > 300 ? line.slice(0, 300) + '...' : line;
  }

  private extractDocstring(node: any, source: string): string | null {
    const prev = node.previousNamedSibling;
    if (prev && /comment|doc_comment|block_comment/.test(prev.type))
      return prev.text.slice(0, 500);
    if (node.namedChildren?.[0]?.type === 'expression_statement') {
      const str = node.namedChildren[0].namedChildren?.[0];
      if (str && /string|concatenated_string/.test(str.type))
        return str.text.slice(0, 500);
    }
    return null;
  }

  private extractImportPath(node: any, source: string): string | null {
    const text = source.slice(node.startIndex, node.endIndex);
    for (const re of [
      /from\s+['"]([^'"]+)['"]/,
      /import\s+['"]([^'"]+)['"]/,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
      /use\s+([\w:]+)/,
    ]) {
      const m = text.match(re);
      if (m) return m[1];
    }
    return null;
  }

  private estimateComplexity(node: any, source: string): number {
    const text = source.slice(node.startIndex, node.endIndex);
    let c = 1;
    const branches = /\b(if|else|for|while|switch|case|catch|&&|\|\||\?|match)\b/g;
    let m;
    while ((m = branches.exec(text)) !== null) c++;
    return Math.min(c, 100);
  }

  private qualifiedName(filePath: string, name: string, kind: NodeKind): string {
    const parts = filePath.replace(/\.[^.]+$/, '').split('/');
    // Keep all meaningful segments (skip only common entry-point filenames, not directories)
    const entryFiles = new Set(['index', 'main', 'mod']);
    const cleaned = parts.filter((p, i) =>
      i < parts.length - 1 ? true : !entryFiles.has(p)
    );
    // Use up to 3 trailing segments for sufficient uniqueness
    return [...cleaned.slice(-3), name].join('.');
  }

  private findAll(node: any, types: Set<string>, cb: (n: any) => void): void {
    if (types.has(node.type)) cb(node);
    for (const child of node.children || []) this.findAll(child, types, cb);
  }
}
