#!/bin/bash
set -e

VERSION_TYPE=${1:-patch}

echo "🔬 CodeXRay — Publishing..."
echo ""

# Build & test
echo "📦 Building..."
npm run build

echo "🧪 Testing..."
npm test

# Bump version
echo "📈 Bumping $VERSION_TYPE version..."
npm version $VERSION_TYPE --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")

# Publish
echo "🚀 Publishing v$VERSION..."
npm publish --access public

# Git tag
echo "🏷️  Tagging..."
git add package.json package-lock.json
git commit -m "chore: release v$VERSION"
git tag "v$VERSION"
git push && git push --tags

echo ""
echo "✅ Published codexray@$VERSION"
