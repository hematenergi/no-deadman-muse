import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { event, saveEvent, transaction } from './store.mjs';
import { deliver, incident } from './alarms.mjs';

export const terminal = new Set(['completed', 'failed', 'blocked', 'timed_out']);
const graph = {
  registered: ['starting', 'failed', 'blocked', 'timed_out'],
  starting: ['running', 'failed', 'blocked', 'timed_out'],
  running: ['awaiting_review', 'failed', 'blocked', 'timed_out'],
  awaiting_review: ['completed', 'failed', 'blocked', 'timed_out'],
  completed: [], failed: [], blocked: [], timed_out: [],
};
const gateProof = Symbol('completion gate');

export function transition(config, run, status, proof) {
  if (!graph[run.status]?.includes(status) || (status === 'completed' && proof !== gateProof)) {
    throw new Error(`illegal transition: ${run.status} -> ${status}`);
  }
  const previous = run.status;
  run.status = status;
  const ts = new Date().toISOString();
  run.history.push({ status, ts });
  saveEvent(config, run, 'status_changed', { from: previous, to: status });
}

export function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

export function invalidRecord(run, id, config) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return 'not_an_object';
  if (run.id !== id || !/^[a-f0-9-]{36}$/.test(id)) return 'invalid_id';
  if (!Object.hasOwn(graph, run.status)) return 'invalid_status';
  if (typeof run.owner !== 'string' || !run.owner.trim()) return 'invalid_owner';
  if (typeof run.brief !== 'string' || !path.isAbsolute(run.brief) || typeof run.cwd !== 'string' || !path.isAbsolute(run.cwd)) return 'invalid_paths';
  if (!Array.isArray(run.command) || !run.command.length || run.command.some(arg => typeof arg !== 'string' || arg.includes('\0')) || !run.command[0]) return 'invalid_command';
  if (!Number.isFinite(run.deadline_seconds) || run.deadline_seconds <= 0) return 'invalid_deadline';
  if (typeof run.profile !== 'string' || !Object.hasOwn(config.profiles, run.profile)) return 'invalid_profile';
  if (run.artifact !== null && (typeof run.artifact !== 'string' || !path.isAbsolute(run.artifact))) return 'invalid_artifact';
  if (run.gate_cmd !== null && (typeof run.gate_cmd !== 'string' || !run.gate_cmd.trim() || run.gate_cmd.includes('\0'))) return 'invalid_gate';
  if (run.pid !== null && (!Number.isSafeInteger(run.pid) || run.pid <= 0)) return 'invalid_pid';
  if (run.wrapper_pid != null && (!Number.isSafeInteger(run.wrapper_pid) || run.wrapper_pid <= 0)) return 'invalid_wrapper_pid';
  for (const key of ['created_at', 'started_at', 'last_heartbeat_at', 'last_progress_at']) {
    if (key !== 'created_at' && run[key] === null) continue;
    if (typeof run[key] !== 'string' || !Number.isFinite(Date.parse(run[key]))) return `invalid_${key}`;
  }
  if (['running', 'awaiting_review', 'completed'].includes(run.status) && (!run.started_at || !run.pid || !run.last_heartbeat_at || !run.last_progress_at)) return 'missing_start_proof';
  if (run.exit_code !== null && !Number.isInteger(run.exit_code)) return 'invalid_exit_code';
  if (!Array.isArray(run.history) || !run.history.length || run.history.some(item => !item || !Object.hasOwn(graph, item.status) || !Number.isFinite(Date.parse(item.ts)))) return 'invalid_history';
  return null;
}

export function getRun(config, runs, id) {
  if (!Object.hasOwn(runs, id)) throw new Error(`unknown run: ${id}`);
  const reason = invalidRecord(runs[id], id, config);
  if (reason) throw new Error(`invalid run ${id}: ${reason}`);
  return runs[id];
}

function executable(command, cwd) {
  const candidates = command.includes('/') ? [path.resolve(cwd, command)]
    : (process.env.PATH ?? '').split(path.delimiter).map(dir => path.resolve(cwd, dir, command));
  return candidates.find(file => {
    try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); }
    catch { return false; }
  });
}

