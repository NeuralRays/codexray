import fs from 'fs';
import path from 'path';

// ─── Config Types ─────────────────────────────────────────────

export interface CodeXRayConfig {
  version: number;
  projectName: string;
  languages: string[];
  exclude: string[];
  frameworks: string[];
  maxFileSize: number;
  gitHooksEnabled: boolean;
}

const DEFAULT_CONFIG: CodeXRayConfig = {
  version: 1, projectName: '', languages: [],
  exclude: [
    'node_modules/**', 'dist/**', 'build/**', '.git/**', 'vendor/**',
    '__pycache__/**', '.next/**', '.nuxt/**', 'coverage/**', '.codexray/**',
    '*.min.js', '*.min.css', '*.bundle.js', '*.map', 'target/**',
    'out/**', 'bin/**', '.venv/**', 'venv/**', 'env/**',
  ],
  frameworks: [], maxFileSize: 1048576, gitHooksEnabled: true,
};

export const DIR = '.codexray';
export const DB_NAME = 'codexray.db';

export function configDir(root: string): string { return path.join(root, DIR); }
export function dbPath(root: string): string { return path.join(root, DIR, DB_NAME); }
export function configPath(root: string): string { return path.join(root, DIR, 'config.json'); }

export function isInitialized(root: string): boolean {
  return fs.existsSync(configDir(root)) && fs.existsSync(dbPath(root));
}

export function loadConfig(root: string): CodeXRayConfig {
  const p = configPath(root);
  if (!fs.existsSync(p)) return { ...DEFAULT_CONFIG, projectName: path.basename(root) };
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(p, 'utf-8')) }; }
  catch { return { ...DEFAULT_CONFIG, projectName: path.basename(root) }; }
}

export function saveConfig(root: string, config: CodeXRayConfig): void {
  const dir = configDir(root);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(root), JSON.stringify(config, null, 2));
}

export function createConfig(root: string): CodeXRayConfig {
  const c = { ...DEFAULT_CONFIG, projectName: path.basename(root) };
  saveConfig(root, c);
  return c;
}

export function ensureGitignore(root: string): void {
  const p = path.join(root, '.gitignore');
  const entry = '.codexray/';
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf-8');
    if (!content.includes(entry)) fs.appendFileSync(p, `\n# CodeXRay\n${entry}\n`);
  }
}

// ─── Git Hooks ────────────────────────────────────────────────

const HOOK_MARKER = '# codexray-auto-sync';
const HOOK_SCRIPT = `#!/bin/sh\n${HOOK_MARKER}\nif command -v codexray >/dev/null 2>&1; then codexray sync --quiet &\nelif command -v npx >/dev/null 2>&1; then npx codexray sync --quiet &\nfi\n`;

export function installHook(root: string): boolean {
  const hooksDir = path.join(root, '.git', 'hooks');
  if (!fs.existsSync(path.join(root, '.git'))) return false;
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

  const hookPath = path.join(hooksDir, 'post-commit');
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf-8');
    if (existing.includes(HOOK_MARKER)) return true;
    fs.appendFileSync(hookPath, `\n${HOOK_SCRIPT}`);
  } else {
    fs.writeFileSync(hookPath, HOOK_SCRIPT);
  }
  fs.chmodSync(hookPath, '755');
  return true;
}

export function removeHook(root: string): boolean {
  const hookPath = path.join(root, '.git', 'hooks', 'post-commit');
  if (!fs.existsSync(hookPath)) return false;
  const content = fs.readFileSync(hookPath, 'utf-8');
  if (!content.includes(HOOK_MARKER)) return false;
  // Remove our block
  const cleaned = content.split('\n').filter(l => !l.includes('codexray')).join('\n').trim();
  if (!cleaned || cleaned === '#!/bin/sh') fs.unlinkSync(hookPath);
  else fs.writeFileSync(hookPath, cleaned + '\n');
  return true;
}

export function isHookInstalled(root: string): boolean {
  const p = path.join(root, '.git', 'hooks', 'post-commit');
  return fs.existsSync(p) && fs.readFileSync(p, 'utf-8').includes(HOOK_MARKER);
}
