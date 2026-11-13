import assert from 'node:assert/strict';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { cli, fixture } from './test-support.mjs';

// All scenarios use real CLI subprocesses and isolated state, never a user's live registry.
const f = fixture({ heartbeatStaleSeconds: 0.1, sweepSeconds: 0.02 });
const measurements = [];
async function register(extra = [], code) {
  const result = await cli(f.cwd, f.registerArgs(extra, code));
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}
function alarm(id, name) {
  const item = f.lines('alarms.jsonl').find(item => item.run_id === id && item.event === name);
  assert.ok(item, `${name} alarm missing`);
  return item;
}
try {
  const args = f.registerArgs(); args[args.indexOf('--brief') + 1] = path.join(f.cwd, 'missing.md');
  let began = Date.now();
  const rejected = await cli(f.cwd, args);
  assert.equal(rejected.code, 1);
  const rejectedId = rejected.stdout.trim();
  assert.equal(f.runs()[rejectedId].status, 'blocked');
  assert.ok(alarm(rejectedId, 'preflight_rejected').reasons.includes('brief_missing'));
  measurements.push({ scenario: 'missing_brief', register_to_alarm_observed_ms: Date.now() - began });

  const failed = await register([], 'process.exit(1)');
  began = Date.now();
  const result = await cli(f.cwd, ['run', failed]);
  const observed = Date.now();
  assert.equal(result.code, 1);
  assert.equal(f.runs()[failed].status, 'failed');
  const failedAlarm = alarm(failed, 'process_failed');
  const exit = f.lines('events.jsonl').find(item => item.run_id === failed && item.event === 'process_exit');
  const started = f.runs()[failed].started_at;
  assert.ok(Date.parse(exit.ts) - Date.parse(started) < 1000, 'child did not exit in <1s');
  measurements.push({ scenario: 'exit_1', cli_spawn_to_incident_ms: Date.parse(failedAlarm.ts) - began,
    child_spawn_to_incident_ms: Date.parse(failedAlarm.ts) - Date.parse(started), cli_spawn_to_alarm_observed_ms: observed - began });

  const stalled = await register();
  assert.equal((await cli(f.cwd, ['start', stalled, '--pid', String(process.pid)])).code, 0);
  began = Date.parse(f.runs()[stalled].last_heartbeat_at);
  await delay(160);
  assert.equal((await cli(f.cwd, ['sweep'])).code, 0);
  alarm(stalled, 'heartbeat_stale');
  assert.equal(f.runs()[stalled].status, 'running');
  assert.equal(f.runs()[stalled].observation, 'unobserved');
  measurements.push({ scenario: 'heartbeat_stall', last_confirmation_to_alarm_observed_ms: Date.now() - began });

  began = Date.now();
  const deadlineArgs = f.registerArgs(); deadlineArgs[deadlineArgs.indexOf('--deadline') + 1] = '0.1';
  const deadlineResult = await cli(f.cwd, deadlineArgs);
  assert.equal(deadlineResult.code, 0, deadlineResult.stderr);
  const expired = deadlineResult.stdout.trim();
  await delay(160);
  assert.equal((await cli(f.cwd, ['sweep'])).code, 0);
  assert.equal(f.runs()[expired].status, 'timed_out');
  alarm(expired, 'deadline_exceeded');
  measurements.push({ scenario: 'deadline', register_to_alarm_observed_ms: Date.now() - began });

  console.log(JSON.stringify({ result: 'PASS', clock: 'wall-clock milliseconds; CLI startup included', thresholds: { heartbeatStaleSeconds: 0.1, deadlineSeconds: 0.1 }, measurements }, null, 2));
} finally {
  f.cleanup();
}
