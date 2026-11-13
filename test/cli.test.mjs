import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { cli, cliPath, fixture } from '../scripts/test-support.mjs';

async function registered(f, extra = [], code) {
  const result = await cli(f.cwd, f.registerArgs(extra, code));
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}

test('real CLI wraps exit 0, captures both streams, writes heartbeats, never auto-completes', async t => {
  const f = fixture({ heartbeatSeconds: 0.02 }); t.after(f.cleanup);
  const id = await registered(f, [], 'console.log("output"); console.error("error output"); setTimeout(() => {}, 180)');
  assert.equal(f.runs()[id].status, 'registered');
  const result = await cli(f.cwd, ['run', id]);
  assert.equal(result.code, 0, result.stderr);
  const run = f.runs()[id];
  assert.equal(run.status, 'awaiting_review');
  assert.equal(run.exit_code, 0);
  assert.ok(run.pid > 0 && run.started_at);
  assert.ok(Date.parse(run.last_heartbeat_at) > Date.parse(run.started_at));
  assert.deepEqual(run.history.map(item => item.status), ['registered', 'starting', 'running', 'awaiting_review']);
  const log = fs.readFileSync(path.join(f.config.stateDir, 'logs', `${id}.log`), 'utf8');
  assert.match(log, /output/); assert.match(log, /error output/);
  assert.equal(JSON.parse((await cli(f.cwd, ['status', id])).stdout).status, 'awaiting_review');
  assert.ok(JSON.parse((await cli(f.cwd, ['list'])).stdout)[id]);
  assert.equal((await cli(f.cwd, ['run', id])).code, 1);
  assert.equal((await cli(f.cwd, ['complete', id])).code, 0);
  assert.equal(f.runs()[id].status, 'completed');
});

test('exit 1 and signal termination create a failed incident immediately', async t => {
  const f = fixture(); t.after(f.cleanup);
  for (const code of ['process.exit(1)', 'process.kill(process.pid, "SIGTERM")']) {
    const id = await registered(f, [], code);
    assert.equal((await cli(f.cwd, ['run', id])).code, 1);
    assert.equal(f.runs()[id].status, 'failed');
    assert.equal(f.lines('incidents.jsonl').find(item => item.run_id === id).event, 'process_failed');
    assert.equal(f.lines('alarms.jsonl').filter(item => item.run_id === id).length, 1);
  }
});

test('register errors return nonzero with blocked record and named reason', async t => {
  const f = fixture(); t.after(f.cleanup);
  fs.unlinkSync(path.join(f.cwd, 'brief.md'));
  const result = await cli(f.cwd, f.registerArgs());
  assert.equal(result.code, 1);
  assert.equal(f.runs()[result.stdout.trim()].status, 'blocked');
  assert.deepEqual(f.lines('incidents.jsonl')[0].reasons, ['brief_missing']);
});

test('run preflight is rechecked after registration', async t => {
  const f = fixture(); t.after(f.cleanup);
  const id = await registered(f);
  fs.unlinkSync(path.join(f.cwd, 'brief.md'));
  assert.equal((await cli(f.cwd, ['run', id])).code, 1);
  assert.equal(f.runs()[id].status, 'blocked');
  assert.equal(f.runs()[id].pid, null);
});

test('spawn failure after successful preflight is failed, never running', async t => {
  const f = fixture(); t.after(f.cleanup);
  const executable = path.join(f.cwd, 'bad-executable');
  fs.writeFileSync(executable, '#!/nonexistent-interpreter-ndm\n'); fs.chmodSync(executable, 0o700);
  const args = f.registerArgs(); args.splice(args.indexOf('--') + 1, 3, executable);
  const result = await cli(f.cwd, args);
  assert.equal(result.code, 0, result.stderr);
  const id = result.stdout.trim();
  assert.equal((await cli(f.cwd, ['run', id])).code, 1);
  assert.equal(f.runs()[id].status, 'failed');
  assert.ok(!f.runs()[id].history.some(item => item.status === 'running'));
  assert.ok(f.lines('incidents.jsonl').some(item => item.event === 'spawn_failed'));
});

test('completion rejects missing artifact and failing gate; artifact and passing gate complete with log', async t => {
  const f = fixture(); t.after(f.cleanup);
  const id = await registered(f, ['--artifact', 'result.txt', '--gate-cmd', 'echo gate-passed']);
  assert.equal((await cli(f.cwd, ['run', id])).code, 0);
  assert.equal((await cli(f.cwd, ['complete', id])).code, 1);
  assert.equal(f.runs()[id].status, 'awaiting_review');
  assert.equal(f.lines('incidents.jsonl')[0].reason, 'artifact_missing');
  fs.writeFileSync(path.join(f.cwd, 'result.txt'), 'result');
  assert.equal((await cli(f.cwd, ['complete', id])).code, 0);
  assert.equal(f.runs()[id].status, 'completed');
  assert.match(fs.readFileSync(path.join(f.config.stateDir, 'logs', `${id}.log`), 'utf8'), /gate-passed/);
  const failed = await registered(f, ['--artifact', 'result.txt', '--gate-cmd', 'echo gate-failed >&2; exit 7']);
  await cli(f.cwd, ['run', failed]);
  assert.equal((await cli(f.cwd, ['complete', failed])).code, 1);
  assert.equal(f.runs()[failed].status, 'awaiting_review');
  assert.ok(f.lines('incidents.jsonl').some(item => item.run_id === failed && item.reason === 'gate_failed' && item.gate_exit_code === 7));
});

