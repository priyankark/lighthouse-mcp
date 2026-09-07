# Lighthouse MCP Server

An MCP server that wraps around Google's Lighthouse tool to help measure various performance metrics for web pages.

## Features

- Run comprehensive Lighthouse audits on any URL
- Get performance scores and metrics
- Configure device emulation (mobile/desktop)
- Control network throttling
- Select specific audit categories

## Installation

### Option 1: From MCP Registry (Recommended)

This server is available in the [Model Context Protocol Registry](https://registry.modelcontextprotocol.io/servers/io.github.priyankark/lighthouse-mcp). Install it using your MCP client or Claude Desktop.

### Option 2: Using npx

You can run the tool directly using npx without installation:

```bash
npx lighthouse-mcp
```

### Option 3: Global Installation

Install the package globally from npm:

```bash
npm install -g lighthouse-mcp
```

Then run it:

```bash
lighthouse-mcp
```

### Option 4: Local Development

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Run the server:
   ```bash
   npm start
   ```

## MCP Configuration

### When installed via npm (global or npx)

Add the following to your MCP settings configuration file:

```json
{
  "mcpServers": {
    "lighthouse": {
      "command": "npx",
      "args": ["lighthouse-mcp"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### When using local development version

Add the following to your MCP settings configuration file:

```json
{
  "mcpServers": {
    "lighthouse": {
      "command": "node",
      "args": ["/absolute/path/to/lighthouse-mcp/build/index.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Replace `/absolute/path/to/lighthouse-mcp` with the actual path to this project.

## Available Tools

### run_audit

Run a comprehensive Lighthouse audit on a URL.

**Parameters:**
- `url` (required): The URL to audit
- `categories` (optional): Array of categories to audit (defaults to all)
  - Options: "performance", "accessibility", "best-practices", "seo"
- `device` (optional): Device to emulate (defaults to "mobile")
  - Options: "mobile", "desktop"
- `throttling` (optional): Whether to apply network throttling (defaults to true)

**Example:**
```json
{
  "url": "https://example.com",
  "categories": ["performance", "accessibility"],
  "device": "desktop",
  "throttling": false
}
```

### get_performance_score

Get just the performance score for a URL.

**Parameters:**
- `url` (required): The URL to audit
- `device` (optional): Device to emulate (defaults to "mobile")
  - Options: "mobile", "desktop"

**Example:**
```json
{
  "url": "https://example.com",
  "device": "mobile"
}
```

## Example Usage

Once the MCP server is configured, you can use it with Claude:

```
What's the performance score for example.com?
```

Claude will use the `get_performance_score` tool to analyze the website and return the results.

## Requirements

- Node.js 22.19+
- Chrome/Chromium browser (for Lighthouse)

## Endorsements
<a href="https://glama.ai/mcp/servers/@priyankark/lighthouse-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@priyankark/lighthouse-mcp/badge" />
</a>

## Security

Chrome runs with its sandbox enabled. Localhost, IPv4 loopback, and IPv6 loopback remain supported by default. Private, link-local, cloud metadata, and other non-public destinations are blocked, including requests made by redirects and page resources. Connections use validated IP addresses to prevent DNS rebinding. Because loopback access is intentional, audit only pages you trust to access services on your own machine. For hostile sites, use a separate environment with network isolation.

Audits are limited to one at a time and time out after 120 seconds. Chrome and the audit proxy are cleaned up after success or failure.
