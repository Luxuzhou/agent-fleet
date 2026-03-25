#!/usr/bin/env node
/**
 * stdio-to-HTTP bridge for MCP.
 * Gemini/other CLIs connect to this via stdio, it forwards to the fleet HTTP server.
 * Uses Node http module directly to bypass system proxies.
 */
import * as http from 'node:http';
import { createInterface } from 'node:readline';

const FLEET_URL = process.env.FLEET_URL || 'http://127.0.0.1:4600/mcp';
const url = new URL(FLEET_URL);

let sessionId: string | null = null;

function postToFleet(body: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(body).toString(),
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data });
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const msg = JSON.parse(trimmed);

    const res = await postToFleet(JSON.stringify(msg));

    // Capture session ID from initialize response
    const newSession = res.headers['mcp-session-id'];
    if (newSession) {
      sessionId = Array.isArray(newSession) ? newSession[0] : newSession;
    }

    // Forward response to stdout (notifications have no id, server may return empty)
    if (res.body.trim()) {
      process.stdout.write(res.body + '\n');
    }
  } catch (err: any) {
    // Return JSON-RPC error
    process.stderr.write(`[bridge] Error: ${err.message}\n`);
  }
});

process.stdin.on('end', () => process.exit(0));
