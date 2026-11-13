<p align="center">
  <img alt="NoDeadman Muse" src="assets/lockup-light.png#gh-light-mode-only" width="520">
  <img alt="NoDeadman Muse" src="assets/lockup-dark.png#gh-dark-mode-only" width="520">
  <br>
  <strong>No agent run dies silently.</strong>
</p>

A deterministic run supervisor for individuals, teams, and agents. It records runs you register before launch, preflights their briefs, watches for start confirmation, exit, and heartbeat, and raises alarms with evidence. Detection timing depends on the configured thresholds and a live watcher; an unlaunched registration is caught at its deadline.

> Status: **v1 implemented; 14-day pilot running (started 13 Nov 2026).** The design and the pre-registered pilot predictions below are public from day one; the numbers will follow the pilot, pass or fail. See [REPORT.md](REPORT.md) for implementation checks and remaining limits.

## Quickstart (5 minutes)

NoDeadman has no install step: clone it and run the CLI straight from the checkout. You need Git and Node.js 20 or newer. The shell examples use a POSIX shell (sh/bash/zsh) and its `test` command; on Windows, use a POSIX environment such as WSL. Native Windows execution has not been verified. No particular agent runtime, process manager, or alarm service is required.

```sh
git clone https://github.com/hematenergi/no-deadman-muse.git
cd no-deadman-muse
```

**1. Start the watcher.** This is the supervisor — run it in a separate terminal from this same checkout directory. A process manager is optional:

```sh
node bin/ndm.mjs watch
```

**2. Write a brief** for the run you are about to launch. One paragraph is enough; the point is that the run's intent exists as a file the preflight can check before anything spawns:

```sh
cat > brief.md <<'EOF'
# Nightly report job
Generate tonight's report into result.txt. Done when result.txt exists and is non-empty.
EOF
```

**3. Register the run — before launching it.** Registration records the owner, the brief, the working directory, a deadline, the artifact that will prove success, and a gate command that checks that artifact:

```sh
RUN_ID=$(node bin/ndm.mjs register --owner example --brief ./brief.md --cwd . --deadline 300 \
  --artifact ./result.txt --gate-cmd 'test -s result.txt' \
  -- node -e 'require("fs").writeFileSync("result.txt", "report body")')
```

Registration prints a bare run ID; the example captures it in `RUN_ID`. Continue only if registration exits 0: a preflight rejection also prints an ID, but exits 1 and records a `blocked` run. If the brief is missing or the working directory does not exist, the run is rejected here — before it can die silently.

**4. Launch it through the wrapper** (never directly — the wrapper is what records start confirmation, heartbeat, and exit):

```sh
node bin/ndm.mjs run "$RUN_ID"
node bin/ndm.mjs status "$RUN_ID"   # -> awaiting_review once the process exits 0
```

**5. Complete it.** `completed` does not mean "the process ended". The artifact must exist and the gate must pass:

```sh
node bin/ndm.mjs complete "$RUN_ID"
```

**Now watch it catch a death.** Register the same brief with a command that fails:

```sh
FAILED_ID=$(node bin/ndm.mjs register --owner example --brief ./brief.md --cwd . --deadline 300 \
  -- node -e 'process.exit(1)')
node bin/ndm.mjs run "$FAILED_ID"  # expected exit 1
```

The wrapper records and delivers a `process_failed` incident immediately after observing exit 1 — see it in `.ndm/alarms.jsonl` and in `node bin/ndm.mjs list`. Nobody had to notice, remember, or ask. To test four failure scenarios (missing brief, exit 1, heartbeat stall, deadline), run the injection suite and read the measured detection latencies:

```sh
node scripts/inject-failures.mjs
```


## For agents: run your own work under NoDeadman

If you are an AI agent reading this repo to adopt the pattern, you do not need a human to brief you further — this section is the whole protocol. (The same protocol ships as [SKILL.md](SKILL.md) in the standard Agent Skills format, for runtimes that load skills.)

You are the operator (a person, team, or agent coordinating runs); NoDeadman is the machine that watches processes for you. Your judgment decides what to run and whether the result is good. NoDeadman records spawn, liveness signals, exit, and declared completion checks; these signals do not prove useful progress or result quality. Never substitute your memory, or a launcher's exit message, for its records.

