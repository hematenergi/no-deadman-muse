---
name: supervise-runs-nodeadman
description: "Supervise delegated or long-running runs (coding agents, builds, batch jobs) with NoDeadman Muse so no run dies silently. Use whenever you launch a run you will not watch continuously, hand work to another agent or process, or report a run's status: register the run before spawn, launch it through the ndm wrapper, verify start from evidence, and complete it only through its artifact gate."
---

# Supervise runs with NoDeadman Muse

You are the operator (a person, team, or agent coordinating runs); NoDeadman is the machine that watches processes for you. Your judgment decides what to run and whether the result is good. NoDeadman records spawn, liveness signals, exit, and declared completion checks; these signals do not prove useful progress or result quality. Never substitute your memory or a launcher's exit message for its records.

Requires Node.js >=20 and a checkout of this repository; there are no runtime dependencies. In this skill, `ndm` means `node bin/ndm.mjs` from the checkout, or `node /absolute/path/to/checkout/bin/ndm.mjs` when working elsewhere. Use your runtime's process-execution facility; no specific agent tools or skill-install folder are required. Run all commands for one registry from the same chosen workspace: optional `ndm.config.json` and the default `.ndm` state directory resolve from the invocation directory.

The command blocks are integration templates: replace angle-bracket fields with actual values and quote paths with spaces. Shell quoting and gate examples use a POSIX shell; on Windows use a POSIX environment such as WSL. Native Windows execution has not been verified. A gate runs through the platform shell; the supervised command is an argv array, not a shell string. See [README.md](README.md) for an executable Quickstart and [docs/SPEC.md](docs/SPEC.md) for the contract.

## The contract

1. **Register before spawn.** No run exists until it is registered. A process launched outside the registry is unsupervised by definition.
2. **Launch through the wrapper.** `ndm run` records start confirmation, heartbeat, and exit. Raw `nohup`, `&`, or a fire-and-forget subprocess gives you none of that evidence.
3. **Start is proven, not assumed.** A launch command returning without error is not start evidence. Only the run's own status record is.
4. **Exit 0 is not done.** A run that exits 0 waits in `awaiting_review`. It becomes `completed` only through `ndm complete`. This protocol requires both `--artifact` and `--gate-cmd`; the CLI permits either or both to be omitted and checks only what was declared.
5. **Report only what the registry shows.** Say "running" only with start proof and a fresh `last_heartbeat_at` relative to `heartbeatStaleSeconds`; check incidents for no-progress alarms too. `status` reads stored state without sweeping, so a stored `running` label alone is insufficient. Say "completed" only after `complete` succeeds. A run you cannot observe is *unobserved* — say so, never call it fine.

## Setup check (once per workspace)

1. Confirm the CLI answers: `ndm list` prints the registry as JSON.
2. Keep `ndm watch` running in a separate terminal/process before the first run. A process manager such as pm2, systemd, or launchd is optional. Without a watcher or scheduled `sweep`, there is no periodic stall/deadline detection or escalation; register/run/complete still emit immediate failure alarms. Watch sweeps immediately, then waits `sweepSeconds` after each pass (default 10 s).
3. Decide where run briefs and artifacts live (one folder per run works well); prefer absolute paths. Use a trusted local directory on one host, shared only with intended operators. Use separate registries/watchers on other hosts; v1 has no cross-host monitoring. Logs and command arguments may contain sensitive data: keep secrets out of them. No specific alarm channel is required; alarms append locally and an optional webhook makes one best-effort attempt per incident.

## Launch workflow

1. **Write the brief to a file first.** It states the task, the working directory, the expected artifact, and the done criteria. Prefer its absolute path. Relative `--brief` and `--cwd` resolve from the CLI invocation directory; relative artifacts resolve from the run's `--cwd`. Paths passed to the child command also resolve from `--cwd`; preflight cannot validate arguments understood by another tool.
2. **Register:**

   ```sh
   ndm register --owner <owner> --brief <absolute-brief-path> --cwd <absolute-work-dir> \
     --deadline <seconds> --artifact <path> --gate-cmd '<check command>' \
     -- <command...>
   ```

   `register` prints the bare run ID to stdout on valid input, including a preflight rejection: capture it and check the exit code before launch. A rejection exits 1, records `blocked`, and reports to stderr. Registration checks a readable, non-empty brief, an existing working directory, an available executable, and the artifact's parent directory when declared; a rejection here is the system working, so fix the cause instead of bypassing it.
3. **Launch:** `ndm run <RUN_ID>`. For a long run, keep the wrapper alive using your runtime or an optional process manager. Child stdout/stderr and gate output go to `<stateDir>/logs/<RUN_ID>.log`; retain wrapper stderr separately for wrapper errors.
4. **Verify start within ~15 seconds:** `ndm status <RUN_ID>` must contain a PID and `started_at`, with start transitions in `history`/`events.jsonl`. Short jobs may already be in `awaiting_review` or `failed`; you need not catch `running` while polling. Missing start proof is an unconfirmed start: read the wrapper log and `events.jsonl` in the state directory, fix the cause, and register a new run. Never relaunch the identical failing command a third time — escalate with the failure, the log lines, and what you need.
5. **Monitor** with `ndm status <RUN_ID>` / `ndm list`. While waiting, do other work; do not poll in a tight loop, and never let the human be the one who discovers a death.

## Completion and failure

- On `awaiting_review`: read the artifact yourself and judge its quality — existence and gate success prove only the declared checks. Then `ndm complete <RUN_ID>`. If the gate fails, the run stays open; fix the work, not the gate.
- On `failed` / `blocked` / `timed_out`: an incident is in `incidents.jsonl` and an alarm in `alarms.jsonl` in the state directory. Read both, plus the run's entry in `events.jsonl`, before deciding. After handling an incident, acknowledge it: `ndm ack <INCIDENT_ID>`. Unacknowledged incidents escalate once on a sweep after `escalateAfterSeconds` (default 120 s), even for terminal runs. Deadlines run from registration and still apply during review; they mark `timed_out` without killing the job.
- A retry is a **new registration** with its own brief or a brief revision noting the previous run ID and what changed. Do not resurrect or hand-edit registry state.

## Externally launched processes

If a process must be started outside the wrapper, register before launch, then attach its live PID. The ID and PID below are placeholders; all signals must use the same registry workspace:

```sh
ndm start <RUN_ID> --pid <PID>
ndm heartbeat <RUN_ID>   # at intervals shorter than heartbeatStaleSeconds (default 45 s)
ndm progress <RUN_ID>    # when a milestone is reached
```

Wrapper heartbeats are automatic; external ones are the caller's duty. A live process with a stale heartbeat keeps `status: "running"` but becomes `observation: "unobserved"` and is alarmed on a sweep. No-progress alarms require a profile with `noProgressSeconds` and do not change status/observation. External process disappearance is a failure. V1 has no successful-exit reporting command for attached processes, so they cannot reach `awaiting_review`/`completed`; schedule `ndm run` when verified completion is required.

## Anti-patterns

- Launching first and registering "once it is running" — the highest-risk seconds are the first ones.
- Reporting status from chat claims, a dashboard label, or your own recollection instead of `ndm status`.
- Calling a run done because its command exited 0, its output file was "probably" written, or its agent said so in chat.
- Weakening or skipping the gate to make a run pass. The gate is a check without external side effects; keep it that way.
- Killing the watcher because it is quiet. Quiet is its job working.
