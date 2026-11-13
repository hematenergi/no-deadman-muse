# SPEC v1 — NoDeadman Muse

Build target: a working, tested v1 of the deterministic run supervisor described in [README.md](../README.md). Node.js (>= 20), **zero runtime dependencies**, plain files for state. Run metadata comes from CLI arguments and host settings from config; no fleet-specific names anywhere in code.

## Components

### 1. Registry (state)
- State dir from config (`stateDir`, default `./.ndm`). Registry file `runs.json`: map of run records, written **atomically** (write tmp file + rename).
- Append-only event log `events.jsonl`: one JSON object per transition/event, each with `ts` (ISO), `run_id`, `event`, and event-specific fields. The registry is derived state; the event log is the evidence trail.
- Run record fields: `id`, `owner`, `brief` (path), `cwd`, `command` (array), `deadline_seconds`, `profile` (monitoring profile name), `artifact` (expected path or null), `gate_cmd` (string or null), `status`, `pid` (or null), `created_at`, `started_at`, `last_heartbeat_at`, `last_progress_at`, `exit_code`, `history` (status transitions with ts).

### 2. Status machine
`registered → starting → running → awaiting_review → completed`, plus terminal `failed`, `blocked`, `timed_out`. A transition not in this graph is rejected. `completed` is reachable **only** through the completion gate (component 5).

### 3. CLI (`bin/ndm.mjs`, package bin name `ndm`)
- `ndm register --owner <o> --brief <path> --cwd <dir> --deadline <sec> [--profile <name>] [--artifact <path>] [--gate-cmd <cmd>] -- <command...>` → creates the run in `registered`, prints the run id. Runs preflight first (component 4); preflight failure = non-zero exit, run recorded as `blocked` with the reason, incident emitted.
- `ndm run <run-id>` → transitions to `starting`, spawns the command as a child process in `cwd`, records pid + `started_at`, transitions to `running` on spawn, writes heartbeat every `heartbeatSeconds`, captures child stdout/stderr to `logs/<run-id>.log`, on child exit records `exit_code`: exit 0 → `awaiting_review`; non-zero → `failed` + incident.
- `ndm heartbeat <run-id>` / `ndm progress <run-id>` → update `last_heartbeat_at` / `last_progress_at` (for externally launched processes that cannot be wrapped by `ndm run`; in that case `ndm start <run-id> --pid <pid>` confirms start).
- `ndm complete <run-id>` → completion gate (component 5).
- `ndm status [run-id]` / `ndm list` → print registry state as JSON.

### 4. Preflight
Before spawn, verify: brief file exists and is readable and non-empty; `cwd` exists and is a directory; `command[0]` resolves (file exists or found on PATH); artifact parent dir exists when `artifact` set. Every failure is a named reason in the incident event.

### 5. Completion gate
`ndm complete` succeeds only if: status is `awaiting_review`; the declared `artifact` exists (when set); and `gate_cmd`, when set, exits 0 (run in `cwd`, output captured to the run log). Otherwise non-zero exit + incident event `completion_rejected` with the reason. This is what stops "exit 0" from being reported as "done".

### 6. Supervisor (`ndm watch`)
A long-running loop (also runnable as `ndm sweep` for one pass, which is how tests drive it):
- Every `sweepSeconds` (default 10): for each non-terminal run, check:
  - `starting` older than `startConfirmSeconds` (default 15) → incident `start_unconfirmed`, status stays, escalate.
  - `running` with a missing wrapper PID (when wrapped), or a missing process PID (when attached externally), and no exit recorded → status `failed`, incident `wrapper_lost`.
  - heartbeat stale beyond `heartbeatStaleSeconds` (default 45) → incident `heartbeat_stale` (`observation: "unobserved"`, preserve `status: "running"`, do not mark failed on heartbeat alone).
  - now past `created_at + deadline_seconds` and not terminal → status `timed_out`, incident `deadline_exceeded`.
  - no progress beyond the profile's `noProgressSeconds` (when set) → incident `no_progress`.
- Incidents are appended to `incidents.jsonl` in the state dir **and** delivered to alarm sinks: a file outbox (`alarms.jsonl`, append, deduplicated by `incident_id`) plus an optional webhook (`alarmWebhook` in config, POST JSON, best effort, failure recorded as an event, never thrown).
- Escalation: an incident unacknowledged after `escalateAfterSeconds` (default 120) produces one `escalated` incident. `ndm ack <incident-id>` acknowledges.
- The supervisor must never crash on a malformed run record: it logs an event `record_invalid` and continues.

### 7. Config (`ndm.config.json`, all optional)
`{ "stateDir", "sweepSeconds", "heartbeatSeconds", "startConfirmSeconds", "heartbeatStaleSeconds", "escalateAfterSeconds", "alarmWebhook", "profiles": { "<name>": { "noProgressSeconds": null } } }`. Defaults as above; profile `default` has no progress limit.

## Tests (Definition of Done)
- Unit/integration suite with `node:test`, runnable via `npm test`, covering: status machine legal/illegal transitions; atomic registry write; preflight rejections (missing brief, bad cwd, unknown command); `ndm run` happy path (exit 0 → awaiting_review, log captured); child exit 1 → `failed` + incident; completion gate (missing artifact rejected; artifact + passing gate → `completed`; failing gate rejected).
- Failure-injection script `scripts/inject-failures.mjs` that drives real CLI processes end-to-end and asserts: (a) brief missing → register rejected with named reason; (b) command exits 1 in <1 s → incident recorded, and the time from spawn to incident is printed (target ≤30 s in normal operation; the test asserts the incident exists and prints the measured latency); (c) heartbeat stall → `ndm sweep` emits `heartbeat_stale`; (d) deadline exceeded → `timed_out`.
- `npm test` green and the injection script exits 0.

## Out of scope for v1
Cross-host watchdog, dashboards/UI, retry of child processes, LLM anything, npm publishing. Those come after the 14-day pilot (see [README predictions P1–P6](../README.md#pre-registered-pilot-predictions)).

## Report
Write `REPORT.md` in the repo root when done: what was built per component, exact test commands and their results, measured injection latencies, and honest remaining gaps.
