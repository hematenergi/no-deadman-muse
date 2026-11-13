import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { acknowledge, deliver, incidents } from '../src/alarms.mjs';
import { register, start, touch, transition } from '../src/core.mjs';
import { transaction } from '../src/store.mjs';
import { sweep } from '../src/supervisor.mjs';
import { cli, cliPath, fixture } from '../scripts/test-support.mjs';

test('starting timeout stays starting; deadline affects all active states', async t => {
  const f = fixture({ startConfirmSeconds: 0.1 }); t.after(f.cleanup);
  const run = await register(f.config, f.input());
  await transaction(f.config, runs => transition(f.config, runs[run.id], 'starting'));
  await sweep(f.config, Date.now() + 200);
  assert.equal(f.runs()[run.id].status, 'starting');
  assert.equal(incidents(f.config)[0].event, 'start_unconfirmed');
  for (const status of ['registered', 'starting', 'running', 'awaiting_review']) {
    const item = await register(f.config, f.input({ deadline_seconds: 0.1 }));
    if (status !== 'registered') await start(f.config, item.id, process.pid);
    await transaction(f.config, runs => {
      const record = runs[item.id];
      if (status === 'starting') { record.status = 'starting'; }
      if (status === 'awaiting_review') { record.exit_code = 0; transition(f.config, record, status); }
    });
    await sweep(f.config, Date.now() + 200);
    assert.equal(f.runs()[item.id].status, 'timed_out');
    assert.ok(incidents(f.config).some(incident => incident.run_id === item.id && incident.event === 'deadline_exceeded'));
  }
});

test('heartbeat loss is unobserved; no progress alarms with a fresh heartbeat; recovery can alarm again', async t => {
  const f = fixture({ heartbeatStaleSeconds: 0.1, profiles: { task: { noProgressSeconds: 0.1 } } }); t.after(f.cleanup);
  const run = await register(f.config, f.input({ profile: 'task' }));
  await start(f.config, run.id, process.pid);
  await sweep(f.config, Date.now() + 200);
  assert.equal(f.runs()[run.id].status, 'running');
  assert.equal(f.runs()[run.id].observation, 'unobserved');
  assert.ok(incidents(f.config).some(item => item.event === 'no_progress'));
  const count = incidents(f.config).length;
  await sweep(f.config, Date.now() + 200);
  assert.equal(incidents(f.config).length, count);
  await delay(10);
  await touch(f.config, run.id, 'heartbeat');
  await sweep(f.config);
  assert.equal(f.runs()[run.id].observation, 'observed');
  await sweep(f.config, Date.now() + 200);
  assert.equal(incidents(f.config).filter(item => item.event === 'heartbeat_stale').length, 2);
  const other = await register(f.config, f.input({ profile: 'task' }));
  await start(f.config, other.id, process.pid);
  await transaction(f.config, runs => { runs[other.id].last_progress_at = new Date(Date.now() - 1000).toISOString(); });
  await sweep(f.config);
  assert.ok(incidents(f.config).some(item => item.run_id === other.id && item.event === 'no_progress'));
  assert.ok(!incidents(f.config).some(item => item.run_id === other.id && item.event === 'heartbeat_stale'));
});

test('dead process is failed with wrapper_lost and malformed records do not stop the sweep', async t => {
  const f = fixture(); t.after(f.cleanup);
  const run = await register(f.config, f.input());
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  t.after(() => child.kill());
  await once(child, 'spawn');
  await start(f.config, run.id, child.pid);
  const exited = once(child, 'exit'); child.kill(); await exited;
  await transaction(f.config, runs => {
    runs.broken = null;
    runs.badstatus = { ...runs[run.id], id: 'badstatus', status: 'oops' };
    runs.badtime = { ...runs[run.id], id: 'badtime', created_at: 'bad' };
  });
  await sweep(f.config);
  assert.equal(f.runs()[run.id].status, 'failed');
  assert.ok(incidents(f.config).some(item => item.event === 'wrapper_lost'));
  assert.equal(f.lines('events.jsonl').filter(item => item.event === 'record_invalid').length, 3);
});

