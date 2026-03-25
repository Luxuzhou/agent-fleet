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

    // Send initialized notification
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

    // === Step 3: Claude delegates task ===
    const delegateRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': orchSession },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'fleet_delegate', arguments: { agent: 'gemini', task: 'Design the login page' } },
      }),
    });
    const delegateBody = await delegateRes.json() as any;
    const taskId = JSON.parse(delegateBody.result.content[0].text).task_id;
    expect(taskId).toBeTruthy();

    // === Step 4: Gemini polls for task ===
    const pollRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': workerSession },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'fleet_poll', arguments: {} },
      }),
    });
    const pollBody = await pollRes.json() as any;
    const polledTask = JSON.parse(pollBody.result.content[0].text).task;
    expect(polledTask.id).toBe(taskId);
    expect(polledTask.description).toBe('Design the login page');

    // === Step 5: Gemini submits result ===
    const submitRes = await fetch(`${baseUrl}/mcp`, {
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
    const submitBody = await submitRes.json() as any;
    expect(JSON.parse(submitBody.result.content[0].text).acknowledged).toBe(true);

    // === Step 6: Claude gets result ===
    const resultRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': orchSession },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'fleet_result', arguments: { task_id: taskId } },
      }),
    });
    const resultBody = await resultRes.json() as any;
    const result = JSON.parse(resultBody.result.content[0].text);
    expect(result.result).toBe('Created login.html with responsive design');
    expect(result.files_changed).toContain('login.html');
  });
});