export function preflight(run) {
  const reasons = [];
  try {
    fs.accessSync(run.brief, fs.constants.R_OK);
    if (!fs.statSync(run.brief).isFile()) reasons.push('brief_not_file');
    else if (!fs.readFileSync(run.brief, 'utf8').trim()) reasons.push('brief_empty');
  } catch (error) { reasons.push(error.code === 'ENOENT' ? 'brief_missing' : 'brief_unreadable'); }
  try { if (!fs.statSync(run.cwd).isDirectory()) reasons.push('cwd_not_directory'); }
  catch { reasons.push('cwd_missing'); }
  if (!executable(run.command[0], run.cwd)) reasons.push('command_not_found');
  if (run.artifact) {
    try { if (!fs.statSync(path.dirname(run.artifact)).isDirectory()) reasons.push('artifact_parent_not_directory'); }
    catch { reasons.push('artifact_parent_missing'); }
  }
  return reasons;
}

function rejectPreflight(config, run, reasons) {
  transition(config, run, 'blocked');
  incident(config, run.id, 'preflight_rejected', { reasons });
}

export async function register(config, input) {
  const ts = new Date().toISOString();
  const run = {
    id: randomUUID(), owner: input.owner, brief: path.resolve(input.brief), cwd: path.resolve(input.cwd),
    command: input.command, deadline_seconds: input.deadline_seconds, profile: input.profile ?? 'default',
    artifact: input.artifact ? path.resolve(input.cwd, input.artifact) : null, gate_cmd: input.gate_cmd ?? null,
    status: 'registered', pid: null, created_at: ts, started_at: null,
    last_heartbeat_at: null, last_progress_at: null, exit_code: null, history: [{ status: 'registered', ts }],
  };
  const invalid = invalidRecord(run, run.id, config);
  if (invalid) throw new Error(invalid);
  const reasons = preflight(run);
  await transaction(config, runs => {
    runs[run.id] = run;
    saveEvent(config, run, 'registered');
    if (reasons.length) rejectPreflight(config, run, reasons);
  });
  if (reasons.length) await deliver(config);
  return run;
}

export async function touch(config, id, kind) {
  return transaction(config, runs => {
    const run = getRun(config, runs, id);
    if (run.status !== 'running') throw new Error(`${kind} requires running status`);
    run[kind === 'heartbeat' ? 'last_heartbeat_at' : 'last_progress_at'] = new Date().toISOString();
    saveEvent(config, run, kind);
    return run;
  });
}

function confirm(config, run, pid) {
  const ts = new Date().toISOString();
  run.pid = pid;
  run.started_at = ts;
  run.last_heartbeat_at = ts;
  run.last_progress_at = ts;
  transition(config, run, 'running');
}

export async function start(config, id, pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || !alive(pid)) throw new Error('pid is not a live process');
  const run = await transaction(config, runs => {
    const run = getRun(config, runs, id);
    if (!['registered', 'starting'].includes(run.status)) throw new Error('start requires registered or starting status');
    if (run.status === 'registered') transition(config, run, 'starting');
    confirm(config, run, pid);
    return run;
  });
  return run;
}

function logFd(config, id) {
  fs.mkdirSync(path.join(config.stateDir, 'logs'), { recursive: true, mode: 0o700 });
  return fs.openSync(path.join(config.stateDir, 'logs', `${id}.log`), 'a', 0o600);
}

