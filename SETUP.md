# Publishing CodeXRay to npm

## Prerequisites

```bash
# Ensure Node.js 18+
node -v

# Login to npm
npm login
npm whoami
```

## Step 1: Update Package Identity

Edit `package.json` — change `name`, `author`, `repository.url` to your own.

## Step 2: Create GitHub Repo

```bash
cd codexray
git init && git add -A && git commit -m "Initial commit"
gh repo create codexray --public --source=. --push
```

## Step 3: Build & Test

```bash
npm install
npm run build
npm test
```

## Step 4: Publish

```bash
# Option A: Direct
npm publish --access public

# Option B: Helper script
chmod +x scripts/publish.sh
./scripts/publish.sh patch    # or minor, major

# Option C: CI/CD — tag a release, GitHub Actions auto-publishes
npm version patch
git push && git push --tags
```

## Step 5: Verify

```bash
npm info codexray
npx codexray --version
```

## Users Install With

```bash
# Zero-install (recommended for all package managers)
npx codexray
pnpm dlx codexray
bunx codexray

# Global install
npm install -g codexray
pnpm add -g codexray
yarn global add codexray
bun add -g codexray

# Then in any project
codexray init --index
cxr init -i
```

## Registries

npm is the primary registry. pnpm, yarn, and bun all pull from the npm registry by default, so a single `npm publish` makes the package available everywhere.

Bun has its own bundler but reads `package.json` bin entries identically to Node.js, so `bunx codexray` and `bun add -g codexray` work with zero changes.
