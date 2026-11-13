<p align="center">
  <img alt="NoDeadman Muse" src="assets/lockup-light.png#gh-light-mode-only" width="520">
  <img alt="NoDeadman Muse" src="assets/lockup-dark.png#gh-dark-mode-only" width="520">
  <br>
  <strong>No agent run dies silently.</strong>
</p>

NoDeadman Muse is a deterministic run supervisor for individuals, teams, and agents. It records runs registered before launch, preflights their briefs, watches for start confirmation, exit, and heartbeat, and raises alarms with evidence.

![Tests: 30/30 passing](https://img.shields.io/badge/tests-30%2F30%20passing-brightgreen) ![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Node.js: >=20](https://img.shields.io/badge/Node.js-%3E%3D20-green)

## Table of contents

- [The problem](#the-problem)
- [What it guarantees](#what-it-guarantees)
- [See it catch a failure](#see-it-catch-a-failure)
- [Quickstart (5 minutes)](#quickstart-5-minutes)
- [How it works](#how-it-works)
- [Reference deployment](#reference-deployment)
- [Use cases](#use-cases)
- [For agents: run your own work under NoDeadman](#for-agents-run-your-own-work-under-nodeadman)
- [Running v1](#running-v1)
- [Project status](#project-status)
- [Design principles](#design-principles)
- [Contributing](#contributing)
- [Origin](#origin)
- [License](#license)

## The problem

Multi-agent setups fail quietly. An orchestrator launches a coding run with a wrong brief path; the process exits in the first second; the dashboard still says "running"; the human finds out two hours later by asking. The orchestrator's attention is not a monitoring system — and a smarter model does not fix a process nobody checks.

NoDeadman separates the two jobs:

- **Machines detect.** Registration, preflight, start/exit/heartbeat watching, alarm delivery: deterministic code, no LLM in the loop.
- **Agents judge.** Briefs, priorities, and quality verdicts stay with the orchestrator. A green process status is never presented as proof that the work is good.

## What it guarantees

- **Start evidence.** Registration precedes spawn; the wrapper records a PID and `started_at`. A launch command returning without error is not start confirmation.
- **Failure detection with a live watcher.** Wrapper exit reporting is immediate. By default, the watcher sweeps immediately, then waits 10 s after each sweep; unconfirmed start and stale heartbeat thresholds are 15 s and 45 s. Threshold detection happens on the next sweep, not within a guaranteed latency. An unlaunched registration is caught at its deadline.
- **Honest liveness.** A stale heartbeat raises an alarm and marks the run *unobserved* while preserving `running`. No-progress alarms require a configured profile; liveness does not prove useful progress.
- **Evidence-based completion.** Exit 0 leads to `awaiting_review`, not success. Only explicit `complete` can close a run, after all declared checks pass. Declare both artifact and gate to require both; the CLI permits either or both to be omitted. Checks do not replace quality review.
- **Persistent local alarms, limited delivery.** Incidents go to a deduplicated file outbox; the optional webhook is best effort, with no automatic retry. Periodic detection and escalation require a watcher or scheduled `sweep`; a dead host cannot alarm about itself, and cross-host monitoring is outside v1.
- **Operational limits.** Deadlines do not kill processes. Power-loss durability is not guaranteed; lock recovery can require operator intervention. External attachment cannot reach verified completion in v1. See [REPORT.md](REPORT.md#remaining-gaps-and-limitations) for the full limits; the pilot predictions remain unassessed.

## See it catch a failure

A real pilot-registry alarm record, with IDs shortened (timestamp elided):

```json
{"ts":"...","run_id":"f5e4a17d-...","event":"process_failed","exit_code":1}
```

The run died in its first second; the alarm existed within the same minute. In another real run, a wrapper masked failure as exit 0, but the artifact gate refused completion.

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

## How it works

1. **Register before spawn.** Each registered run gets an ID, owner, brief path, working directory, deadline, monitoring profile, and any declared acceptance criteria — recorded before the process launches.
2. **Preflight.** Brief is a readable, non-empty file, working directory exists, executable is available, and the declared artifact's parent directory exists. Task-specific dependencies and arguments are not checked. Fail here, and the run is rejected *before* it can die silently.
3. **Supervise.** An independent watcher sweeps immediately, then waits 10 seconds after each sweep by default: unconfirmed `starting` (threshold 15 s), missing wrapper/external process, heartbeat (stale threshold 45 s), configured no-progress limits, and deadlines measured from registration. Threshold detection occurs on the next sweep; these are not latency guarantees. Wrapper exit reporting is immediate.
4. **Alarm without the orchestrator.** Incidents go to a persistent, deduplicated file outbox and optionally a webhook (one best-effort POST, 5 s timeout, no automatic retry). Unacknowledged incidents escalate once on a sweep after 120 s by default. External delivery and host-loss detection are not guaranteed by v1; the pilot targets below remain predictions.
5. **Evidence or it didn't happen.** The success path is `registered → starting → running → awaiting_review → completed`; any active state can instead become `failed`, `blocked`, or `timed_out`. `completed` requires an explicit `complete` and all declared acceptance checks; supply both artifact and gate for evidence-based completion. An exit code of 0 is only proof the process ended.

## Reference deployment

NoDeadman is host-agnostic. A deployment is four pieces on infrastructure you already have: an always-on host, a watcher, a shared launcher, and state plus alarms. There is no server to rent, no database, and no account.

```text
agents / run owners -> one shared launcher
                                |
                                v
              registry (state dir) <- watcher
                                        |
                                        v
                         alarms (file, optional webhook)
```

**One always-on host.** Any machine that stays on and can run Node 20+ will do: a mini PC, a spare laptop, or a small VPS. The watcher and the state directory live here. If the host dies, recorded runs remain in the state directory and unresolved failures surface as incidents when it returns and the watcher resumes, provided the state files survive. The host cannot alarm while it is down; power-loss durability is not guaranteed (see [remaining limits](REPORT.md#remaining-gaps-and-limitations)).

**The watcher as a daemon.** `ndm watch` is the only long-running supervisor process. Run it under whatever supervisor you already use (pm2, systemd, or launchd) so it restarts on boot or crash. Run exactly one watcher per state directory.

**A shared launcher.** Every agent or run owner must use one small wrapper script that registers the run before spawning it. This is the only sanctioned launch path; [Use case 5](#5-make-it-the-standard-one-launcher-every-agent-must-use) describes the contract.

**State + alarms.** The state directory is plain files; back it up like any folder. Alarms land in `alarms.jsonl` and optionally go to a webhook. Assign a person or service to read the alarms, investigate incidents, and acknowledge them after handling them. Writing an alarm does not mean someone has acted on it.

**What you do not need**

- Public exposure of the registry.
- A message broker.
- A second machine for v1. A cross-host watchdog is future work.

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

### 5. Make it the standard: one launcher every agent must use

A registry only protects the runs that go through it, so the pattern that scales from one careful operator to a fleet is a single shared launcher: one small wrapper script that every agent (or teammate) uses to start work. The wrapper registers the run, captures the printed run ID, launches through `ndm run`, and refuses to start when the owner is not named explicitly — a run is never silently attributed to the wrong owner. Owners differ per launch (`alice`, `build-agent`, `nightly`); the registry, the watcher, and the completion discipline stay identical for everyone.

Rules that make it a standard rather than a suggestion:

- The launcher is the only sanctioned way to start the agent or runtime; a direct background launch is unsupervised by definition and treated as a process bug, not a shortcut.
- Every launch declares its artifact up front, and the launcher prints the run ID — the ID goes into the operator's report, so any status claim can be traced back to the registry.
- Runs close through `ndm complete` after the artifact has been checked, never on the launching agent's say-so.

This is the difference between a tool one operator remembers to use and a property of the fleet: the standard exists for the first unregistered launch that would otherwise die silently.

## For agents: run your own work under NoDeadman

You are the operator; NoDeadman watches processes. Your judgment decides what to run and whether the result is good. Spawn, liveness, exit, and declared checks do not prove useful progress or quality. The full protocol ships as [SKILL.md](SKILL.md) in the standard Agent Skills format; use it for setup, launch templates, monitoring, completion, failure handling, and external attachment.

Here, `ndm` means `node bin/ndm.mjs` from a checkout, or `node /absolute/path/to/checkout/bin/ndm.mjs` elsewhere. Run every command for one registry from the same workspace: config and state resolve from the invocation directory. Quote paths containing spaces.

**The contract**

1. **Register before spawn.** A process launched outside the registry is unsupervised by definition.
2. **Launch through the wrapper.** `ndm run` records start confirmation, heartbeat, and exit; raw `nohup`, `&`, or fire-and-forget subprocesses do not.
3. **Start is proven, not assumed.** A launch command returning without error is not evidence; verify a PID and `started_at` in the run's status record within ~15 seconds, with transitions in `history`/`events.jsonl`. Short jobs may already be in `awaiting_review` or `failed`.
4. **Exit 0 is not done.** It leads to `awaiting_review`; only `ndm complete` can mark `completed`. This protocol requires both `--artifact` and `--gate-cmd`; the CLI permits either or both to be omitted and checks only what was declared.
5. **Report only what the registry shows.** Say "running" only with start proof and a fresh `last_heartbeat_at` relative to `heartbeatStaleSeconds`; check incidents for no-progress alarms. `status` does not sweep, so a stored `running` label alone is insufficient. Say "completed" only after `complete` succeeds; an unobservable run is *unobserved*, never fine.

**Non-negotiables**

- Keep `ndm watch` running before the first run, or schedule `sweep`; without either there is no periodic stall/deadline detection or escalation. Register/run/complete still emit immediate failure alarms. A separate terminal suffices; a process manager is optional.
- Write the brief first: task, working directory, expected artifact, and done criteria. Keep briefs and artifacts in one folder per run, using absolute paths. Relative `--brief` resolves from the invocation directory; child arguments resolve from `--cwd` and cannot be validated by preflight.
- Capture the registration ID and check the exit code: preflight rejection prints an ID too. Fix the cause instead of bypassing preflight.
- Keep long-run wrappers alive. Child stdout/stderr and gate output go to `<stateDir>/logs/<RUN_ID>.log`; retain wrapper stderr separately. Missing start proof requires reading the wrapper log and `events.jsonl`, fixing the cause, and registering a new run. Never relaunch the identical failing command a third time; escalate with the failure and log lines.
- Monitor with `ndm status <RUN_ID>` / `ndm list`; never let the human discover a death. Read and judge the artifact before completion. If the gate fails, fix the work, never weaken the gate. Do not kill a quiet watcher.
- For `failed` / `blocked` / `timed_out`, read `incidents.jsonl`, `alarms.jsonl`, and `events.jsonl` before deciding; acknowledge handled incidents with `ndm ack <INCIDENT_ID>`. Retry through a new registration whose brief notes the previous ID and what changed; never hand-edit registry state.
- External processes register before launch, then attach with `ndm start <RUN_ID> --pid <PID>`, send `ndm heartbeat <RUN_ID>` more often than `heartbeatStaleSeconds`, and `ndm progress <RUN_ID>` at milestones in the same registry. They cannot reach `awaiting_review`/`completed` in v1; use `ndm run` when verified completion is required.

## Running v1

Requires Node.js >=20; there are no runtime dependencies or install steps. The package exposes the `ndm` bin; from a checkout, use `node bin/ndm.mjs`. Verify an install with the test suite and the failure-injection suite:

```sh
npm test
node scripts/inject-failures.mjs
```

Run `node bin/ndm.mjs watch` in a separate, independently managed process (see Quickstart). It sweeps immediately and then waits the configured interval after each pass; `sweep` performs one pass. A stale heartbeat sets `observation: "unobserved"` while preserving `running`; deadlines mark `timed_out` without killing processes. Externally launched processes attach with `start RUN_ID --pid PID` plus explicit `heartbeat`/`progress` calls, as in Use case 2.

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

Define additional profiles under `profiles`, then select one with `register --profile NAME`. `stateDir`, brief, and working-directory paths resolve from the invocation directory; relative artifact paths resolve from the run's working directory — use the same config directory for every command supervising a registry. State lives in `runs.json` plus append-only `events.jsonl`, `incidents.jsonl`, and `alarms.jsonl` in the state directory.

Durability limits, lock recovery, webhook delivery semantics, and the full v1 contract live in [REPORT.md](REPORT.md) and [docs/SPEC.md](docs/SPEC.md). One operational warning belongs here: state includes brief paths, command arguments, and captured output — keep the state directory on trusted local storage with access limited to intended operators, and keep secrets out of argv and logs. This is a trusted-operator tool, not isolation between untrusted tenants.

## Project status

**v1 implemented; 14-day pilot running (started 13 Nov 2026).** The design and pre-registered predictions are public from day one; the numbers will follow the pilot, pass or fail. [REPORT.md](REPORT.md) records 30/30 passing tests and four passing failure-injection scenarios as implementation checks. These do not establish pilot results, latency distributions, or an SLA; P1–P6 remain unassessed, including operational launch coverage, false alarms, triage, artifact quality, and supervision workload reduction.

### Pre-registered pilot predictions

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

- **One small core, no platform.** Plain files, one watcher per host, and an append-only JSONL event log the operator reads. No shared LLM runtime.
- **Generic by config.** Registration supplies owners and run paths; config supplies state paths, the optional webhook, and thresholds. No personal setup is baked in.
- **Honest states.** Unobservable runs are *unobserved*, never fine. Missing data stays missing, not zero.
- **Safe retries only.** Operations that can duplicate external effects stop for a human/agent decision, never a blind retry.

## Contributing

Run `npm test` and `node scripts/inject-failures.mjs` from the checkout root. Changes must keep the test suite green and the failure-injection script passing: missing brief, exit 1, heartbeat stall, and deadline. Issues welcome.

## Origin

Built by a one-person multi-agent fleet after its orchestrator missed a dead run for two hours — and the human became the alarm. The fix is deliberately boring: a registry, a preflight, a watcher, an alarm. The interesting part is whether the numbers above hold.

## License

[MIT](LICENSE).