test('concurrent registrations and completions serialize; gate executes once', async t => {
  const f = fixture(); t.after(f.cleanup);
  const results = await Promise.all(Array.from({ length: 10 }, () => cli(f.cwd, f.registerArgs())));
  assert.ok(results.every(result => result.code === 0), JSON.stringify(results));
  assert.equal(Object.keys(f.runs()).length, 10);
  const quotedNode = `'${process.execPath.replaceAll("'", "'\\''")}'`;
  const id = await registered(f, ['--gate-cmd', `${quotedNode} -e 'require("fs").appendFileSync("gate-actions", "x"); setTimeout(() => {}, 200)'`]);
  await cli(f.cwd, ['run', id]);
  const gates = await Promise.all([cli(f.cwd, ['complete', id]), cli(f.cwd, ['complete', id])]);
  assert.deepEqual(gates.map(result => result.code).sort(), [0, 1]);
  assert.equal(fs.readFileSync(path.join(f.cwd, 'gate-actions'), 'utf8'), 'x');
  assert.equal(f.runs()[id].status, 'completed');
});

test('CLI validates options, unknown runs and live start proof', async t => {
  const f = fixture(); t.after(f.cleanup);
  for (const args of [[], ['nope'], ['run'], ['status', 'unknown'], ['sweep', 'extra'], ['register', '--owner', 'x', '--', 'node']]) {
    assert.equal((await cli(f.cwd, args)).code, 1);
  }
  const id = await registered(f);
  assert.equal((await cli(f.cwd, ['heartbeat', id])).code, 1);
  assert.equal((await cli(f.cwd, ['start', id, '--pid', '-1'])).code, 1);
  assert.equal((await cli(f.cwd, ['start', id, '--pid', String(process.pid)])).code, 0);
  assert.equal((await cli(f.cwd, ['heartbeat', id])).code, 0);
  assert.equal((await cli(f.cwd, ['progress', id])).code, 0);
  assert.equal(f.runs()[id].status, 'running');
});

test('watch and short-lived wrapped children do not race into false wrapper_lost alarms', async t => {
  const f = fixture({ sweepSeconds: 0.001 }); t.after(f.cleanup);
  const watcher = spawn(process.execPath, [cliPath, 'watch'], { cwd: f.cwd, stdio: 'ignore' });
  t.after(() => watcher.kill('SIGKILL'));
  const ids = await Promise.all(Array.from({ length: 10 }, () => registered(f)));
  const results = await Promise.all(ids.map(id => cli(f.cwd, ['run', id])));
  assert.ok(results.every(result => result.code === 0), JSON.stringify(results));
  const stopped = once(watcher, 'exit'); watcher.kill('SIGTERM'); await stopped;
  assert.ok(ids.every(id => f.runs()[id].status === 'awaiting_review'));
  assert.equal(f.lines('incidents.jsonl').length, 0);
});

test('losing the real wrapper alarms even while its child remains alive', async t => {
  const f = fixture(); t.after(f.cleanup);
  const id = await registered(f, [], 'setInterval(() => {}, 1000)');
  const wrapper = spawn(process.execPath, [cliPath, 'run', id], { cwd: f.cwd, stdio: 'ignore' });
  t.after(() => wrapper.kill('SIGKILL'));
  const deadline = Date.now() + 5000;
  while (f.runs()[id].status !== 'running' && Date.now() < deadline) await delay(10);
  const run = f.runs()[id];
  assert.equal(run.status, 'running');
  t.after(() => { try { process.kill(run.pid, 'SIGKILL'); } catch {} });
  const stopped = once(wrapper, 'exit'); wrapper.kill('SIGKILL'); await stopped;
  assert.equal((await cli(f.cwd, ['sweep'])).code, 0);
  assert.equal(f.runs()[id].status, 'failed');
  assert.ok(f.lines('alarms.jsonl').some(item => item.event === 'wrapper_lost'));
});

test('deadline during a wrapped run cannot be overwritten by a later successful exit', async t => {
  const f = fixture(); t.after(f.cleanup);
  const args = f.registerArgs([], 'setTimeout(() => {}, 500)');
  args[args.indexOf('--deadline') + 1] = '0.15';
  const registered = await cli(f.cwd, args);
  assert.equal(registered.code, 0, registered.stderr);
  const id = registered.stdout.trim();
  const running = cli(f.cwd, ['run', id]);
  await delay(220);
  assert.equal((await cli(f.cwd, ['sweep'])).code, 0);
  const result = await running;
  assert.equal(result.code, 1, result.stderr);
  assert.equal(f.runs()[id].status, 'timed_out');
  assert.equal(f.runs()[id].exit_code, 0);
});