test('one escalation per incident, acknowledgment persists, outbox replays without duplicates', async t => {
  const f = fixture({ escalateAfterSeconds: 0.1 }); t.after(f.cleanup);
  await register(f.config, f.input({ brief: path.join(f.cwd, 'missing') }));
  const original = incidents(f.config)[0];
  fs.unlinkSync(path.join(f.config.stateDir, 'alarms.jsonl'));
  await sweep(f.config, Date.now() + 200);
  await sweep(f.config, Date.now() + 400);
  assert.equal(incidents(f.config).filter(item => item.event === 'escalated').length, 1);
  assert.equal(f.lines('alarms.jsonl').length, 2);
  const ackResult = await cli(f.cwd, ['ack', original.incident_id]);
  assert.equal(ackResult.code, 0, ackResult.stderr);
  assert.ok(incidents(f.config)[0].acknowledged_at);
  const other = await register(f.config, f.input({ brief: path.join(f.cwd, 'missing') }));
  const second = incidents(f.config).find(item => item.run_id === other.id);
  await acknowledge(f.config, second.incident_id);
  await sweep(f.config, Date.now() + 400);
  assert.ok(!incidents(f.config).some(item => item.escalation_of === second.incident_id));
  await Promise.all([deliver(f.config), deliver(f.config)]);
  const ids = f.lines('alarms.jsonl').map(item => item.incident_id);
  assert.equal(new Set(ids).size, ids.length);
});

test('webhook receives JSON once; HTTP failure is recorded, never thrown or blindly retried', async t => {
  let calls = 0;
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://alarms.example.test/endpoint');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['content-type'], 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    bodies.push(JSON.parse(options.body));
    calls++;
    if (calls === 3) throw new TypeError('network unavailable');
    return new Response(null, { status: calls === 1 ? 200 : 503 });
  });
  const f = fixture({ alarmWebhook: 'https://alarms.example.test/endpoint' }); t.after(f.cleanup);
  await register(f.config, f.input({ brief: path.join(f.cwd, 'missing') }));
  await Promise.all([deliver(f.config), deliver(f.config)]);
  assert.equal(calls, 1);
  assert.equal(bodies[0].event, 'preflight_rejected');
  assert.ok(f.lines('events.jsonl').some(item => item.event === 'webhook_delivered'));
  await register(f.config, f.input({ brief: path.join(f.cwd, 'missing') }));
  await deliver(f.config);
  assert.equal(calls, 2);
  assert.ok(f.lines('events.jsonl').some(item => item.event === 'webhook_failed' && item.reason === 'HTTP 503'));
  await register(f.config, f.input({ brief: path.join(f.cwd, 'missing') }));
  assert.equal(calls, 3);
  assert.ok(f.lines('events.jsonl').some(item => item.event === 'webhook_failed' && item.reason === 'TypeError'));
  assert.equal(f.lines('alarms.jsonl').length, 3);
});

test('watch runs independently and stops cleanly on SIGTERM', async t => {
  const f = fixture({ sweepSeconds: 0.02, heartbeatStaleSeconds: 0.08 }); t.after(f.cleanup);
  const run = await register(f.config, f.input());
  await start(f.config, run.id, process.pid);
  const child = spawn(process.execPath, [cliPath, 'watch'], { cwd: f.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  let stderr = ''; child.stderr.on('data', data => { stderr += data; });
  const deadline = Date.now() + 5000;
  while (!f.lines('alarms.jsonl').some(item => item.event === 'heartbeat_stale') && Date.now() < deadline) await delay(20);
  assert.ok(f.lines('alarms.jsonl').some(item => item.event === 'heartbeat_stale'), stderr);
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const [code] = await exited;
  assert.equal(code, 0, stderr);
});
