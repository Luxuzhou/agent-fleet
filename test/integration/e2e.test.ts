import { describe, it, expect, afterEach } from 'vitest';
import { createFleetServer } from '../../src/server.js';

describe('E2E: Full fleet workflow', () => {
  let server: Awaited<ReturnType<typeof createFleetServer>> | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('runs a complete delegate → poll → submit → result cycle', async () => {
    server = await createFleetServer({ port: 0 });
    const baseUrl = `http://localhost:${server.port}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };

    // === Step 1: Claude connects as orchestrator ===
    const initOrch = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'claude', version: '1.0', metadata: { role: 'orchestrator', agent: 'claude' } },
        },
      }),
    });
    expect(initOrch.status).toBe(200);
    const orchSession = initOrch.headers.get('mcp-session-id')!;

    await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': orchSession },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });

    // === Step 2: Gemini connects as worker ===
    const initWorker = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'gemini', version: '1.0', metadata: { role: 'worker', agent: 'gemini' } },
        },
      }),
    });
    expect(initWorker.status).toBe(200);
    const workerSession = initWorker.headers.get('mcp-session-id')!;

    await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': workerSession },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });

    // === Step 3: Delegate (blocking) + Worker submit in parallel ===
    // fleet_delegate now blocks until completion, so we run delegate and worker concurrently

    const delegatePromise = fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': orchSession },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'fleet_delegate', arguments: { agent: 'gemini', task: 'Design the login page' } },
      }),
    });

    // Give delegate a moment to create the task, then worker polls and submits
    await new Promise(r => setTimeout(r, 500));

    const pollRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': workerSession },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'fleet_poll', arguments: {} },
      }),
    });
    const pollBody = await pollRes.json() as any;
    const pollText = pollBody.result.content[0].text as string;
    expect(pollText).toContain('New task assigned');
    expect(pollText).toContain('Design the login page');

    // Extract task ID from poll response
    const taskIdMatch = pollText.match(/Task ID: (\S+)/);
    const taskId = taskIdMatch?.[1];
    expect(taskId).toBeTruthy();

    // Worker submits result
    await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': workerSession },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: {
          name: 'fleet_submit',
          arguments: { task_id: taskId, result: 'Created login.html with responsive design', files_changed: ['login.html'] },
        },
      }),
    });

    // === Step 4: Delegate unblocks with result ===
    const delegateRes = await delegatePromise;
    const delegateBody = await delegateRes.json() as any;
    const resultText = delegateBody.result.content[0].text;

    expect(resultText).toContain('completed');
    expect(resultText).toContain('login.html');
  }, 15000); // 15s timeout for blocking delegate
});
