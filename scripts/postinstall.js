#!/usr/bin/env node
const c = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m' };

// Check Node.js version
const major = parseInt(process.version.slice(1));
if (major < 18) {
  console.log(`\n  ${c.yellow}⚠ CodeXRay requires Node.js 18+ (you have ${process.version})${c.reset}`);
  console.log(`  ${c.dim}Install from https://nodejs.org${c.reset}\n`);
  process.exit(0);
}

console.log(`
${c.cyan}${c.bold}  CodeXRay${c.reset} installed successfully!

  ${c.bold}Quick Start:${c.reset}
  ${c.green}codexray${c.reset}           Interactive Claude Code installer
  ${c.green}codexray init -i${c.reset}   Initialize + index project
  ${c.green}cxr status${c.reset}         Check index health

  ${c.bold}All package managers:${c.reset}
  ${c.dim}npx codexray • pnpm dlx codexray • bunx codexray${c.reset}

  ${c.dim}Run ${c.cyan}codexray${c.reset}${c.dim} with no args to set up Claude Code integration.${c.reset}
`);
