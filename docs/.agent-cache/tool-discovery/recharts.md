# Recharts Tool Discovery Cache

**Date:** 2026-09-15

## Agent Skills

### Primary Recharts Skills

**andy-spike/skills@recharts** (1K installs)
- Composable, responsive React charts with Recharts library
- Covers: line charts, area charts, bar charts, pie charts, scatter plots, composed charts, customization, responsive sizing, tooltips, legends, axes, performance optimization, accessibility
- Confirmed via: `npx skills add --list`

**recharts/recharts@guide** (11 installs)
- Official Recharts repository skills collection
- Key skills: guide, example, typescript, investigate, mutation-testing, vr-test, vr-test-migration
- Confirmed via: `npx skills add --list`

### Related/Broader Skills

**yonatangross/orchestkit@recharts-patterns** (84 installs)
- Recharts-specific patterns within larger OrchestKit collection (113 total skills)
- Confirmed via: `npx skills add --list` (repo cloned, skills confirmed)

**agents-inc/skills@web-dataviz-recharts** (16 installs)
- Web dataviz with Recharts within broader agents-inc skills (238 total skills)
- Confirmed via: `npx skills add --list` (repo cloned)

**tartinerlabs/skills@recharts** (68 installs)
- Listed in find results; broader dev skills collection (20 total skills), not recharts-specific
- Confirmed via: `npx skills find` + partial verification

**terminalskills/skills@recharts** (13 installs)
- Listed in find results
- Confirmed via: `npx skills find`

**alexandretrotel/skills@recharts-best-practices** (1 install)
- Recharts best practices
- Confirmed via: `npx skills find`

## MCP Servers

**pxnt/chart-mcp** - Existing MCP server for Recharts
- Node.js service for server-side chart rendering with React and Recharts
- No browser required, full customization support
- Repository: https://github.com/pxnt/chart-mcp
- Confirmed via: GitHub search for "recharts MCP server"

**Related:** Official discussion in Recharts repo about creating dedicated Recharts MCP (https://github.com/recharts/recharts/issues/5982)

## Discovery Method

1. `npx skills find recharts` - returned 20 candidates with Recharts focus
2. `npx skills add` with `--list` flag - verified 5 primary candidates
3. Web search: `recharts "MCP server"` and `recharts MCP server npm github`
