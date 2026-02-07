#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import os from 'os';
import readline from 'readline';
import { GraphDatabase } from '../core/database';
import { Indexer } from '../core/indexer';
import { ContextBuilder } from '../core/context';
import { MCPServer } from '../mcp/server';
import {
  loadConfig, saveConfig, createConfig, dbPath, configDir,
  isInitialized, ensureGitignore, installHook, removeHook, isHookInstalled,
} from '../utils/config';

// ─── Colors ───────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
};

const LOGO = `
${c.cyan}${c.bold}   ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗██████╗  █████╗ ██╗   ██╗
  ██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝██╔══██╗██╔══██╗╚██╗ ██╔╝
  ██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ ██████╔╝███████║ ╚████╔╝
  ██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ ██╔══██╗██╔══██║  ╚██╔╝
  ╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗██║  ██║██║  ██║   ██║
   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝${c.reset}
${c.dim}  X-ray vision for your codebase — semantic graph for AI agents${c.reset}
`;

// ─── Prompt Helpers ───────────────────────────────────────────

function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => { rl.question(q, a => { rl.close(); r(a.trim()); }); });
}

async function confirm(q: string, def = true): Promise<boolean> {
  const a = await ask(`${q} ${c.dim}${def ? '[Y/n]' : '[y/N]'}${c.reset} `);
  return a ? a.toLowerCase().startsWith('y') : def;
}

// ─── Claude Code Integration ──────────────────────────────────

const CXR_TOOLS = [
  'mcp__codexray__codexray_search', 'mcp__codexray__codexray_context',
  'mcp__codexray__codexray_callers', 'mcp__codexray__codexray_callees',
  'mcp__codexray__codexray_impact', 'mcp__codexray__codexray_node',
  'mcp__codexray__codexray_deps', 'mcp__codexray__codexray_overview',
  'mcp__codexray__codexray_deadcode', 'mcp__codexray__codexray_hotspots',
  'mcp__codexray__codexray_files', 'mcp__codexray__codexray_status',
  'mcp__codexray__codexray_semantic', 'mcp__codexray__codexray_path',
  'mcp__codexray__codexray_circular', 'mcp__codexray__codexray_complexity',
];

function claudeConfigPath(): string { return path.join(os.homedir(), '.claude.json'); }

function loadClaudeCfg(): any {
  const p = claudeConfigPath();
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return {}; }
}

function saveClaudeCfg(cfg: any): void {
  fs.writeFileSync(claudeConfigPath(), JSON.stringify(cfg, null, 2));
}

function isWin(): boolean { return process.platform === 'win32'; }

function configureClaudeCode(): { ok: boolean; msg: string } {
  try {
    const cfg = loadClaudeCfg();

    // MCP server — top level mcpServers
    if (!cfg.mcpServers) cfg.mcpServers = {};
    cfg.mcpServers.codexray = isWin()
      ? { command: 'cmd', args: ['/c', 'npx', '-y', 'codexray', 'serve'] }
      : { command: 'npx', args: ['-y', 'codexray', 'serve'] };

    // Auto-allow permissions for all CodeXRay tools
    if (!cfg.autoAllowPermissions) cfg.autoAllowPermissions = [];
    for (const t of CXR_TOOLS) {
      if (!cfg.autoAllowPermissions.includes(t)) cfg.autoAllowPermissions.push(t);
    }

    saveClaudeCfg(cfg);
    return { ok: true, msg: 'Claude Code configured' };
  } catch (e: any) {
    return { ok: false, msg: e.message };
  }
}

function isClaudeConfigured(): boolean {
  return !!loadClaudeCfg().mcpServers?.codexray;
}

function removeClaudeConfig(): boolean {
  try {
    const cfg = loadClaudeCfg();
    if (cfg.mcpServers?.codexray) delete cfg.mcpServers.codexray;
    if (cfg.autoAllowPermissions) {
      cfg.autoAllowPermissions = cfg.autoAllowPermissions.filter(
        (t: string) => !t.startsWith('mcp__codexray__')
      );
    }
    saveClaudeCfg(cfg);
    return true;
  } catch { return false; }
}

