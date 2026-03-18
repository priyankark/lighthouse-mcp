#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import os from 'os';
import fs from 'fs';
import path from 'path';

// Workaround for modelcontextprotocol/typescript-sdk#1380
// In some Zod runtimes, the method literal is stored under `_def.values[0]`
// instead of `_def.value` / `.value`, causing "Schema method literal must be a string"
// during Server initialization. This patches setRequestHandler to handle both cases.
const originalSetRequestHandler = Server.prototype.setRequestHandler;
Server.prototype.setRequestHandler = function patchedSetRequestHandler(
  requestSchema: any,
  handler: any,
) {
  try {
    return originalSetRequestHandler.call(this, requestSchema, handler);
  } catch (err: any) {
    if (err?.message !== 'Schema method literal must be a string') throw err;

    // Attempt to fix the schema by copying values[0] to value
    try {
      const shape = requestSchema?.shape ?? requestSchema?._def?.shape?.();
      const methodSchema = shape?.method;
      const def = methodSchema?._def;
      const maybeValue = Array.isArray(def?.values) ? def.values[0] : undefined;
      if (typeof maybeValue === 'string') {
        if (def && def.value === undefined) def.value = maybeValue;
        if (methodSchema && methodSchema.value === undefined)
          methodSchema.value = maybeValue;
      }
    } catch {
      // If patching fails, rethrow the original error
    }

    return originalSetRequestHandler.call(this, requestSchema, handler);
  }
};

// Define types for Lighthouse
interface LighthouseResult {
  lhr: {
    finalDisplayedUrl: string;
    fetchTime: string;
    lighthouseVersion: string;
    userAgent: string;
    categories: Record<string, any>;
    audits: Record<string, any>;
  };
}

interface RunAuditArgs {
  url: string;
  categories?: string[];
  device?: 'mobile' | 'desktop';
  throttling?: boolean;
}

const isValidAuditArgs = (args: any): args is RunAuditArgs => {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof args.url === 'string' &&
    (args.categories === undefined ||
      (Array.isArray(args.categories) &&
        args.categories.every((cat: any) => typeof cat === 'string'))) &&
    (args.device === undefined ||
      args.device === 'mobile' ||
      args.device === 'desktop') &&
    (args.throttling === undefined || typeof args.throttling === 'boolean')
  );
};

class LighthouseServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'lighthouse-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error: Error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'run_audit',
          description: 'Run a Lighthouse audit on a URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to audit',
              },
              categories: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: [
                    'performance',
                    'accessibility',
                    'best-practices',
                    'seo',
                    'pwa',
                  ],
                },
                description: 'Categories to audit (defaults to all)',
              },
              device: {
                type: 'string',
                enum: ['mobile', 'desktop'],
                description: 'Device to emulate (defaults to mobile)',
              },
              throttling: {
                type: 'boolean',
                description: 'Whether to apply network throttling (defaults to true)',
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'get_performance_score',
          description: 'Get just the performance score for a URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to audit',
              },
              device: {
                type: 'string',
                enum: ['mobile', 'desktop'],
                description: 'Device to emulate (defaults to mobile)',
              },
            },
            required: ['url'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      switch (request.params.name) {
        case 'run_audit':
          return this.handleRunAudit(request.params.arguments);
        case 'get_performance_score':
          return this.handleGetPerformanceScore(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleRunAudit(args: any) {
    if (!isValidAuditArgs(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid audit arguments'
      );
    }

    try {
      // Ensure temp directory exists and is writable (fixes #19 - Windows EPERM)
      // On Windows, os.tmpdir() reads TEMP -> TMP -> USERPROFILE, so we verify
      // the resolved path is usable before launching Chrome.
      const tmpDir = os.tmpdir();
      try {
        fs.accessSync(tmpDir, fs.constants.W_OK);
      } catch {
        // If the default temp dir isn't writable, create a fallback in the user's home
        const fallbackTmp = path.join(os.homedir(), '.lighthouse-tmp');
        if (!fs.existsSync(fallbackTmp)) {
          fs.mkdirSync(fallbackTmp, { recursive: true });
        }
        process.env.TEMP = fallbackTmp;
        process.env.TMP = fallbackTmp;
        process.env.TMPDIR = fallbackTmp;
      }

      // Explicitly pass process.env so MCP-configured env vars (TEMP, TMP, TMPDIR)
      // propagate to the Chrome child process on all platforms.
      const chrome = await chromeLauncher.launch({
        chromeFlags: ['--headless', '--no-sandbox'],
        envVars: process.env as Record<string, string>,
      });
      
      const options: any = {
        logLevel: 'info' as const,
        output: 'json',
        onlyCategories: args.categories,
        port: chrome.port,
        formFactor: args.device || 'mobile',
        screenEmulation: {
          mobile: args.device !== 'desktop',
          width: args.device === 'desktop' ? 1350 : 360,
          height: args.device === 'desktop' ? 940 : 640,
          deviceScaleFactor: 1,
          disabled: false,
        },
        throttling: args.throttling !== false ? {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
        } : {
          rttMs: 0,
          throughputKbps: 10 * 1024,
          cpuSlowdownMultiplier: 1,
        },
      };

      const runnerResult = await lighthouse(args.url, options) as LighthouseResult;
      await chrome.kill();

      if (!runnerResult) {
        throw new McpError(
          ErrorCode.InternalError,
          'Failed to run Lighthouse audit'
        );
      }

      const { lhr } = runnerResult;
      
      // Format the results
      const formattedResults = {
        url: lhr.finalDisplayedUrl,
        fetchTime: lhr.fetchTime,
        version: lhr.lighthouseVersion,
        userAgent: lhr.userAgent,
        scores: {},
        metrics: {},
      };

      // Add category scores
      const scores: Record<string, any> = {};
      for (const [key, category] of Object.entries(lhr.categories as Record<string, any>)) {
        scores[key] = {
          title: category.title,
          score: category.score,
          description: category.description,
        };
      }
      formattedResults.scores = scores;

      // Add key metrics
      const metrics: Record<string, any> = {};
      if (lhr.audits) {
        const keyMetrics = [
          'first-contentful-paint',
          'largest-contentful-paint',
          'total-blocking-time',
          'cumulative-layout-shift',
          'speed-index',
          'interactive',
        ];

        for (const metric of keyMetrics) {
          const audit = (lhr.audits as Record<string, any>)[metric];
          if (audit) {
            metrics[metric] = {
              title: audit.title,
              value: audit.numericValue,
              displayValue: audit.displayValue,
              score: audit.score,
            };
          }
        }
      }
      formattedResults.metrics = metrics;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formattedResults, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error('Lighthouse error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error running Lighthouse audit: ${error.message || error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetPerformanceScore(args: any) {
    if (!isValidAuditArgs(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid performance score arguments'
      );
    }

    try {
      // Run a focused performance audit
      const auditArgs: RunAuditArgs = {
        url: args.url,
        categories: ['performance'],
        device: args.device || 'mobile',
        throttling: true,
      };

      const result = await this.handleRunAudit(auditArgs);
      
      // Extract just the performance data
      const resultData = JSON.parse(result.content[0].text);
      const performanceData = {
        url: resultData.url,
        performanceScore: resultData.scores.performance.score,
        metrics: resultData.metrics,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(performanceData, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error('Performance score error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error getting performance score: ${error.message || error}`,
          },
        ],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Lighthouse MCP server running on stdio');
  }
}

const server = new LighthouseServer();
server.run().catch(console.error);
