/**
 * agent-harness.test.js — E2E agent lifecycle tests
 * Runner: Node built-in test runner (node:test)
 * Run with: node --experimental-test-module-mocks --test src/e2e/agent-harness.test.js
 *
 * Scenarios:
 *   1. Spawn mock agent   — POST /api/teams creates team + agent entries
 *   2. Heartbeat via WS  — POST /heartbeat broadcasts to subscribed WS client
 *   3. Send IRC command  — POST /channels/:name/messages reaches IRC layer
 *   4. Agent responds    — WS client receives the agent's heartbeat event
 */

import { describe, it, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';

// ── Module mocks (wired before dynamic app import) ────────────────────────
// Prevents real Docker / IRC / TCP connections during tests.
// Requires: node --experimental-test-module-mocks

await mock.module('../orchestrator/compose.js', {
  namedExports: {
    startTeam:       mock.fn(async () => {}),
    stopTeam:        mock.fn(async () => {}),
    renderCompose:   mock.fn(async () => 'version: "3"'),
    rehydrateTeams:  mock.fn(async () => {}),
  },
});

await mock.module('../irc/gateway.js', {
  namedExports: {
    createGateway:  mock.fn(() => {}),
    destroyGateway: mock.fn(async () => {}),
    getGateway:     mock.fn(() => ({
      say: mock.fn(() => {}),
    })),
    listGateways:   mock.fn(() => []),
  },
});

await mock.module('../irc/router.js', {
  namedExports: {
    routeMessage:       mock.fn(() => {}),
    clearTeamBuffers:   mock.fn(() => {}),
    readMessages:       mock.fn(() => []),
    listChannels:       mock.fn(() => []),
    registerBroadcaster: mock.fn(() => {}),
  },
});

// Dynamic imports AFTER mocks are registered
const { createApp }                         = await import('../api/index.js');
const { attachWebSocketServer }             = await import('../api/ws.js');
const { createTeam, listTeams, deleteTeam } = await import('../store/teams.js');

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

const get  = (port, path)        => rawRequest(port, 'GET',    path);
const post = (port, path, body)  => rawRequest(port, 'POST',   path, body);

// Heartbeat endpoint is auth-exempt — use a separate no-auth helper.
function postHeartbeat(port, teamId, agentId) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: `/heartbeat/${teamId}/${agentId}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

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
// Connects, authenticates, subscribes to a team feed, and resolves with
// the open WebSocket so callers can attach message listeners.

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
  name:   'agent-harness',
  repo:   { url: 'https://github.com/acme/test-repo' },
  agents: [{ role: 'dev', model: 'claude-sonnet-4-6' }],
};

// ── Test suite ────────────────────────────────────────────────────────────

describe('Agent harness — lifecycle', () => {
  let server;
  let port;

  before(async () => {
    ({ server, port } = await startServer());
  });

  after(async () => {
    // Drain teams and shut down
    for (const t of listTeams()) deleteTeam(t.id);
    await stopServer(server);
  });

  afterEach(() => {
    // Isolate each test: remove all teams from in-memory store
    for (const t of listTeams()) deleteTeam(t.id);
    mock.reset();
  });

  // ── 1. Spawn mock agent ─────────────────────────────────────────────────

  it('POST /api/teams creates team with agent entries', async () => {
    const res = await post(port, '/api/teams', VALID_TEAM);

    assert.equal(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id,              'response must have id');
    assert.ok(Array.isArray(res.body.agents), 'response must have agents array');
    assert.equal(res.body.agents.length, 1);

    const agent = res.body.agents[0];
    assert.ok(agent.id,                 'agent must have an id');
    assert.equal(agent.role, 'dev',     'agent role must match');
    assert.equal(agent.last_heartbeat, null, 'no heartbeat yet');
  });

  // ── 2. Heartbeat updates agent state ───────────────────────────────────

  it('POST /heartbeat/:teamId/:agentId records last_heartbeat', async () => {
    const createRes = await post(port, '/api/teams', VALID_TEAM);
    assert.equal(createRes.status, 201);

    const { id: teamId, agents } = createRes.body;
    const agentId = agents[0].id;

    // Before heartbeat
    const before = await get(port, `/api/teams/${teamId}`);
    assert.equal(before.body.agents[0].last_heartbeat, null);

    // Post heartbeat (no auth required)
    const hbRes = await postHeartbeat(port, teamId, agentId);
    assert.equal(hbRes.status, 200, `heartbeat POST failed: ${JSON.stringify(hbRes.body)}`);

    // After heartbeat — last_heartbeat must be a valid ISO timestamp
    const after = await get(port, `/api/teams/${teamId}`);
    const ts = after.body.agents[0].last_heartbeat;
    assert.ok(ts, 'last_heartbeat should be set after heartbeat POST');
    assert.ok(!isNaN(Date.parse(ts)), `last_heartbeat should be a valid date, got: ${ts}`);
  });

  // ── 3 + 4. Heartbeat broadcast arrives at subscribed WS client ─────────

  it('heartbeat is broadcast over WS to subscribed client (agent responds)', async () => {
    // Create team — this is the "spawn mock agent" step
    const createRes = await post(port, '/api/teams', VALID_TEAM);
    assert.equal(createRes.status, 201);

    const { id: teamId, agents } = createRes.body;
    const agentId = agents[0].id;

    // Connect WS and subscribe to this team's feed
    const ws = await wsSubscribe(port, teamId);

    // Collect incoming WS messages after subscription
    const received = [];
    ws.on('message', (raw) => {
      try { received.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
    });

    // Fire heartbeat — simulates an agent phoning home
    const hbRes = await postHeartbeat(port, teamId, agentId);
    assert.equal(hbRes.status, 200, `heartbeat POST failed: ${JSON.stringify(hbRes.body)}`);

    // Wait for broadcast to reach the WS client
    await new Promise((r) => setTimeout(r, 100));
    ws.close();

    // Verify the WS feed delivered a heartbeat event from the agent
    const hbEvent = received.find((m) => m.type === 'heartbeat' || m.type === 'agent_status');
    assert.ok(
      hbEvent,
      `expected a heartbeat/agent_status WS event; received: ${JSON.stringify(received)}`,
    );
    assert.equal(hbEvent.agentId ?? hbEvent.agent_id, agentId);
  });

  // ── 3. Send IRC command via channel endpoint ────────────────────────────

  it('POST /channels/:name/messages sends text to IRC channel', async () => {
    const createRes = await post(port, '/api/teams', VALID_TEAM);
    assert.equal(createRes.status, 201);

    const { id: teamId } = createRes.body;

    // '#main' must be percent-encoded in the path
    const msgRes = await post(
      port,
      `/api/teams/${teamId}/channels/%23main/messages`,
      { text: '[ACK] test harness online' },
    );

    assert.equal(msgRes.status, 200, `expected 200, got ${msgRes.status}: ${JSON.stringify(msgRes.body)}`);
    assert.ok(msgRes.body.ok, 'response should be { ok: true }');
  });

  // ── GET messages returns buffered list ──────────────────────────────────

  it('GET /channels/:name/messages returns message array', async () => {
    const createRes = await post(port, '/api/teams', VALID_TEAM);
    assert.equal(createRes.status, 201);

    const { id: teamId } = createRes.body;
    const msgsRes = await get(port, `/api/teams/${teamId}/channels/%23tasks/messages`);

    assert.equal(msgsRes.status, 200, `expected 200, got ${msgsRes.status}: ${JSON.stringify(msgsRes.body)}`);
    // GET /:name/messages returns an array directly (not wrapped in { messages: [] })
    assert.ok(
      Array.isArray(msgsRes.body),
      `expected messages array, got: ${JSON.stringify(msgsRes.body)}`,
    );
  });
});
