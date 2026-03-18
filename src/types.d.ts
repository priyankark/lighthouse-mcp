declare module '@modelcontextprotocol/sdk' {
  export class Server {
    constructor(
      info: { name: string; version: string },
      options: { capabilities: { tools: {}; resources?: {} } }
    );
    setRequestHandler(schema: any, handler: Function): void;
    connect(transport: any): Promise<void>;
    close(): Promise<void>;
    onerror: (error: Error) => void;
  }

  export class StdioServerTransport {
    constructor();
  }

  export const CallToolRequestSchema: unique symbol;
  export const ListToolsRequestSchema: unique symbol;
  export const ListResourcesRequestSchema: unique symbol;
  export const ListResourceTemplatesRequestSchema: unique symbol;
  export const ReadResourceRequestSchema: unique symbol;

  export enum ErrorCode {
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
  }

  export class McpError extends Error {
    constructor(code: ErrorCode, message: string);
  }

  export interface CallToolRequest {
    params: {
      name: string;
      arguments: any;
    };
  }
}

declare module 'lighthouse' {
  function lighthouse(url: string, options: any): Promise<any>;
  export default lighthouse;
}

declare module 'chrome-launcher' {
  export interface LaunchOptions {
    chromeFlags?: string[];
    envVars?: Record<string, string>;
    chromePath?: string;
    userDataDir?: string;
    port?: number;
    ignoreDefaultFlags?: boolean;
    logLevel?: string;
  }
  export function launch(options?: LaunchOptions): Promise<{ port: number; kill: () => Promise<void>; process: any; pid: number }>;
}
