---
name: supervise-runs-nodeadman
description: "Supervise delegated or long-running runs (coding agents, builds, batch jobs) with NoDeadman Muse so no run dies silently. Use whenever you launch a run you will not watch continuously, hand work to another agent or process, or report a run's status: register the run before spawn, launch it through the ndm wrapper, verify start from evidence, and complete it only through its artifact gate."
---

# Supervise runs with NoDeadman Muse

You are the orchestrator; NoDeadman is the machine that watches processes for you. Your judgment decides what to run and whether the result is good. It decides whether the process actually started, is still alive, exited, stalled, or produced its artifact. Never substitute your memory or a launcher's exit message for its records.

In this skill, `ndm` means `node bin/ndm.mjs` run from a checkout of this repository, or the `ndm` bin if the package is installed. All commands for one registry must run from the same directory — the one containing `ndm.config.json` — because the config and state directory resolve from the invocation directory.

## The contract

1. **Register before spawn.** No run exists until it is registered. A process launched outside the registry is unsupervised by definition.
2. **Launch through the wrapper.** `ndm run` records start confirmation, heartbeat, and exit. Raw `nohup`, `&`, or a fire-and-forget subprocess gives you none of that evidence.
3. **Start is proven, not assumed.** A launch command returning without error is not start evidence. Only the run's own status record is.
4. **Exit 0 is not done.** A run that exits 0 waits in `awaiting_review`. It becomes `completed` only when `ndm complete` confirms the artifact exists and the gate command passes.
5. **Report only what the registry shows.** Say "running" only while `ndm status` shows it fresh. Say "completed" only after `complete` succeeds. A run you cannot observe is *unobserved* — say so, never call it fine.

## Setup check (once per workspace)

1. Confirm the CLI answers: `ndm list` prints the registry as JSON.
2. Confirm a watcher is running (`ndm watch` under your process manager — pm2, systemd, launchd, or a supervised shell). Without the watcher there are no sweeps, no stall detection, and no alarms. Start it before the first run, not after the first death.
3. Decide where run briefs and artifacts live (one folder per run works well) and keep paths absolute.

## Launch workflow

1. **Write the brief to a file first.** It states the task, the working directory, the expected artifact, and the done criteria. Record its absolute path — a relative brief path resolves against the wrong directory and the run dies in the first second.
2. **Register:**

   ```sh
   ndm register --owner <you> --brief <abs path> --cwd <abs dir> \
     --deadline <seconds> --artifact <path> --gate-cmd '<check command>' \
     -- <command...>
   ```

   `register` prints the bare run ID and nothing else — capture it exactly. Registration preflights the brief, the working directory, and the command; a rejection here is the system working, so fix the cause instead of bypassing it.
3. **Launch:** `ndm run <RUN_ID>`. For a long run, background the wrapper under your process manager and keep its output log.
4. **Verify start within ~15 seconds:** `ndm status <RUN_ID>` must show `starting` → `running` with a PID and a fresh `started_at`. No start evidence means a dead run: read the wrapper log and `events.jsonl` in the state directory, fix the cause, and register a new run. Never relaunch the identical failing command a third time — escalate with the failure, the log lines, and what you need.
5. **Monitor** with `ndm status <RUN_ID>` / `ndm list`. While waiting, do other work; do not poll in a tight loop, and never let the human be the one who discovers a death.

## Completion and failure

- On `awaiting_review`: read the artifact yourself and judge its quality — the gate proves existence, not goodness. Then `ndm complete <RUN_ID>`. If the gate fails, the run stays open; fix the work, not the gate.
- On `failed` / `blocked` / `timed_out`: an incident is in `incidents.jsonl` and an alarm in `alarms.jsonl` in the state directory. Read both, plus the run's entry in `events.jsonl`, before deciding. After handling an incident, acknowledge it: `ndm ack <INCIDENT_ID>`. Unacknowledged incidents escalate once, by design.
- A retry is a **new registration** with its own brief or a brief revision noting the previous run ID and what changed. Do not resurrect or hand-edit registry state.

## Externally launched processes

If a process must be started outside the wrapper (cron, systemd, another supervisor), attach it instead:

```sh
ndm start <RUN_ID> --pid <PID>
ndm heartbeat <RUN_ID>   # from inside the job, on an interval
ndm progress <RUN_ID>    # when a milestone is reached
```

Wrapper heartbeats are automatic; external ones are the caller's duty. A live process with a stale heartbeat is reported *unobserved* and alarmed — a stall must not hide behind a live PID. An external process that disappears without an observed successful exit is a failure.

## Anti-patterns

- Launching first and registering "once it is running" — the highest-risk seconds are the first ones.
- Reporting status from chat claims, a dashboard label, or your own recollection instead of `ndm status`.
- Calling a run done because its command exited 0, its output file was "probably" written, or its agent said so in chat.
- Weakening or skipping the gate to make a run pass. The gate is a check without external side effects; keep it that way.
- Killing the watcher because it is quiet. Quiet is its job working.
