import { randomUUID } from 'node:crypto';
import { append, event, readLines, transaction } from './store.mjs';

export function incidents(config) {
  const latest = new Map();
  for (const item of readLines(config, 'incidents.jsonl')) latest.set(item.incident_id, item);
  return [...latest.values()];
}

// Called only while holding the state lock.
export function incident(config, runId, name, fields = {}, key = name) {
  const prior = incidents(config).find(item => item.run_id === runId && item.dedup_key === key);
  if (prior) return prior;
  const item = {
    ts: new Date().toISOString(), run_id: runId, event: name,
    incident_id: randomUUID(), dedup_key: key, acknowledged_at: null, ...fields,
  };
  append(config, 'incidents.jsonl', item);
  event(config, runId, name, { ...fields, incident_id: item.incident_id });
  return item;
}

export async function acknowledge(config, id) {
  return transaction(config, () => {
    const item = incidents(config).find(entry => entry.incident_id === id);
    if (!item) throw new Error(`unknown incident: ${id}`);
    if (!item.acknowledged_at) {
      item.acknowledged_at = new Date().toISOString();
      append(config, 'incidents.jsonl', item);
      event(config, item.run_id, 'acknowledged', { incident_id: id });
    }
    return item;
  });
}

export async function deliver(config) {
  const pending = await transaction(config, () => {
    const delivered = new Set(readLines(config, 'alarms.jsonl').map(item => item.incident_id));
    const attempted = new Set(readLines(config, 'events.jsonl').filter(item => item.event === 'webhook_attempted').map(item => item.incident_id));
    const webhooks = [];
    for (const item of incidents(config)) {
      if (!delivered.has(item.incident_id)) {
        append(config, 'alarms.jsonl', item);
        delivered.add(item.incident_id);
      }
      if (config.alarmWebhook && !attempted.has(item.incident_id)) {
        event(config, item.run_id, 'webhook_attempted', { incident_id: item.incident_id });
        webhooks.push(item);
      }
    }
    return webhooks;
  });
  // Best effort, one attempt per incident: an ambiguous HTTP failure must not duplicate external effects.
  await Promise.all(pending.map(async item => {
    let failure = null;
    try {
      const response = await fetch(config.alarmWebhook, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(item),
        signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      await response.body?.cancel();
      if (!response.ok) failure = `HTTP ${response.status}`;
    } catch (error) {
      failure = error.name;
    }
    await transaction(config, () => event(config, item.run_id, failure ? 'webhook_failed' : 'webhook_delivered', {
      incident_id: item.incident_id, ...(failure ? { reason: failure } : {}),
    }));
  }));
}