export async function runCommand(config, id) {
  const run = await transaction(config, runs => {
    const run = getRun(config, runs, id);
    if (run.status !== 'registered') throw new Error('run requires registered status');
    const reasons = preflight(run);
    if (reasons.length) rejectPreflight(config, run, reasons);
    else {
      run.wrapper_pid = process.pid;
      transition(config, run, 'starting');
    }
    return run;
  });
  if (run.status === 'blocked') { await deliver(config); return 1; }
  let child;
  let fd;
  let timer;
  let heartbeatWork = Promise.resolve();
  try {
    fd = logFd(config, id);
    child = spawn(run.command[0], run.command.slice(1), { cwd: run.cwd, stdio: ['ignore', fd, fd] });
    const exit = new Promise(resolve => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
      child.once('error', error => resolve({ code: null, signal: null, error: error.code ?? error.message }));
    });
    const spawned = await new Promise(resolve => {
      child.once('spawn', () => resolve(true));
      child.once('error', () => resolve(false));
    });
    if (spawned) {
      await transaction(config, runs => {
        const current = getRun(config, runs, id);
        if (current.status === 'starting') confirm(config, current, child.pid);
        else event(config, id, 'spawn_observed', { pid: child.pid, status: current.status });
      });
      timer = setInterval(() => {
        heartbeatWork = heartbeatWork.then(() => transaction(config, runs => {
          const current = getRun(config, runs, id);
          if (current.status === 'running') {
            current.last_heartbeat_at = new Date().toISOString();
            saveEvent(config, current, 'heartbeat');
          }
        })).catch(error => { process.stderr.write(`heartbeat failed: ${error.message}\n`); });
      }, config.heartbeatSeconds * 1000);
    }
    const outcome = await exit;
    clearInterval(timer);
    await heartbeatWork;
    const finalStatus = await transaction(config, runs => {
      const current = getRun(config, runs, id);
      current.exit_code = outcome.code;
      saveEvent(config, current, 'process_exit', { exit_code: outcome.code, signal: outcome.signal, error: outcome.error });
      if (!terminal.has(current.status)) {
        transition(config, current, spawned && outcome.code === 0 ? 'awaiting_review' : 'failed');
        if (current.status === 'failed') incident(config, id, spawned ? 'process_failed' : 'spawn_failed', {
          exit_code: outcome.code, signal: outcome.signal, reason: outcome.error,
        });
      }
      return current.status;
    });
    await deliver(config);
    return outcome.code === 0 && ['awaiting_review', 'completed'].includes(finalStatus) ? 0 : 1;
  } catch (error) {
    await transaction(config, runs => {
      const current = getRun(config, runs, id);
      if (!terminal.has(current.status)) transition(config, current, 'failed');
      incident(config, id, 'wrapper_error', { reason: error.message });
    });
    await deliver(config);
    throw error;
  } finally {
    clearInterval(timer);
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export async function complete(config, id) {
  // Claim the gate under lock; concurrent complete calls must not run a gate twice.
  let run;
  let reason;
  await transaction(config, runs => {
    run = getRun(config, runs, id);
    if (run.status !== 'awaiting_review') reason = 'status_not_awaiting_review';
    else if (run.gate_attempt) reason = 'gate_already_attempted';
    else if (run.artifact && !fs.existsSync(run.artifact)) reason = 'artifact_missing';
    if (reason) incident(config, id, 'completion_rejected', { reason }, `completion_rejected:${reason}`);
    else {
      run.gate_attempt = randomUUID();
      saveEvent(config, run, 'completion_started', { artifact: run.artifact, gate_cmd: run.gate_cmd });
    }
  });
  if (reason) { await deliver(config); throw new Error(reason); }
  let gateCode = 0;
  let gateError;
  try {
    if (run.gate_cmd) {
      const fd = logFd(config, id);
      try {
        const child = spawn(run.gate_cmd, { shell: true, cwd: run.cwd, stdio: ['ignore', fd, fd] });
        const outcome = await new Promise(resolve => {
          child.once('error', error => resolve({ code: null, error: error.code ?? error.message }));
          child.once('exit', (code, signal) => resolve({ code, error: signal }));
        });
        gateCode = outcome.code;
        gateError = outcome.error;
      } finally { fs.closeSync(fd); }
    }
  } catch (error) { gateCode = null; gateError = error.message; }
  await transaction(config, runs => {
    const current = getRun(config, runs, id);
    if (gateCode !== 0) reason = 'gate_failed';
    else if (current.status !== 'awaiting_review') reason = 'status_not_awaiting_review';
    else if (run.artifact && !fs.existsSync(run.artifact)) reason = 'artifact_missing';
    if (reason) incident(config, id, 'completion_rejected', { reason, gate_exit_code: gateCode, error: gateError }, `completion_rejected:${reason}:${run.gate_attempt}`);
    else transition(config, current, 'completed', gateProof);
    // Failed gates require an explicit retry; a crash leaves the claim for operator inspection.
    delete current.gate_attempt;
    saveEvent(config, current, 'completion_checked', { accepted: !reason, reason, gate_exit_code: gateCode });
  });
  await deliver(config);
  if (reason) throw new Error(reason);
}