Below, `ndm` means `node bin/ndm.mjs` from a checkout of this repo. Run every command for one registry from the same directory — your chosen workspace, optionally containing `ndm.config.json` — because config and state resolve from the invocation directory. To use another workspace, invoke `node /absolute/path/to/checkout/bin/ndm.mjs` there, or define an equivalent `ndm` command in your runtime. Paths and angle-bracket fields in the templates below are examples to replace; quote substituted paths that contain spaces.

**The contract**

1. **Register before spawn.** No run exists until it is registered; a process launched outside the registry is unsupervised by definition.
2. **Launch through the wrapper.** `ndm run` records start confirmation, heartbeat, and exit. Raw `nohup`, `&`, or fire-and-forget subprocesses give you none of that evidence.
3. **Start is proven, not assumed.** A launch command returning without error is not start evidence; only the run's status record is.
4. **Exit 0 is not done.** The run waits in `awaiting_review`; it becomes `completed` only through `ndm complete`. This adoption protocol requires both `--artifact` and `--gate-cmd`; the CLI permits either or both to be omitted and then checks only what was declared.
5. **Report only what the registry shows.** "Running" only with start proof and a fresh `last_heartbeat_at` relative to `heartbeatStaleSeconds`; check incidents for no-progress alarms too. `status` reads stored state without sweeping, so a stale stored `running` label alone is insufficient; "completed" only after `complete` succeeds. A run you cannot observe is *unobserved* — say so, never call it fine.

**Setup (once per workspace)**

- `ndm list` answers with the registry as JSON.
- Keep a watcher (`ndm watch`) running before the first run. A separate terminal suffices; pm2, systemd, and launchd are optional ways to keep it alive. Without a watcher or scheduled `sweep`, there is no periodic stall/deadline detection or escalation; register/run/complete still emit their immediate failure alarms.
- Keep briefs and artifacts in one folder per run, and use absolute paths.

**Launch workflow**

1. Write the brief to a file first: task, working directory, expected artifact, done criteria. Prefer its absolute path. A relative `--brief` resolves from the CLI invocation directory; paths passed to the child command resolve from the run's `--cwd`. Preflight cannot validate brief arguments passed to another tool.
2. Register. On valid input the command prints the bare run ID to stdout; capture it and check the exit code (preflight rejection prints an ID too):

   ```sh
   ndm register --owner <owner> --brief <absolute-brief-path> --cwd <absolute-work-dir> \
     --deadline <seconds> --artifact <path> --gate-cmd '<check command>' \
     -- <command...>
   ```

   Registration preflights the brief, the working directory, and the command. A rejection here is the system working — fix the cause, do not bypass it.
3. Launch with `ndm run <RUN_ID>`; for long runs, keep the wrapper alive using your runtime or an optional process manager. Child stdout/stderr and gate output go to `<stateDir>/logs/<RUN_ID>.log`; retain wrapper stderr separately for wrapper errors.
4. Verify start within ~15 seconds: `ndm status <RUN_ID>` must contain a PID and `started_at`, with start transitions recorded in `history`/`events.jsonl`. Short jobs may already be in `awaiting_review` or `failed`; the intermediate states need not be visible while polling. Missing start proof is an unconfirmed start — read the wrapper log and `events.jsonl`, fix the cause, register a new run. Never relaunch the identical failing command a third time; escalate with the failure and the log lines.
5. Monitor with `ndm status <RUN_ID>` / `ndm list`. Never let the human be the one who discovers a death.

**Completion and failure**

- On `awaiting_review`: read the artifact yourself and judge its quality — existence and gate success prove only the declared checks — then `ndm complete <RUN_ID>`. If the gate fails, the run stays open; fix the work, not the gate.
- On `failed` / `blocked` / `timed_out`: read the incident in `incidents.jsonl`, the alarm in `alarms.jsonl`, and the run's trail in `events.jsonl` before deciding. Acknowledge handled incidents with `ndm ack <INCIDENT_ID>`. A retry is a new registration whose brief notes the previous run ID and what changed — never hand-edit registry state.
- Processes that must start outside the wrapper attach after registration instead: `ndm start <RUN_ID> --pid <PID>`, then `ndm heartbeat <RUN_ID>` at intervals shorter than `heartbeatStaleSeconds` and `ndm progress <RUN_ID>` at meaningful milestones, using the same registry directory. External attachment only monitors liveness: v1 has no successful-exit reporting command for these runs, so they cannot reach `awaiting_review`/`completed`. Prefer scheduling `ndm run` for jobs requiring verified completion.

