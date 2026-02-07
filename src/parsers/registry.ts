import path from 'path';

export interface LanguageConfig {
  name: string;
  extensions: string[];
  treeSitterPackage: string;
}

export const LANGUAGES: LanguageConfig[] = [
  { name: 'typescript', extensions: ['.ts', '.tsx'], treeSitterPackage: 'tree-sitter-typescript' },
  { name: 'javascript', extensions: ['.js', '.jsx', '.mjs', '.cjs'], treeSitterPackage: 'tree-sitter-javascript' },
  { name: 'python',     extensions: ['.py', '.pyw'], treeSitterPackage: 'tree-sitter-python' },
  { name: 'go',         extensions: ['.go'], treeSitterPackage: 'tree-sitter-go' },
  { name: 'rust',       extensions: ['.rs'], treeSitterPackage: 'tree-sitter-rust' },
  { name: 'java',       extensions: ['.java'], treeSitterPackage: 'tree-sitter-java' },
  { name: 'csharp',     extensions: ['.cs'], treeSitterPackage: 'tree-sitter-c-sharp' },
  { name: 'php',        extensions: ['.php'], treeSitterPackage: 'tree-sitter-php' },
  { name: 'ruby',       extensions: ['.rb'], treeSitterPackage: 'tree-sitter-ruby' },
  { name: 'c',          extensions: ['.c', '.h'], treeSitterPackage: 'tree-sitter-c' },
  { name: 'cpp',        extensions: ['.cpp', '.hpp', '.cc', '.cxx', '.hxx', '.hh'], treeSitterPackage: 'tree-sitter-cpp' },
  { name: 'swift',      extensions: ['.swift'], treeSitterPackage: 'tree-sitter-swift' },
  { name: 'kotlin',     extensions: ['.kt', '.kts'], treeSitterPackage: 'tree-sitter-kotlin' },
];

const extMap = new Map<string, LanguageConfig>();
for (const lang of LANGUAGES) for (const ext of lang.extensions) extMap.set(ext, lang);

export function detectLanguage(filePath: string): LanguageConfig | undefined {
  return extMap.get(path.extname(filePath).toLowerCase());
}

export function allExtensions(): string[] {
  return LANGUAGES.flatMap(l => l.extensions);
}

export function loadParser(lang: LanguageConfig): any {
  try {
    const mod = require(lang.treeSitterPackage);
    if (lang.name === 'typescript') return mod.typescript || mod;
    if (lang.name === 'php') return mod.php || mod;
    return mod;
  } catch { return null; }
}
