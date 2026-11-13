<p align="center">
  <img alt="NoDeadman Muse" src="assets/lockup-light.png#gh-light-mode-only" width="520">
  <img alt="NoDeadman Muse" src="assets/lockup-dark.png#gh-dark-mode-only" width="520">
  <br>
  <strong>No agent run dies silently.</strong>
</p>

A deterministic run supervisor for Muse agents. It registers every agent run before it starts, preflights its brief, watches for start confirmation, exit, and heartbeat, and raises an alarm within seconds when a run dies, stalls, or never started — with evidence, not claims.

> Status: **v1 implemented; pilot pending.** The design and the pre-registered pilot predictions below are public from day one; the numbers will follow the pilot, pass or fail. See [REPORT.md](REPORT.md) for implementation checks and remaining limits.

## The problem

Multi-agent setups fail quietly. An orchestrator launches a coding run with a wrong brief path; the process exits in the first second; the dashboard still says "running"; the human finds out two hours later by asking. The orchestrator's attention is not a monitoring system — and a smarter model does not fix a process nobody checks.

NoDeadman separates the two jobs:

- **Machines detect.** Registration, preflight, start/exit/heartbeat watching, alarm delivery: deterministic code, no LLM in the loop.
- **Agents judge.** Briefs, priorities, and quality verdicts stay with the orchestrator. A green process status is never presented as proof that the work is good.

## How it works

1. **Register before spawn.** Every run gets an ID, owner, brief path, working directory, deadline, monitoring profile, and acceptance criteria — recorded before the process launches.
2. **Preflight.** Brief exists and is readable, working directory is correct, declared prerequisites are present. Fail here, and the run is rejected *before* it can die silently.
3. **Supervise.** A watcher independent of the orchestrator's chat checks every 10 seconds: start confirmation (≤15 s), process exit and status, heartbeat (stale after 45 s), progress milestones, and deadlines.
4. **Alarm without the orchestrator.** Incidents go to a persistent, deduplicated queue and out to the configured channel within ≤30 s of detection for local exits. Escalation if unacknowledged in 2 minutes.
5. **Evidence or it didn't happen.** Status transitions are `registered → starting → running → awaiting_review → completed | failed | blocked | timed_out`. `completed` requires the artifact and its gate — an exit code of 0 is only proof the process ended.

## Pre-registered pilot predictions

Frozen before the pilot starts (14 days of operation after the supervisor passes failure-injection tests). Passing raises confidence a little; failing cuts it a lot.

| # | Prediction | Threshold |
|---|---|---|
| P1 | Status claims are evidence-backed | 100% of ≥40 launches registered before spawn; zero `running` without start proof; zero `completed` without artifact + gate |
| P2 | Local detection is fast and consistent | ≥20 injected failures (fail-to-start, mid-run exit) alarmed at the endpoint ≤35 s / ≤30 s; detection latency p95−p50 ≤10 s |
| P3 | Stalls are not hidden by a live heartbeat | 8 injected stalls (heartbeat loss, no-progress) alarmed ≤65 s / ≤320 s per profile; zero shown as healthy |
| P4 | One dead host or channel does not silence alarms | Host-loss alarm ≤70 s; queued events delivered ≤60 s after channel recovery, none lost, no duplicated external actions |
| P5 | Alarms do not eat the benefit | False alarms ≤5 per 100 runs; triage ≤10 min per 10 runs; zero material defects shipped because a gate replaced review |
| P6 | The orchestrator's net load actually drops | Recurring supervision load −≥15% vs a comparable 7-day baseline, with human intervention per run not rising |

## Design principles

- **One small core, no platform.** Plain files and one watcher process per host; events append to a bus the orchestrator reads. No shared LLM runtime.
- **Generic by config.** Agent names, paths, channels, and thresholds live in config — nothing about one person's fleet is baked in.
- **Honest states.** A run that cannot be observed is reported as *unobserved*, never as fine. Missing data is shown as missing, not as zero.
- **Safe retries only.** Operations that can duplicate external effects are never retried blindly; they stop for a human/agent decision.

## Running v1

Requires Node.js >=20; there are no runtime dependencies or install steps. The package exposes the `ndm` bin; from a checkout, use `node bin/ndm.mjs`:

```sh
npm test
node scripts/inject-failures.mjs

node bin/ndm.mjs register --owner example --brief ./brief.md --cwd . --deadline 300 --artifact ./result.txt --gate-cmd 'test -s result.txt' -- node -e 'require("fs").writeFileSync("result.txt", "result")'
# Use the printed ID in the following commands:
node bin/ndm.mjs run RUN_ID
node bin/ndm.mjs status RUN_ID
node bin/ndm.mjs complete RUN_ID
```

Run `node bin/ndm.mjs watch` in a separate, independently managed process. It sweeps immediately and then on the configured interval; `sweep` performs one pass. `watch` stops on SIGINT/SIGTERM. `list` and `status` print JSON. A stale heartbeat sets `observation: "unobserved"` while preserving `running`; an observed missing wrapper/process fails the run. Deadlines mark `timed_out` without killing processes.

Externally launched processes use `start RUN_ID --pid PID`, followed by `heartbeat RUN_ID` and `progress RUN_ID`. The caller must provide these signals; wrapper heartbeats are automatic, but meaningful progress is always explicit. External process disappearance is a failure because no successful exit was observed. `ack INCIDENT_ID` acknowledges an incident; unacknowledged incidents escalate once, even if their run is already terminal.

Optional `ndm.config.json` is read from the invocation directory. All fields below are optional; these are the defaults:

```json
{
  "stateDir": "./.ndm",
  "sweepSeconds": 10,
  "heartbeatSeconds": 10,
  "startConfirmSeconds": 15,
  "heartbeatStaleSeconds": 45,
  "escalateAfterSeconds": 120,
  "alarmWebhook": null,
  "profiles": { "default": { "noProgressSeconds": null } }
}
```

Define additional profiles under `profiles`, then select one with `register --profile NAME`. Progress checks apply while running; heartbeat checks stop when the process exits into review. Deadlines still apply during review. `stateDir`, brief and working-directory paths resolve from the invocation directory; relative artifact paths resolve from the run's working directory. Use the same config directory for every command supervising a registry. Commands are argv arrays; only the explicitly supplied `gate_cmd` uses a shell.

`runs.json` is atomically replaced under a transaction lock. `events.jsonl` contains timestamped evidence and run snapshots; `incidents.jsonl` is the persistent incident/ack queue. `alarms.jsonl` is the file alarm sink, deduplicated by incident ID. Optional webhook delivery makes one bounded POST attempt per incident and records success/failure. Ambiguous failures are not retried automatically. A missing artifact can be supplied and `complete` explicitly retried; gates should be checks without external side effects.

If a process is forcibly killed during a state transaction, an abandoned `.ndm/.lock` can remain. Confirm that the PID in `.lock/pid` and all writers are stopped before manually removing that directory. A gate interrupted while executing similarly leaves `gate_attempt` evidence for operator review. These cases are not automatically retried. See the report for durability, transport and pilot limits.

## Origin

Built by a one-person multi-agent fleet after its orchestrator missed a dead run for two hours — and the human became the alarm. The fix is deliberately boring: a registry, a preflight, a watcher, an alarm. The interesting part is whether the numbers above hold.

## License

[MIT](LICENSE).
