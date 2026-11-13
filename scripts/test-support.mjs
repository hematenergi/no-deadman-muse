import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadConfig } from '../src/config.mjs';

export const cliPath = fileURLToPath(new URL('../bin/ndm.mjs', import.meta.url));

export function fixture(overrides = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ndm-test-'));
  fs.writeFileSync(path.join(cwd, 'brief.md'), 'Do the task.\n');
  fs.writeFileSync(path.join(cwd, 'ndm.config.json'), JSON.stringify(overrides));
  const config = loadConfig(cwd);
  return {
    cwd, config,
    cleanup: () => fs.rmSync(cwd, { recursive: true, force: true }),
    input: (overrides = {}) => ({
      owner: 'test-owner', brief: path.join(cwd, 'brief.md'), cwd,
      deadline_seconds: 60, command: [process.execPath, '-e', 'console.log("hello")'], ...overrides,
    }),
    registerArgs: (extra = [], code = 'console.log("hello")') => [
      'register', '--owner', 'test-owner', '--brief', path.join(cwd, 'brief.md'), '--cwd', cwd,
      '--deadline', '60', ...extra, '--', process.execPath, '-e', code,
    ],
    runs: () => JSON.parse(fs.readFileSync(path.join(config.stateDir, 'runs.json'), 'utf8')),
    lines: file => {
      const target = path.join(config.stateDir, file);
      return fs.existsSync(target) ? fs.readFileSync(target, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
    },
  };
}

export function cli(cwd, args, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`CLI timed out: ${args[0]}`)); }, timeout);
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}
