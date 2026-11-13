import fs from 'node:fs';
import path from 'node:path';

export function loadConfig(cwd = process.cwd()) {
  const file = path.join(cwd, 'ndm.config.json');
  const input = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('config must be an object');
  const config = {
    stateDir: './.ndm', sweepSeconds: 10, heartbeatSeconds: 10,
    startConfirmSeconds: 15, heartbeatStaleSeconds: 45, escalateAfterSeconds: 120,
    alarmWebhook: null, ...input,
    profiles: { default: { noProgressSeconds: null }, ...input.profiles },
  };
  for (const key of ['sweepSeconds', 'heartbeatSeconds', 'startConfirmSeconds', 'heartbeatStaleSeconds', 'escalateAfterSeconds']) {
    if (!Number.isFinite(config[key]) || config[key] <= 0 || config[key] * 1000 > 2 ** 31 - 1) throw new Error(`invalid config: ${key}`);
  }
  if (typeof config.stateDir !== 'string' || !config.stateDir.trim()) throw new Error('invalid config: stateDir');
  if (input.profiles !== undefined && (!input.profiles || typeof input.profiles !== 'object' || Array.isArray(input.profiles))) throw new Error('invalid config: profiles');
  for (const [name, profile] of Object.entries(config.profiles)) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`invalid profile: ${name}`);
    if (profile.noProgressSeconds != null && (!Number.isFinite(profile.noProgressSeconds) || profile.noProgressSeconds <= 0)) throw new Error(`invalid profile: ${name}`);
  }
  if (config.alarmWebhook !== null) {
    const url = new URL(config.alarmWebhook);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid config: alarmWebhook');
  }
  config.stateDir = path.resolve(cwd, config.stateDir);
  return config;
}
