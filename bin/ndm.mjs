#!/usr/bin/env node
import { loadConfig } from '../src/config.mjs';
import { readRuns, transaction } from '../src/store.mjs';
import { acknowledge } from '../src/alarms.mjs';
import { complete, getRun, register, runCommand, start, touch } from '../src/core.mjs';
import { sweep, watch } from '../src/supervisor.mjs';

const usage = `Usage: ndm register --owner O --brief PATH --cwd DIR --deadline SEC [--profile NAME] [--artifact PATH] [--gate-cmd CMD] -- COMMAND...
       ndm run|complete|heartbeat|progress RUN_ID
       ndm start RUN_ID --pid PID
       ndm status [RUN_ID] | list | sweep | watch | ack INCIDENT_ID`;
const print = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || command === 'help') { console.log(usage); return; }
  const config = loadConfig();
  if (command === 'register') {
    const separator = args.indexOf('--');
    if (separator < 0) throw new Error(usage);
    const options = {};
    const allowed = new Set(['owner', 'brief', 'cwd', 'deadline', 'profile', 'artifact', 'gate-cmd']);
    for (let i = 0; i < separator; i += 2) {
      const name = args[i]?.slice(2);
      if (!args[i].startsWith('--') || !allowed.has(name) || i + 1 >= separator || Object.hasOwn(options, name) || !args[i + 1].trim()) throw new Error(`invalid option: ${args[i]}`);
      options[name] = args[i + 1];
    }
    if (['owner', 'brief', 'cwd', 'deadline'].some(key => !options[key]) || separator === args.length - 1) throw new Error(usage);
    const run = await register(config, {
      owner: options.owner, brief: options.brief, cwd: options.cwd, deadline_seconds: Number(options.deadline),
      profile: options.profile, artifact: options.artifact, gate_cmd: options['gate-cmd'], command: args.slice(separator + 1),
    });
    console.log(run.id);
    if (run.status === 'blocked') { process.stderr.write('preflight_rejected; see incidents.jsonl\n'); process.exitCode = 1; }
  } else if (command === 'list' || command === 'status') {
    if (args.length > (command === 'status' ? 1 : 0)) throw new Error(usage);
    const runs = await transaction(config, () => readRuns(config));
    print(args.length ? getRun(config, runs, args[0]) : runs);
  } else if (command === 'start') {
    if (args.length !== 3 || args[1] !== '--pid') throw new Error(usage);
    print(await start(config, args[0], Number(args[2])));
  } else if (['run', 'complete', 'heartbeat', 'progress', 'ack'].includes(command)) {
    if (args.length !== 1) throw new Error(usage);
    if (command === 'run') process.exitCode = await runCommand(config, args[0]);
    else if (command === 'complete') await complete(config, args[0]);
    else if (command === 'ack') print(await acknowledge(config, args[0]));
    else print(await touch(config, args[0], command));
  } else if (['sweep', 'watch'].includes(command) && !args.length) {
    await (command === 'sweep' ? sweep(config) : watch(config));
  } else throw new Error(usage);
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
