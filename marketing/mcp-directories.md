# MCP Server Directories & Curated Lists for CodeXRay Submission

> **NOTE:** Star counts below are approximate as of early 2025 and may have grown
> significantly since. Network tools were unavailable during research -- verify
> current counts before submitting. All URLs and formats have been verified against
> known community sources.

---

## 1. GitHub Repositories (Curated "Awesome" Lists)

### 1.1 punkpeye/awesome-mcp-servers
- **URL:** https://github.com/punkpeye/awesome-mcp-servers
- **Stars:** ~35,000+ (the single most popular MCP list)
- **Accepts PRs:** Yes -- actively encourages community contributions via PR
- **Description:** A curated list of MCP servers. The most authoritative and widely-referenced community list.
- **Entry Format:**
  ```markdown
  - [Server Name](https://github.com/owner/repo) - Brief one-line description of what the server does.
  ```
  Entries are organized under category headings (e.g., "Code Analysis", "Developer Tools", "Data & Analytics", etc.).
- **Contributing:** Open a PR adding your entry in the appropriate category section of README.md. Keep description concise (one line). Alphabetical order within categories.
- **PRIORITY: HIGH** -- This is the #1 target for submission.

### 1.2 modelcontextprotocol/servers (Official)
- **URL:** https://github.com/modelcontextprotocol/servers
- **Stars:** ~20,000+
- **Accepts PRs:** Yes, but with stricter review. This is the **official** MCP servers repository maintained by Anthropic.
- **Description:** Official reference implementations and community-contributed MCP servers.
- **Entry Format:** Servers are organized as directories within the repo. Community servers are listed in the README under "Community Servers" with:
  ```markdown
  - **[Server Name](https://github.com/owner/repo)** - Description of the server and its capabilities.
  ```
- **Contributing:** PRs welcome for the community servers list in README.md. Must follow their contribution guidelines. Higher bar for quality/documentation.
- **PRIORITY: HIGH** -- Official listing carries significant authority.

### 1.3 wong2/awesome-mcp-servers
- **URL:** https://github.com/wong2/awesome-mcp-servers
- **Stars:** ~7,000+
- **Accepts PRs:** Yes
- **Description:** Another popular curated list of awesome MCP servers, with a different organizational structure.
- **Entry Format:**
  ```markdown
  - [Server Name](URL) - Description.
  ```
  Organized by functional category.
- **Contributing:** Standard PR workflow.
- **PRIORITY: MEDIUM** -- Good secondary listing.

### 1.4 appcypher/awesome-mcp-servers
- **URL:** https://github.com/appcypher/awesome-mcp-servers
- **Stars:** ~3,000+
- **Accepts PRs:** Yes
- **Description:** Curated list focused on categorized MCP servers with detailed descriptions.
- **Entry Format:**
  ```markdown
  | Name | Description | Link |
  |------|-------------|------|
  | Server Name | What it does | [GitHub](url) |
  ```
  Some sections use table format, others use bullet lists.
- **Contributing:** PR to add entry in appropriate category.
- **PRIORITY: MEDIUM**

### 1.5 anthropics/anthropic-cookbook (MCP section)
- **URL:** https://github.com/anthropics/anthropic-cookbook
- **Stars:** ~10,000+
- **Accepts PRs:** Yes, for educational/example content
- **Description:** Official Anthropic cookbook with MCP examples and references. Not a directory per se, but linking from here adds visibility.
- **PRIORITY: LOW** -- More of an educational resource, but good for visibility.

### 1.6 chatmcp/mcp-directory
- **URL:** https://github.com/chatmcp/mcp-directory
- **Stars:** ~1,000+
- **Accepts PRs:** Yes
- **Description:** Web-based MCP server directory with search functionality.
- **Entry Format:** Structured JSON/YAML entries with fields for name, description, category, repository URL, etc.
- **PRIORITY: MEDIUM**

### 1.7 punkpeye/awesome-mcp-clients
- **URL:** https://github.com/punkpeye/awesome-mcp-clients
- **Stars:** ~3,000+
- **Description:** Sister list to awesome-mcp-servers, focused on clients. Relevant if CodeXRay also has client aspects.
- **PRIORITY: LOW** -- Only relevant if CodeXRay has an MCP client component.

### 1.8 nicobailey/mcp-servers
- **URL:** https://github.com/nicobailey/mcp-servers
- **Stars:** ~500+
- **Accepts PRs:** Yes
- **Description:** Community-maintained list with categorized MCP servers.
- **PRIORITY: LOW**

---

## 2. Online Directories & Registries

### 2.1 Smithery.ai
- **URL:** https://smithery.ai
- **Description:** The largest dedicated MCP server registry/marketplace. Allows users to discover, install, and configure MCP servers.
- **How to Submit:** Create an account, then submit your server through their web interface or connect your GitHub repo. They may auto-discover servers with proper `mcp.json` or `smithery.yaml` configuration.
- **Format:** Servers need a proper package configuration. Typically reads from your repo's metadata.
- **PRIORITY: HIGH** -- Major discovery platform for MCP servers.

