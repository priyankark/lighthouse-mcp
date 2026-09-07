import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { isAllowedAddress, parseUrl, resolveTarget, createAuditProxy } from '../build/network.js';

test('loopback remains available and internal/metadata addresses are blocked', () => {
  for (const ip of ['127.0.0.1', '127.0.0.2', '::1', '::ffff:127.0.0.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(isAllowedAddress(ip), true, ip);
  for (const ip of ['10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::ffff:169.254.169.254', 'fc00::1', 'fe80::1', '0.0.0.0', '100.100.100.200', '224.0.0.1']) assert.equal(isAllowedAddress(ip), false, ip);
});
test('URL and DNS validation fail closed', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com', 'http://user:pass@example.com']) assert.throws(() => parseUrl(url));
  await assert.rejects(resolveTarget('metadata.google.internal.'));
  await assert.rejects(resolveTarget('example.com', true, async () => { throw new Error('DNS failed'); }));
  await assert.rejects(resolveTarget('example.com', true, async () => [{ address: '8.8.8.8', family: 4 }, { address: 'fd00::1', family: 6 }]));
  assert.equal((await resolveTarget('[::1]')).address, '::1');
  await assert.rejects(resolveTarget(parseUrl('http://0xa9fea9fe').hostname));
});
function request(proxy, url) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: proxy.port, path: url }, res => {
      let body = ''; res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}
test('proxy preserves localhost audits and blocks redirected internal destinations', async () => {
  const origin = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' }); res.end(); }
    else res.end('local page');
  });
  await new Promise(resolve => origin.listen(0, '::', resolve));
  const proxy = await createAuditProxy();
  try {
    const base = `http://localhost:${origin.address().port}`;
    const result = await request(proxy, base);
    assert.equal(result.status, 200); assert.equal(result.body, 'local page');
    const redirect = await request(proxy, base + '/redirect');
    assert.equal((await request(proxy, redirect.headers.location)).status, 403);
    assert.equal((await request(proxy, 'http://[fd00::1]/')).status, 403);
    const connect = await new Promise((resolve, reject) => {
      const socket = net.connect(proxy.port, '127.0.0.1', () => socket.write('CONNECT 169.254.169.254:443 HTTP/1.1\r\nHost: 169.254.169.254:443\r\n\r\n'));
      socket.once('data', data => { resolve(data.toString()); socket.destroy(); }); socket.on('error', reject);
    });
    assert.match(connect, /403 Forbidden/);
  } finally { await proxy.close(); await new Promise(resolve => origin.close(resolve)); }
});
