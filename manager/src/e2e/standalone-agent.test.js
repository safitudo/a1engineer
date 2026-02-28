/**
 * standalone-agent.test.js — E2E tests for the IRC routing pipeline
 * Runner: Node built-in test runner (node:test)
 * Run with: node --experimental-test-module-mocks --test src/e2e/standalone-agent.test.js
 *
 * Unlike agent-harness.test.js, this suite intentionally leaves irc/router.js
 * UNMOCKED so the full pipeline (routeMessage → ring buffer + WS broadcast) is
 * exercised end-to-end.
 *
 * Scenarios:
 *   1. Team creation     — POST /api/teams wires createGateway with routeMessage callback
 *   2. Message buffering — simulated IRC message is stored and returned via REST
 *   3. WS broadcast      — simulated IRC message fans out to a subscribed WS client
 *   4. Tag parsing       — [TAG] messages have tag/tagBody; plain text has null tag
 *   5. Agent runtime     — per-agent runtime field is preserved through team creation
 *   6. Team teardown     — DELETE /api/teams/:id returns 204, subsequent GET returns 404
 */

import { describe, it, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';

// ── Module mocks (registered before any dynamic imports) ──────────────────
// compose.js and gateway.js are mocked to prevent Docker/IRC/TCP connections.
// Critically, createGateway captures the onMessage callback so tests can
// inject synthetic IRC events directly into the real router pipeline.

let _capturedOnMessage = null;

await mock.module('../orchestrator/compose.js', {
  namedExports: {
    startTeam:      mock.fn(async () => {}),
    stopTeam:       mock.fn(async () => {}),
    renderCompose:  mock.fn(async () => 'version: "3"'),
    rehydrateTeams: mock.fn(async () => []),
  },
});

await mock.module('../irc/gateway.js', {
  namedExports: {
    createGateway:  mock.fn((team, { onMessage } = {}) => {
      _capturedOnMessage = onMessage;
    }),
    destroyGateway: mock.fn(async () => {}),
    getGateway:     mock.fn(() => ({ say: mock.fn(() => {}) })),
    listGateways:   mock.fn(() => []),
  },
});

// irc/router.js intentionally NOT mocked — real pipeline under test

const { createApp }             = await import('../api/index.js');
const { attachWebSocketServer } = await import('../api/ws.js');
const { listTeams, deleteTeam } = await import('../store/teams.js');
const { clearTeamBuffers }      = await import('../irc/router.js');

// ── HTTP helpers ──────────────────────────────────────────────────────────

function rawRequest(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key-123',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get  = (port, path)       => rawRequest(port, 'GET',    path);
const post = (port, path, body) => rawRequest(port, 'POST',   path, body);
const del  = (port, path)       => rawRequest(port, 'DELETE', path);

// ── Server lifecycle ──────────────────────────────────────────────────────

function startServer() {
  return new Promise((resolve) => {
    const app    = createApp();
    const server = http.createServer(app);
    attachWebSocketServer(server);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

// ── WebSocket helper ──────────────────────────────────────────────────────
// Connects, authenticates with the shared API key, subscribes to a team
// feed, and resolves with the open WebSocket.

function wsSubscribe(port, teamId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('WS connect / subscribe timeout after 3 s'));
    }, 3000);

    ws.once('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: 'test-api-key-123' }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'authenticated') {
        ws.send(JSON.stringify({ type: 'subscribe', teamId }));
      } else if (msg.type === 'subscribed') {
        clearTimeout(timer);
        resolve(ws);
      }
    });

    ws.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

// ── Fixture ───────────────────────────────────────────────────────────────

const VALID_TEAM = {
  name:   'standalone-agent',
  repo:   { url: 'https://github.com/acme/test-repo' },
  agents: [{ role: 'dev', model: 'claude-sonnet-4-6' }],
};

// ── Test suite ────────────────────────────────────────────────────────────

describe('Standalone agent — IRC routing pipeline', () => {
  let server;
  let port;

  before(async () => {
    ({ server, port } = await startServer());
  });

  after(async () => {
    for (const t of listTeams()) {
      clearTeamBuffers(t.id);
      deleteTeam(t.id);
    }
    await stopServer(server);
  });

  afterEach(() => {
    for (const t of listTeams()) {
      clearTeamBuffers(t.id);
      deleteTeam(t.id);
    }
    _capturedOnMessage = null;
    mock.reset();
  });

  // ── 1. Team creation wires gateway callback ─────────────────────────────

  it('POST /api/teams wires createGateway with the real routeMessage callback', async () => {
    const res = await post(port, '/api/teams', VALID_TEAM);

    assert.equal(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id, 'response must have id');
    assert.ok(Array.isArray(res.body.agents), 'response must have agents array');
    assert.equal(res.body.agents.length, 1);
    assert.ok(
      typeof _capturedOnMessage === 'function',
      'createGateway must receive an onMessage callback',
    );
  });

  // ── 2. Message buffering ────────────────────────────────────────────────

  it('simulated IRC message is buffered and readable via GET /channels/:name/messages', async () => {
    const createRes = await post(port, '/api/teams', VALID_TEAM);
    assert.equal(createRes.status, 201);
    const { id: teamId } = createRes.body;

    // Inject a synthetic IRC event through the real routeMessage pipeline
    _capturedOnMessage({
      teamId,
      channel: '#main',
      nick: 'dev-bot',
      text: 'hello from the pipeline',
      time: new Date().toISOString(),
    });

    // channels.js prepends '#' to req.params.name, so route without '#'
    const msgRes = await get(port, `/api/teams/${teamId}/channels/main/messages`);
    assert.equal(msgRes.status, 200, `expected 200, got ${msgRes.status}: ${JSON.stringify(msgRes.body)}`);
    assert.ok(Array.isArray(msgRes.body), `expected array, got: ${JSON.stringify(msgRes.body)}`);
    assert.equal(msgRes.body.length, 1, 'expected exactly one buffered message');
    assert.equal(msgRes.body[0].text, 'hello from the pipeline');
    assert.equal(msgRes.body[0].nick, 'dev-bot');
    assert.equal(msgRes.body[0].teamId, teamId);
  });

  // ── 3. WS broadcast ────────────────────────────────────────────────────

  it('simulated IRC message fans out to a subscribed WS client', async () => {
    const createRes = await post(port, '/api/teams', VALID_TEAM);
    assert.equal(createRes.status, 201);
    const { id: teamId } = createRes.body;

    const ws = await wsSubscribe(port, teamId);
    const received = [];
    ws.on('message', (raw) => {
      try { received.push(JSON.parse(raw.toString())); } catch { /* ignore non-JSON */ }
    });

    _capturedOnMessage({
      teamId,
      channel: '#main',
      nick: 'dev-bot',
      text: '[ACK] pipeline test',
      time: new Date().toISOString(),
    });

    // Allow the broadcast to propagate
    await new Promise((r) => setTimeout(r, 100));
    ws.close();

    const msgEvent = received.find((m) => m.type === 'message');
    assert.ok(
      msgEvent,
      `expected a WS message event; received: ${JSON.stringify(received)}`,
    );
    assert.equal(msgEvent.teamId, teamId);
    assert.equal(msgEvent.text, '[ACK] pipeline test');
    assert.equal(msgEvent.nick, 'dev-bot');
  });

  // ── 4. Tag parsing ─────────────────────────────────────────────────────

  it('tagged messages carry tag/tagBody; untagged messages have null tag', async () => {
    const createRes = await post(port, '/api/teams', VALID_TEAM);
    assert.equal(createRes.status, 201);
    const { id: teamId } = createRes.body;

    _capturedOnMessage({
      teamId,
      channel: '#tasks',
      nick: 'lead',
      text: '[DONE] task completed',
      time: new Date().toISOString(),
    });
    _capturedOnMessage({
      teamId,
      channel: '#tasks',
      nick: 'dev',
      text: 'just chatting',
      time: new Date().toISOString(),
    });

    const msgRes = await get(port, `/api/teams/${teamId}/channels/tasks/messages`);
    assert.equal(msgRes.status, 200);
    assert.equal(msgRes.body.length, 2, 'expected both messages in buffer');

    const tagged   = msgRes.body.find((m) => m.text === '[DONE] task completed');
    const untagged = msgRes.body.find((m) => m.text === 'just chatting');

    assert.ok(tagged,   'tagged message must be present');
    assert.ok(untagged, 'untagged message must be present');
    assert.equal(tagged.tag,      'DONE',           'tagged message must have tag=DONE');
    assert.equal(tagged.tagBody,  'task completed', 'tagged message must have tagBody');
    assert.equal(untagged.tag,    null,             'untagged message must have null tag');
    assert.equal(untagged.tagBody, null,             'untagged message must have null tagBody');
  });

  // ── 5. Per-agent runtime field ─────────────────────────────────────────

  it('per-agent runtime field is preserved through team creation', async () => {
    const teamWithRuntime = {
      name: 'multi-runtime',
      repo: { url: 'https://github.com/acme/test-repo' },
      agents: [
        { role: 'dev', model: 'claude-sonnet-4-6',          runtime: 'claude-code' },
        { role: 'qa',  model: 'claude-haiku-4-5-20251001',  runtime: 'custom-runner' },
      ],
    };

    const res = await post(port, '/api/teams', teamWithRuntime);
    assert.equal(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);

    const agents = res.body.agents;
    assert.equal(agents.length, 2);
    assert.equal(agents[0].runtime, 'claude-code',    'first agent runtime must be preserved');
    assert.equal(agents[1].runtime, 'custom-runner',  'second agent runtime must be preserved');
  });

  // ── 6. Team teardown ───────────────────────────────────────────────────

  it('DELETE /api/teams/:id returns 204 and subsequent GET returns 404', async () => {
    const createRes = await post(port, '/api/teams', VALID_TEAM);
    assert.equal(createRes.status, 201);
    const { id: teamId } = createRes.body;

    const delRes = await del(port, `/api/teams/${teamId}`);
    assert.equal(delRes.status, 204, `expected 204, got ${delRes.status}: ${JSON.stringify(delRes.body)}`);

    const getRes = await get(port, `/api/teams/${teamId}`);
    assert.equal(getRes.status, 404, `team should be gone after DELETE, got ${getRes.status}`);
  });
});
