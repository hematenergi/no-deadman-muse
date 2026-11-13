import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export function append(config, file, value) {
  fs.appendFileSync(path.join(config.stateDir, file), `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

export function readLines(config, file) {
  try {
    return fs.readFileSync(path.join(config.stateDir, file), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function atomicWrite(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function readRuns(config) {
  try {
    const runs = JSON.parse(fs.readFileSync(path.join(config.stateDir, 'runs.json'), 'utf8'));
    if (!runs || typeof runs !== 'object' || Array.isArray(runs)) throw new Error('invalid registry');
    return runs;
  } catch (error) {
    // The event snapshots can rebuild a missing or damaged registry.
    const events = readLines(config, 'events.jsonl');
    if (!events.length && error.code !== 'ENOENT') throw error;
    const runs = {};
    for (const event of events) if (event.run) runs[event.run_id] = event.run;
    return runs;
  }
}

export function event(config, runId, name, fields = {}) {
  append(config, 'events.jsonl', { ts: new Date().toISOString(), run_id: runId, event: name, ...fields });
}

// No async work inside the lock: subprocesses, gates and HTTP run outside transactions.
export async function transaction(config, action) {
  fs.mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  const lock = path.join(config.stateDir, '.lock');
  const start = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // shortcut: crash-abandoned locks require operator removal, add lease recovery before unattended deployment.
      if (Date.now() - start > 5000) throw new Error(`state locked: ${lock}; verify no writer is active before removing it`);
      await delay(10);
    }
  }
  try {
    fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
    const runs = readRuns(config);
    const result = action(runs);
    if (result instanceof Promise) throw new Error('transaction callback must be synchronous');
    atomicWrite(path.join(config.stateDir, 'runs.json'), runs);
    return result;
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

export function saveEvent(config, run, name, fields = {}) {
  event(config, run.id, name, { ...fields, run: structuredClone(run) });
}
