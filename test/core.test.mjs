import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite, readRuns, transaction } from '../src/store.mjs';
import { loadConfig } from '../src/config.mjs';
import { complete, register, transition } from '../src/core.mjs';
import { fixture } from '../scripts/test-support.mjs';

test('state machine accepts the graph, rejects all other edges and bypassing completion', async t => {
  const f = fixture(); t.after(f.cleanup);
  const graph = {
    registered: ['starting', 'failed', 'blocked', 'timed_out'], starting: ['running', 'failed', 'blocked', 'timed_out'],
    running: ['awaiting_review', 'failed', 'blocked', 'timed_out'], awaiting_review: ['failed', 'blocked', 'timed_out'],
    completed: [], failed: [], blocked: [], timed_out: [],
  };
  await transaction(f.config, () => {
    for (const from of Object.keys(graph)) for (const to of [...Object.keys(graph), 'unknown']) {
      const run = { id: 'test', status: from, history: [] };
      if (graph[from].includes(to)) {
        transition(f.config, run, to);
        assert.equal(run.status, to);
        assert.equal(run.history.length, 1);
      } else assert.throws(() => transition(f.config, run, to), /illegal transition/);
    }
  });
});

test('atomic registry replacement preserves old data on failed serialization and removes temporary files', t => {
  const f = fixture(); t.after(f.cleanup);
  fs.mkdirSync(f.config.stateDir);
  const file = path.join(f.config.stateDir, 'runs.json');
  atomicWrite(file, { previous: true });
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => atomicWrite(file, cyclic));
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { previous: true });
  atomicWrite(file, { next: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { next: true });
  assert.deepEqual(fs.readdirSync(f.config.stateDir), ['runs.json']);
});

test('registry can be reconstructed from evidence snapshots', async t => {
  const f = fixture(); t.after(f.cleanup);
  const run = await register(f.config, f.input());
  fs.writeFileSync(path.join(f.config.stateDir, 'runs.json'), '{broken');
  assert.deepEqual(readRuns(f.config)[run.id], run);
  fs.unlinkSync(path.join(f.config.stateDir, 'runs.json'));
  assert.equal(readRuns(f.config)[run.id].status, 'registered');
});

for (const [name, change, expected] of [
  ['missing brief', f => ({ brief: path.join(f.cwd, 'absent') }), 'brief_missing'],
  ['empty brief', f => { fs.writeFileSync(path.join(f.cwd, 'brief.md'), '  '); return {}; }, 'brief_empty'],
  ['brief directory', f => ({ brief: f.cwd }), 'brief_not_file'],
  ['bad cwd', f => ({ cwd: path.join(f.cwd, 'absent') }), 'cwd_missing'],
  ['cwd file', f => ({ cwd: path.join(f.cwd, 'brief.md') }), 'cwd_not_directory'],
  ['unknown command', () => ({ command: ['ndm-nonexistent-command-94dd'] }), 'command_not_found'],
  ['nonexecutable command', f => ({ command: [path.join(f.cwd, 'brief.md')] }), 'command_not_found'],
  ['missing artifact parent', f => ({ artifact: path.join(f.cwd, 'absent', 'result') }), 'artifact_parent_missing'],
]) {
  test(`preflight rejects ${name} with evidence and alarm`, async t => {
    const f = fixture(); t.after(f.cleanup);
    const run = await register(f.config, f.input(change(f)));
    assert.equal(run.status, 'blocked');
    const incident = f.lines('incidents.jsonl')[0];
    assert.ok(incident.reasons.includes(expected));
    assert.equal(f.lines('alarms.jsonl')[0].incident_id, incident.incident_id);
    assert.ok(f.lines('events.jsonl').every(item => item.ts && item.run_id && item.event));
    assert.equal(f.runs()[run.id].status, 'blocked');
  });
}

test('config defaults, relative paths, profiles, invalid input', t => {
  const f = fixture(); t.after(f.cleanup);
  assert.equal(f.config.sweepSeconds, 10);
  assert.equal(f.config.heartbeatStaleSeconds, 45);
  assert.equal(f.config.profiles.default.noProgressSeconds, null);
  assert.equal(f.config.stateDir, path.join(f.cwd, '.ndm'));
  for (const value of [null, [], { heartbeatSeconds: 0 }, { sweepSeconds: '10' }, { stateDir: 1 }, { profiles: [] }, { profiles: { x: { noProgressSeconds: -1 } } }, { alarmWebhook: 'file:///tmp/test' }]) {
    fs.writeFileSync(path.join(f.cwd, 'ndm.config.json'), JSON.stringify(value));
    assert.throws(() => loadConfig(f.cwd));
  }
});

test('invalid registrations are rejected without corrupting state; registered cannot complete', async t => {
  const f = fixture(); t.after(f.cleanup);
  for (const patch of [{ deadline_seconds: 0 }, { owner: '' }, { profile: 'missing' }, { command: [] }, { gate_cmd: '' }]) {
    await assert.rejects(register(f.config, f.input(patch)), /invalid_/);
  }
  const run = await register(f.config, f.input());
  await assert.rejects(complete(f.config, run.id), /status_not_awaiting_review/);
  assert.equal(f.runs()[run.id].status, 'registered');
});