// ─── CLAUDE.md ────────────────────────────────────────────────

const CLAUDE_MD = `# CodeXRay — AI Agent Instructions

This project uses CodeXRay for semantic code intelligence. Use these MCP tools instead of scanning files.

## Primary Tools (use first)
- **codexray_overview** — project structure, languages, key symbols
- **codexray_context** — task-relevant code context (replaces multi-file reads)
- **codexray_search** — find symbols by name/keyword (faster than grep)
- **codexray_semantic** — find code by meaning ("authentication" → login, validateToken)

## Exploration
- **codexray_node** — detailed symbol info + source code
- **codexray_callers/callees** — trace call relationships
- **codexray_deps** — full dependency tree
- **codexray_path** — shortest connection between two symbols

## Analysis
- **codexray_impact** — blast radius before changes
- **codexray_hotspots** — most critical symbols (highest connectivity)
- **codexray_deadcode** — find unused code
- **codexray_circular** — detect circular dependencies
- **codexray_complexity** — find high-complexity functions
- **codexray_files** — browse file structure
- **codexray_status** — index health

## Key Principle
Query the graph instead of scanning files. One codexray_context call replaces 5-10 file reads.
`;

function writeClaudeMD(root: string): void {
  const p = path.join(root, 'CLAUDE.md');
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf-8');
    if (content.includes('CodeXRay')) return;
    fs.appendFileSync(p, '\n\n' + CLAUDE_MD);
  } else {
    fs.writeFileSync(p, CLAUDE_MD);
  }
}

// ─── Index Helper ─────────────────────────────────────────────

async function runIndex(root: string, opts: { force?: boolean; quiet?: boolean }): Promise<void> {
  if (!isInitialized(root)) {
    const dir = configDir(root);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    createConfig(root);
  }

  const config = loadConfig(root);
  const db = new GraphDatabase(dbPath(root));
  const indexer = new Indexer(db, root, config);
  const spin = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let f = 0;

  const result = await indexer.indexAll({
    force: opts.force,
    onProgress: p => {
      if (opts.quiet) return;
      const s = spin[f++ % spin.length];
      if (p.phase === 'scanning') process.stdout.write(`\r  ${c.cyan}${s}${c.reset} Scanning...`);
      else if (p.phase === 'parsing') process.stdout.write(`\r  ${c.cyan}${s}${c.reset} ${c.bold}${p.current}${c.reset}/${p.total}: ${c.dim}${p.file || ''}${c.reset}                    `);
      else if (p.phase === 'resolving') process.stdout.write(`\r  ${c.cyan}${s}${c.reset} Resolving references...                                   `);
    },
  });

  // Build semantic search index after parsing
  if (!opts.quiet) process.stdout.write(`\r  ${c.cyan}⠿${c.reset} Building semantic search index...                          `);
  db.buildSearchIndex();

  db.close();
  if (!opts.quiet) {
    process.stdout.write('\r');
    console.log(`  ${c.green}✓${c.reset} Indexed ${c.bold}${result.filesIndexed}${c.reset} files in ${c.dim}${result.durationMs}ms${c.reset}`);
    console.log(`    ${c.dim}${result.nodesCreated} symbols, ${result.edgesCreated} edges, semantic index built${c.reset}`);
    if (result.errors.length) console.log(`    ${c.yellow}${result.errors.length} parse errors${c.reset}`);
  }
}

// ─── Interactive Installer ────────────────────────────────────

