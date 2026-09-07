import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import type { Socket } from 'node:net';
import ipaddr from 'ipaddr.js';

export function isAllowedAddress(address: string, allowLoopback = true): boolean {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === 'unicast' || (allowLoopback && parsed.range() === 'loopback');
  } catch { return false; }
}

export function parseUrl(input: string): URL {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only HTTP(S) URLs without embedded credentials are allowed');
  }
  return url;
}

export async function resolveTarget(host: string, allowLoopback = true,
  lookup = dns.lookup): Promise<{ address: string; family: number }> {
  const hostname = host.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (['metadata.google.internal', 'metadata.goog'].includes(hostname)) {
    throw new Error('Cloud metadata endpoints are blocked');
  }
  const addresses = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(a => !isAllowedAddress(a.address, allowLoopback))) {
    throw new Error('Non-public network addresses are blocked');
  }
  return addresses[0];
}

// Resolve and validate each connection, then connect to that exact IP. Chrome
// must use this proxy for redirects and subresources too (no loopback bypass).
export async function createAuditProxy(allowLoopback = true) {
  const sockets = new Set<Socket>();
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.setTimeout(120_000, () => socket.destroy());
    socket.once('close', () => sockets.delete(socket));
    return socket;
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = parseUrl(req.url || '');
      if (url.protocol !== 'http:') throw new Error('Use CONNECT for HTTPS');
      const target = await resolveTarget(url.hostname, allowLoopback);
      if (res.destroyed) return;
      const headers: http.OutgoingHttpHeaders = { ...req.headers, host: url.host };
      delete headers['proxy-authorization'];
      delete headers['proxy-connection'];
      const upstream = http.request({
        hostname: target.address, family: target.family,
        port: url.port || 80, path: url.pathname + url.search,
        method: req.method, headers, agent: false,
      }, response => { res.writeHead(response.statusCode || 502, response.headers); response.pipe(res); });
      upstream.on('socket', track);
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    } catch { res.writeHead(403); res.end('Destination blocked'); }
  });
  server.on('connection', track);
  server.on('connect', async (req, client, head) => {
    try {
      const url = parseUrl(`https://${req.url}`);
      const target = await resolveTarget(url.hostname, allowLoopback);
      if (client.destroyed) return;
      const upstream = track(net.connect({ host: target.address, family: target.family, port: Number(url.port || 443) }));
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
      client.on('close', () => upstream.destroy());
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstream.write(head);
        client.pipe(upstream); upstream.pipe(client);
      });
    } catch { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as net.AddressInfo;
  return {
    port: address.port,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