**Anti-patterns**

- Launching first and registering "once it is running" — the riskiest seconds are the first ones.
- Reporting status from chat claims, a dashboard label, or recollection instead of `ndm status`.
- Calling a run done because its command exited 0, its artifact was "probably" written, or its agent said so.
- Weakening the gate to make a run pass, or killing the watcher because it is quiet. Quiet is its job working.

## The problem

Multi-agent setups fail quietly. An orchestrator launches a coding run with a wrong brief path; the process exits in the first second; the dashboard still says "running"; the human finds out two hours later by asking. The orchestrator's attention is not a monitoring system — and a smarter model does not fix a process nobody checks.

NoDeadman separates the two jobs:

- **Machines detect.** Registration, preflight, start/exit/heartbeat watching, alarm delivery: deterministic code, no LLM in the loop.
- **Agents judge.** Briefs, priorities, and quality verdicts stay with the orchestrator. A green process status is never presented as proof that the work is good.

## How it works

1. **Register before spawn.** Each registered run gets an ID, owner, brief path, working directory, deadline, monitoring profile, and any declared acceptance criteria — recorded before the process launches.
2. **Preflight.** Brief is a readable, non-empty file, working directory exists, executable is available, and the declared artifact's parent directory exists. Task-specific dependencies and arguments are not checked. Fail here, and the run is rejected *before* it can die silently.
3. **Supervise.** An independent watcher sweeps immediately, then waits 10 seconds after each sweep by default: unconfirmed `starting` (threshold 15 s), missing wrapper/external process, heartbeat (stale threshold 45 s), configured no-progress limits, and deadlines measured from registration. Threshold detection occurs on the next sweep; these are not latency guarantees. Wrapper exit reporting is immediate.
4. **Alarm without the orchestrator.** Incidents go to a persistent, deduplicated file outbox and optionally a webhook (one best-effort POST, 5 s timeout, no automatic retry). Unacknowledged incidents escalate once on a sweep after 120 s by default. External delivery and host-loss detection are not guaranteed by v1; the pilot targets below remain predictions.
5. **Evidence or it didn't happen.** The success path is `registered → starting → running → awaiting_review → completed`; any active state can instead become `failed`, `blocked`, or `timed_out`. `completed` requires an explicit `complete` and all declared acceptance checks; supply both artifact and gate for evidence-based completion. An exit code of 0 is only proof the process ended.

## Use cases

### 1. A coding agent launched on a long task

You hand a coding agent a brief and a two-hour deadline, then go do something else. Register first, with the agent's report file as the artifact and a gate that checks it exists. This integration template assumes you have created `runs/example-refactor/BRIEF.md` and installed your agent command; replace `your-agent-command` with its actual argv:

```sh
BRIEF_PATH="$(pwd)/runs/example-refactor/BRIEF.md"
AGENT_ID=$(node bin/ndm.mjs register --owner example \
  --brief "$BRIEF_PATH" --cwd ./runs/example-refactor --deadline 7200 \
  --artifact ./REPORT.md --gate-cmd 'test -s REPORT.md' \
  -- your-agent-command --brief "$BRIEF_PATH")
node bin/ndm.mjs run "$AGENT_ID"
```

If the launcher resolves the brief path wrong and the agent exits in the first second — a real failure this tool was built after — you get an alarm in seconds, not a dashboard still saying "running" and a discovery two hours later.

### 2. An overnight batch job you cannot babysit

A pipeline, backup, or data job started by an external scheduler can report its own liveness. Register it before launch. This integration template uses the registered run ID and the live job PID supplied by that scheduler; replace both placeholders. Invoke the CLI from the registry workspace (or use its absolute path):

```sh
node bin/ndm.mjs start <RUN_ID> --pid <PID>
# inside the job's main loop:
node bin/ndm.mjs heartbeat <RUN_ID>
node bin/ndm.mjs progress <RUN_ID>
```

With a stale heartbeat, the run keeps `status: "running"` but becomes `observation: "unobserved"` and is alarmed on a sweep. No-progress alarms require a profile with `noProgressSeconds`; they do not change observation/status. External attachment cannot record successful completion in v1; use `ndm run` under your scheduler when that is required.