async function installer(): Promise<void> {
  console.log(LOGO);

  // Check Node.js version
  const nodeVer = parseInt(process.version.slice(1));
  if (nodeVer < 18) {
    console.log(`  ${c.red}✗${c.reset} Node.js ${c.bold}18+${c.reset} required (you have ${process.version})`);
    console.log(`  ${c.dim}Install from https://nodejs.org${c.reset}\n`);
    process.exit(1);
  }

  // Step 1: Claude Code integration
  if (isClaudeConfigured()) {
    console.log(`  ${c.green}✓${c.reset} Claude Code MCP server already configured\n`);
    const redo = await confirm(`  ${c.yellow}?${c.reset} Reconfigure?`, false);
    if (redo) {
      const r = configureClaudeCode();
      console.log(`  ${r.ok ? c.green + '✓' : c.red + '✗'} ${r.msg}${c.reset}`);
    }
  } else {
    console.log(`  ${c.blue}ℹ${c.reset} Setting up Claude Code integration...\n`);
    const setup = await confirm(`  ${c.yellow}?${c.reset} Configure CodeXRay MCP server for Claude Code?`);
    if (setup) {
      const r = configureClaudeCode();
      if (r.ok) {
        console.log(`  ${c.green}✓${c.reset} MCP server → ${c.dim}~/.claude.json${c.reset}`);
        console.log(`  ${c.green}✓${c.reset} Auto-allow → ${CXR_TOOLS.length} tools`);
        if (isWin()) console.log(`  ${c.green}✓${c.reset} Windows cmd /c wrapping applied`);
      } else {
        console.log(`  ${c.red}✗${c.reset} ${r.msg}`);
      }
    }
  }

  // Step 2: Current project
  const cwd = process.cwd();
  const name = path.basename(cwd);
  console.log('');
  const init = await confirm(`  ${c.yellow}?${c.reset} Initialize CodeXRay in ${c.cyan}${name}${c.reset}?`);

  if (init) {
    const dir = configDir(cwd);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    createConfig(cwd);
    ensureGitignore(cwd);
    console.log(`  ${c.green}✓${c.reset} Created .codexray/`);

    if (fs.existsSync(path.join(cwd, '.git'))) {
      const hooks = await confirm(`  ${c.yellow}?${c.reset} Install git hook for auto-sync?`);
      if (hooks) {
        const ok = installHook(cwd);
        console.log(ok ? `  ${c.green}✓${c.reset} Git hook installed` : `  ${c.yellow}!${c.reset} Hook failed`);
      }
    }

    const addMd = await confirm(`  ${c.yellow}?${c.reset} Add CodeXRay instructions to CLAUDE.md?`);
    if (addMd) { writeClaudeMD(cwd); console.log(`  ${c.green}✓${c.reset} CLAUDE.md updated`); }

    const doIndex = await confirm(`  ${c.yellow}?${c.reset} Index the project now?`);
    if (doIndex) { console.log(''); await runIndex(cwd, {}); }
  }

  console.log(`
  ${c.green}${c.bold}Setup complete!${c.reset}

  ${c.bold}Next steps:${c.reset}
  ${c.dim}1.${c.reset} Restart Claude Code for the MCP server to load
  ${c.dim}2.${c.reset} Start coding — Claude uses CodeXRay's ${CXR_TOOLS.length} tools automatically
  ${c.dim}3.${c.reset} New projects: ${c.cyan}codexray init --index${c.reset}

  ${c.dim}Install via any package manager:${c.reset}
    ${c.cyan}npx codexray${c.reset}              ${c.dim}# zero-install${c.reset}
    ${c.cyan}npm i -g codexray${c.reset}          ${c.dim}# npm global${c.reset}
    ${c.cyan}pnpm add -g codexray${c.reset}       ${c.dim}# pnpm${c.reset}
    ${c.cyan}yarn global add codexray${c.reset}    ${c.dim}# yarn${c.reset}
    ${c.cyan}bun add -g codexray${c.reset}         ${c.dim}# bun${c.reset}
`);
}

// ─── CLI Commands ─────────────────────────────────────────────

const program = new Command();

program.name('codexray').description('X-ray vision for your codebase — semantic graph for AI agents').version('2.0.0')
  .action(async () => { await installer(); });

program.command('install').description('Interactive Claude Code installer')
  .action(async () => { await installer(); });

