# PostHog & Discord Webhook Tool Discovery Cache

**Date:** 2026-09-15

## Agent Skills

### PostHog Skills

**posthog/posthog-for-claude@posthog-instrumentation** (1.9K installs)
- Automatically add PostHog analytics instrumentation to code; tracks events and feature flags
- Confirmed via: `npx skills add --list`

**posthog/posthog@implementing-agent-modes** (2.6K installs)
- Multi-agent patterns and mode implementation within PostHog repository
- Confirmed via: `npx skills find posthog`

**posthog/skills@integration-nextjs-app-router** (192 installs)
- PostHog integration guide for Next.js App Router (most relevant for this project)
- Confirmed via: `npx skills add --list`

**posthog/skills@feature-flags-nextjs** (144 installs)
- Feature flag implementation in Next.js applications
- Confirmed via: `npx skills find "posthog nextjs"`

**posthog/skills@error-tracking-nextjs** (137 installs)
- Error tracking and monitoring for Next.js applications
- Confirmed via: `npx skills find "posthog nextjs"`

**posthog/skills@logs-nextjs** (124 installs)
- Log analysis and debugging for Next.js applications
- Confirmed via: `npx skills find "posthog nextjs"`

**posthog/skills@diagnosing-stacktrace-symbolication** (232 installs)
- Advanced error diagnostics and stack trace analysis
- Confirmed via: `npx skills find posthog`

**posthog/ai-plugin@instrument-product-analytics** (432 installs)
- Instrumentation guide for product analytics implementation
- Confirmed via: `npx skills find posthog`

**alinaqi/maggy@posthog-analytics** (770 installs)
- PostHog analytics patterns in broader maggy skills collection
- Confirmed via: `npx skills find posthog`

### Discord Webhook Skills

**vm0-ai/vm0-skills@discord-webhook** (262 installs)
- Discord webhook integration and message sending utilities
- Confirmed via: `npx skills find discord`

## MCP Servers

### PostHog MCP Server

**Official PostHog MCP (posthog/mcp)**
- Repository: https://github.com/posthog/mcp
- Install: Claude Code wizard or `npx mcp add posthog/mcp`
- Features: Query analytics, manage feature flags, create insights, error tracking, session replay
- Regions: US (mcp.posthog.com) and EU (mcp-eu.posthog.com)
- Docs: https://posthog.com/docs/model-context-protocol/claude-code
- Confirmed via: Web search for "PostHog MCP server"

### Discord Webhook MCP Servers

**LLMTooling/discord-webhook-mcp-server** (Recommended)
- Repository: https://github.com/LLMTooling/discord-webhook-mcp-server
- Features: Send messages and rich embeds to Discord via webhooks
- Language: TypeScript with official MCP SDK
- Confirmed via: Web search for "Discord webhook MCP server github"

**Alternative Options**
- shehdrbs123/mcp-server-discord-webhook: https://github.com/shehdrbs123/mcp-server-discord-webhook
- genm/mcp-server-discord-webhook: https://github.com/genm/mcp-server-discord-webhook
- BrainDAO/mcp-discord: https://github.com/IQAIcom/mcp-discord (full Discord platform integration)

## Discovery Method

1. `npx skills find posthog` - returned 14+ PostHog-focused candidates
2. `npx skills find "posthog nextjs"` - returned 6 Next.js-specific integrations
3. `npx skills add posthog/posthog-for-claude@posthog-instrumentation --list` - verified details
4. `npx skills add posthog/skills@integration-nextjs-app-router --list` - verified 173-skill collection
5. `npx skills find discord` - returned discord-webhook skill
6. Web search for "PostHog MCP server 2026" - confirmed official MCP + regions
7. Web search for "Discord webhook MCP server github" - found 6+ active implementations