### 3. "Exit 0" is not "it worked"

Release and migration scripts routinely exit 0 while producing nothing. Make completion depend on the evidence instead. This integration template assumes `RELEASE.md`, an executable `scripts/release.sh`, and the `dist` parent directory already exist; replace these example paths for your project:

```sh
node bin/ndm.mjs register --owner release --brief ./RELEASE.md --cwd . --deadline 1800 \
  --artifact ./dist/bundle.zip --gate-cmd 'test -s dist/bundle.zip' \
  -- ./scripts/release.sh
# Capture the printed ID, then run it and complete it as in Quickstart.
```

The run waits in `awaiting_review` until `complete` runs the gate. A green exit code alone never closes a run.

### 4. One registry for a team or several agents

Several agents — or several teammates — on one host can register into the same local state directory, and one watcher supervises those runs. Use a separate registry and watcher per host; cross-host monitoring is outside v1. `list` and `status` print JSON; incidents and acknowledgements append to `incidents.jsonl` (acknowledgement does not delete history); an optional webhook pushes alarms to your channel. The supervisor does not care which agent launched a run — only that it was registered, that it started, and that it either produced its artifact or raised an alarm.


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

- **One small core, no platform.** Plain files and one watcher process per host; events append to a JSONL log the operator reads. No shared LLM runtime.
- **Generic by config.** Owners and run paths come from registration; state paths, the optional webhook, and thresholds come from config — nothing about one person's fleet is baked in.
- **Honest states.** A run that cannot be observed is reported as *unobserved*, never as fine. Missing data is shown as missing, not as zero.
- **Safe retries only.** Operations that can duplicate external effects are never retried blindly; they stop for a human/agent decision.

## Running v1

Requires Node.js >=20; there are no runtime dependencies or install steps. The package exposes the `ndm` bin; from a checkout, use `node bin/ndm.mjs`:

```sh
npm test
node scripts/inject-failures.mjs

# Reuse brief.md from Quickstart, or write a non-empty brief first.
RUN_ID=$(node bin/ndm.mjs register --owner example --brief ./brief.md --cwd . --deadline 300 --artifact ./result.txt --gate-cmd 'test -s result.txt' -- node -e 'require("fs").writeFileSync("result.txt", "result")')
node bin/ndm.mjs run "$RUN_ID"
node bin/ndm.mjs status "$RUN_ID"
node bin/ndm.mjs complete "$RUN_ID"
```

Run `node bin/ndm.mjs watch` in a separate, independently managed process. It sweeps immediately and then waits the configured interval after each pass; `sweep` performs one pass. `watch` stops on SIGINT/SIGTERM. `list` and `status` print JSON. A stale heartbeat sets `observation: "unobserved"` while preserving `running`; an observed missing wrapper/process fails the run. Deadlines mark `timed_out` without killing processes.

Externally launched processes use `start RUN_ID --pid PID`, followed by `heartbeat RUN_ID` and `progress RUN_ID`. The caller must provide these signals; wrapper heartbeats are automatic, but meaningful progress is always explicit. External process disappearance is a failure because no successful exit was observed. `ack INCIDENT_ID` acknowledges an incident; unacknowledged incidents escalate once, even if their run is already terminal.

Optional `ndm.config.json` (not shipped or required) is read from the invocation directory. All fields below are optional; these are the defaults:

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

If a process is forcibly killed during a state transaction, an abandoned `.ndm/.lock` can remain. Confirm that the PID in `.lock/pid` and all writers are stopped before manually removing that directory. A gate interrupted while executing similarly leaves `gate_attempt` evidence for operator review. These cases are not automatically retried. See [REPORT.md](REPORT.md) for durability, transport and pilot limits, and [docs/SPEC.md](docs/SPEC.md) for the v1 contract. State includes briefs' paths, command arguments, and captured output; use a trusted local directory with access limited to intended operators, and keep secrets out of argv/logs. This is a trusted-operator tool, not isolation between untrusted tenants.

## Origin

Built by a one-person multi-agent fleet after its orchestrator missed a dead run for two hours — and the human became the alarm. The fix is deliberately boring: a registry, a preflight, a watcher, an alarm. The interesting part is whether the numbers above hold.

## License

[MIT](LICENSE).