program.command('init').description('Initialize CodeXRay in a project')
  .argument('[path]', 'Project directory', '.')
  .option('-i, --index', 'Index immediately')
  .option('--no-hooks', 'Skip git hook')
  .option('--claude-md', 'Write CLAUDE.md')
  .action(async (dir: string, opts: any) => {
    const root = path.resolve(dir);
    console.log(`\n  ${c.cyan}Initializing${c.reset} in ${c.dim}${root}${c.reset}\n`);
    const d = configDir(root);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    createConfig(root);
    ensureGitignore(root);
    console.log(`  ${c.green}✓${c.reset} Created .codexray/`);
    if (opts.hooks !== false && fs.existsSync(path.join(root, '.git'))) {
      if (installHook(root)) console.log(`  ${c.green}✓${c.reset} Git hook installed`);
    }
    if (opts.claudeMd) { writeClaudeMD(root); console.log(`  ${c.green}✓${c.reset} CLAUDE.md`); }
    if (opts.index) { console.log(''); await runIndex(root, {}); }
    console.log(`\n  ${c.green}Done!${c.reset}\n`);
  });

program.command('index').description('Index all files')
  .argument('[path]', 'Project directory', '.')
  .option('-f, --force', 'Force re-index').option('-q, --quiet', 'Quiet')
  .action(async (dir: string, opts: any) => {
    await runIndex(path.resolve(dir), { force: opts.force, quiet: opts.quiet });
  });

program.command('sync').description('Incremental sync')
  .argument('[path]', '', '.').option('-q, --quiet', 'Quiet')
  .action(async (dir: string, opts: any) => {
    const root = path.resolve(dir);
    if (!isInitialized(root)) { if (!opts.quiet) console.log(`  ${c.yellow}!${c.reset} Not initialized.`); return; }
    const config = loadConfig(root);
    const db = new GraphDatabase(dbPath(root));
    const indexer = new Indexer(db, root, config);
    const r = await indexer.sync();
    db.buildSearchIndex();
    db.close();
    if (!opts.quiet) console.log(`  ${c.green}✓${c.reset} Synced in ${c.dim}${r.durationMs}ms${c.reset}: +${r.added} ~${r.modified} -${r.removed}`);
  });

program.command('watch').description('Real-time file watching')
  .argument('[path]', '', '.')
  .action(async (dir: string) => {
    const root = path.resolve(dir);
    if (!isInitialized(root)) { console.log(`  ${c.yellow}!${c.reset} Not initialized.`); return; }
    const config = loadConfig(root);
    const db = new GraphDatabase(dbPath(root));
    const indexer = new Indexer(db, root, config);
    console.log(`  ${c.cyan}👁${c.reset}  Watching ${c.dim}${root}${c.reset}... (Ctrl+C to stop)\n`);
    const w = await indexer.watch((ev, file) => {
      const icon = ev === 'delete' ? c.red + '✗' : ev === 'error' ? c.yellow + '!' : c.green + '✓';
      console.log(`  ${icon}${c.reset} ${ev}: ${c.dim}${file}${c.reset}`);
    });
    process.on('SIGINT', () => { w.close(); db.close(); process.exit(0); });
  });

program.command('status').description('Index statistics')
  .argument('[path]', '', '.')
  .action((dir: string) => {
    const root = path.resolve(dir);
    if (!isInitialized(root)) { console.log(`  ${c.yellow}!${c.reset} Not initialized.`); return; }
    const db = new GraphDatabase(dbPath(root));
    const s = db.getStats();
    db.close();
    console.log(`\n  ${c.bold}CodeXRay Status${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(35)}${c.reset}`);
    console.log(`  Files:   ${s.totalFiles}`);
    console.log(`  Symbols: ${s.totalNodes}`);
    console.log(`  Edges:   ${s.totalEdges}`);
    console.log(`  Lines:   ${s.totalLines}`);
    console.log(`  Langs:   ${Object.entries(s.filesByLanguage).map(([l, n]) => `${l}:${n}`).join(' ')}`);
    console.log(`  Claude:  ${isClaudeConfigured() ? c.green + 'configured ✓' : c.yellow + 'not set up'}${c.reset}`);
    console.log(`  Hook:    ${isHookInstalled(root) ? c.green + 'installed ✓' : c.dim + 'none'}${c.reset}\n`);
  });

