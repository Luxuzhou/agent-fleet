import { describe, it, expect, afterEach } from 'vitest';
import { createFleetServer } from '../src/server.js';

describe('FleetServer', () => {
  let server: Awaited<ReturnType<typeof createFleetServer>> | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('starts HTTP server on configured port', async () => {
    server = await createFleetServer({ port: 0 }); // port 0 = random available
    expect(server.port).toBeGreaterThan(0);
  });

  it('accepts MCP connections and assigns sessions', async () => {
    server = await createFleetServer({ port: 0 });

    const res = await fetch(`http://localhost:${server.port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {
            name: 'gemini',
            version: '1.0.0',
            metadata: { role: 'worker', agent: 'gemini' },
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const sessionId = res.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
  });
});