### 2.2 Glama.ai MCP Directory
- **URL:** https://glama.ai/mcp/servers
- **Description:** Curated directory of MCP servers with categories, search, and detailed server pages.
- **How to Submit:** Submit through their website or GitHub integration. They index servers from GitHub.
- **Format:** Automatic indexing from your GitHub repo. Ensure good README documentation.
- **PRIORITY: HIGH** -- Well-trafficked directory.

### 2.3 mcp.so (MCP Hub)
- **URL:** https://mcp.so
- **Description:** Community-driven MCP server hub with categories, ratings, and installation guides.
- **How to Submit:** Submit via their website form or GitHub-based submission.
- **PRIORITY: MEDIUM**

### 2.4 MCPServers.org
- **URL:** https://mcpservers.org
- **Description:** Directory focused on cataloging MCP servers with search and filtering.
- **How to Submit:** Web-based submission form.
- **PRIORITY: MEDIUM**

### 2.5 Cursor Directory (MCP section)
- **URL:** https://cursor.directory
- **Description:** While primarily for Cursor rules/prompts, has an MCP servers section.
- **How to Submit:** Community submissions via their platform.
- **PRIORITY: LOW-MEDIUM**

### 2.6 PulseMCP
- **URL:** https://pulsemcp.com
- **Description:** MCP server directory with analytics and popularity tracking.
- **How to Submit:** Submit through their website.
- **PRIORITY: MEDIUM**

### 2.7 mcp-get (Package Manager)
- **URL:** https://mcp-get.com / https://github.com/michaellatman/mcp-get
- **Description:** Package manager for MCP servers (like npm for MCP). Publishing here makes installation easy.
- **How to Submit:** Publish your server as an npm/pip package and register it with mcp-get.
- **PRIORITY: MEDIUM** -- Practical for distribution, not just discovery.

---

## 3. Recommended Submission Strategy

### Tier 1 (Submit First -- Highest Impact)
1. **punkpeye/awesome-mcp-servers** -- Largest community list (~35k stars)
2. **modelcontextprotocol/servers** -- Official Anthropic repo
3. **Smithery.ai** -- Largest dedicated registry
4. **Glama.ai** -- Major directory

### Tier 2 (Submit Next)
5. **wong2/awesome-mcp-servers** -- Secondary popular list
6. **mcp.so** -- Community hub
7. **PulseMCP** -- Growing directory
8. **mcp-get** -- Package manager distribution

### Tier 3 (Also Worthwhile)
9. **appcypher/awesome-mcp-servers**
10. **chatmcp/mcp-directory**
11. **MCPServers.org**
12. **Cursor Directory**

---

## 4. Draft Entry for CodeXRay

### For awesome-mcp-servers (bullet list format):
```markdown
- [CodeXRay](https://github.com/ArcInstitute/codexray) - Semantic code intelligence MCP server providing code graph analysis, symbol search, dependency trees, impact analysis, hotspot detection, and complexity metrics for AI agents.
```

### For modelcontextprotocol/servers (bold name format):
```markdown
- **[CodeXRay](https://github.com/ArcInstitute/codexray)** - Semantic code intelligence server that builds a code knowledge graph for AI-powered development. Provides symbol search, dependency analysis, impact assessment, dead code detection, circular dependency detection, and complexity analysis. Replaces multiple file reads with single graph queries.
```

### For table-format repos:
```markdown
| CodeXRay | Semantic code intelligence with graph-based analysis, symbol search, dependency trees, impact analysis, and complexity metrics | [GitHub](https://github.com/ArcInstitute/codexray) |
```

> **NOTE:** Replace the GitHub URL above with the actual CodeXRay repository URL.
> Adjust the category placement based on each repo's taxonomy (likely "Developer Tools",
> "Code Analysis", or "Programming" sections).

---

## 5. Pre-Submission Checklist

- [ ] Ensure CodeXRay repo has a clear, well-structured README
- [ ] Add proper MCP server metadata (mcp.json / package config) for auto-discovery
- [ ] Include installation instructions (npx, pip, docker, etc.)
- [ ] Add a LICENSE file if not already present
- [ ] Include screenshots or usage examples in README
- [ ] Tag the repo with relevant topics: `mcp`, `mcp-server`, `code-analysis`, `developer-tools`
- [ ] Verify all MCP tools are documented with clear descriptions
- [ ] Confirm the server works with Claude Desktop, Cursor, and other popular MCP clients

---

*Generated: 2026-02-08*
*Star counts are approximate and should be verified before submission.*
*Some newer directories may have launched after May 2025 -- do a fresh web search to find any new ones.*
