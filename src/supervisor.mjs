import { event, saveEvent, transaction } from './store.mjs';
import { deliver, incident, incidents } from './alarms.mjs';
import { alive, invalidRecord, terminal, transition } from './core.mjs';

export async function sweep(config, now = Date.now()) {
  await transaction(config, runs => {
    for (const [id, run] of Object.entries(runs)) {
      const invalid = invalidRecord(run, id, config);
      if (invalid) { event(config, id, 'record_invalid', { reason: invalid }); continue; }
      if (terminal.has(run.status)) continue;
      const elapsed = since => (now - Date.parse(since)) / 1000;
      if (elapsed(run.created_at) > run.deadline_seconds) {
        transition(config, run, 'timed_out');
        incident(config, id, 'deadline_exceeded');
        continue;
      }
      const startingAt = run.history.findLast(item => item.status === 'starting')?.ts ?? run.created_at;
      if (run.status === 'starting' && elapsed(startingAt) > config.startConfirmSeconds) {
        incident(config, id, 'start_unconfirmed');
      }
      if (run.status === 'running') {
        // A live wrapper may still be committing a short-lived child's exit.
        const wrapperGone = run.wrapper_pid != null && !alive(run.wrapper_pid);
        if (run.exit_code === null && (wrapperGone || (run.wrapper_pid == null && !alive(run.pid)))) {
          transition(config, run, 'failed');
          incident(config, id, 'wrapper_lost', { pid: run.pid, wrapper_pid: run.wrapper_pid ?? null });
          continue;
        }
        if (elapsed(run.last_heartbeat_at) > config.heartbeatStaleSeconds) {
          if (run.observation !== 'unobserved') {
            run.observation = 'unobserved';
            saveEvent(config, run, 'observation_changed', { observation: 'unobserved' });
          }
          incident(config, id, 'heartbeat_stale', { observation: 'unobserved' }, `heartbeat_stale:${run.last_heartbeat_at}`);
        } else if (run.observation === 'unobserved') {
          run.observation = 'observed';
          saveEvent(config, run, 'observation_changed', { observation: 'observed' });
        }
        const limit = config.profiles[run.profile].noProgressSeconds;
        if (limit != null && elapsed(run.last_progress_at) > limit) {
          incident(config, id, 'no_progress', {}, `no_progress:${run.last_progress_at}`);
        }
      }
    }
    for (const item of incidents(config)) {
      if (item.event !== 'escalated' && !item.acknowledged_at && (now - Date.parse(item.ts)) / 1000 > config.escalateAfterSeconds) {
        incident(config, item.run_id, 'escalated', { escalation_of: item.incident_id }, `escalated:${item.incident_id}`);
      }
    }
  });
  await deliver(config);
}

export async function watch(config) {
  let stopped = false;
  let wake;
  const stop = () => { stopped = true; wake?.(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    while (!stopped) {
      try { await sweep(config); }
      catch (error) {
        process.stderr.write(`sweep failed: ${error.message}\n`);
        try { event(config, null, 'sweep_failed', { reason: error.message }); } catch { /* stderr remains available if storage fails. */ }
      }
      if (!stopped) await new Promise(resolve => {
        const timer = setTimeout(resolve, config.sweepSeconds * 1000);
        wake = () => { clearTimeout(timer); resolve(); };
      });
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