program.command('query').description('Search symbols')
  .argument('<query>').option('-k, --kind <kind>').option('-n, --limit <n>', '', '20').option('-p, --path <p>', '', '.')
  .action((query: string, opts: any) => {
    const root = path.resolve(opts.path);
    if (!isInitialized(root)) { console.log(`  ${c.yellow}!${c.reset} Not initialized.`); return; }
    const db = new GraphDatabase(dbPath(root));
    const results = db.searchNodes(query, opts.kind, parseInt(opts.limit));
    db.close();
    if (!results.length) { console.log(`  ${c.dim}No results${c.reset}`); return; }
    for (const n of results) {
      console.log(`  ${n.exported ? c.green + '📦' : '  '} [${n.kind}] ${c.bold}${n.name}${c.reset}  ${c.dim}${n.filePath}:${n.startLine}${c.reset}`);
      if (n.signature) console.log(`    ${c.dim}${n.signature.slice(0, 120)}${c.reset}`);
    }
  });

program.command('semantic').description('Semantic search by meaning')
  .argument('<query>').option('-n, --limit <n>', '', '20').option('-p, --path <p>', '', '.')
  .action((query: string, opts: any) => {
    const root = path.resolve(opts.path);
    if (!isInitialized(root)) { console.log(`  ${c.yellow}!${c.reset} Not initialized.`); return; }
    const db = new GraphDatabase(dbPath(root));
    const results = db.semanticSearch(query, parseInt(opts.limit));
    db.close();
    if (!results.length) { console.log(`  ${c.dim}No semantic matches${c.reset}`); return; }
    for (const { node: n, score } of results) {
      console.log(`  ${c.magenta}${score.toFixed(1)}${c.reset} [${n.kind}] ${c.bold}${n.name}${c.reset}  ${c.dim}${n.filePath}:${n.startLine}${c.reset}`);
    }
  });

program.command('context').description('Build task context')
  .argument('<query>').option('-n, --max-nodes <n>', '', '25').option('-f, --format <f>', '', 'markdown').option('-p, --path <p>', '', '.')
  .action((query: string, opts: any) => {
    const root = path.resolve(opts.path);
    if (!isInitialized(root)) { console.log(`  ${c.yellow}!${c.reset} Not initialized.`); return; }
    const db = new GraphDatabase(dbPath(root));
    const ctx = new ContextBuilder(db, root);
    const r = ctx.build(query, { maxNodes: parseInt(opts.maxNodes), format: opts.format });
    console.log(ctx.format(r, opts.format));
    db.close();
  });

program.command('overview').description('Project overview')
  .argument('[path]', '', '.')
  .action((dir: string) => {
    const root = path.resolve(dir);
    if (!isInitialized(root)) { console.log(`  ${c.yellow}!${c.reset} Not initialized.`); return; }
    const db = new GraphDatabase(dbPath(root));
    const ctx = new ContextBuilder(db, root);
    console.log(ctx.buildOverview());
    db.close();
  });

program.command('hooks').description('Manage git hooks')
  .argument('<action>').argument('[path]', '', '.')
  .action((action: string, dir: string) => {
    const root = path.resolve(dir);
    if (action === 'install') console.log(installHook(root) ? `  ${c.green}✓${c.reset} Installed` : `  ${c.red}✗${c.reset} Failed`);
    else if (action === 'remove') console.log(removeHook(root) ? `  ${c.green}✓${c.reset} Removed` : `  ${c.dim}None found${c.reset}`);
    else if (action === 'status') console.log(isHookInstalled(root) ? `  ${c.green}✓${c.reset} Installed` : `  ${c.dim}Not installed${c.reset}`);
    else console.log(`  ${c.red}Unknown:${c.reset} ${action}`);
  });

program.command('serve').description('Start MCP server (for Claude Code)')
  .argument('[path]', '', '.')
  .action(async (dir: string) => { await new MCPServer(path.resolve(dir)).start(); });

program.command('uninstall').description('Remove from Claude Code config')
  .action(() => {
    console.log(removeClaudeConfig() ? `  ${c.green}✓${c.reset} Removed from ~/.claude.json` : `  ${c.dim}Nothing to remove${c.reset}`);
  });

program.parse(process.argv);
