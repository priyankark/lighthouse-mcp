import http from 'node:http';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const origin = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html lang="en"><title>Local audit</title><body><h1>Localhost still works</h1></body></html>');
});
await new Promise(resolve => origin.listen(0, '::', resolve));
const transport = new StdioClientTransport({ command: process.execPath, args: ['build/index.js'], stderr: 'inherit' });
const client = new Client({ name: 'release-smoke', version: '1.0.0' });
try {
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 2);
  for (const host of ['localhost', '[::1]']) {
    const result = await client.callTool({ name: 'get_performance_score', arguments: { url: `http://${host}:${origin.address().port}`, device: 'desktop' } }, undefined, { timeout: 150_000 });
    assert.ok(!result.isError, JSON.stringify(result));
    const data = JSON.parse(result.content[0].text);
    assert.equal(typeof data.performanceScore, 'number');
    console.log(`${host}: performance score ${data.performanceScore}`);
  }
  const blocked = await client.callTool({ name: 'run_audit', arguments: { url: 'http://169.254.169.254/' } });
  assert.equal(blocked.isError, true);
} finally { await client.close(); await new Promise(resolve => origin.close(resolve)); }
