# NoDeadman Muse v1 — implementation report

Date: 2026-11-13. References: `README.md` and `docs/SPEC.md`. Verification environment: macOS/Darwin arm64, Node.js **v26.8.2**. The package specifies Node.js >=20 and imports only built-in Node modules; there are no runtime or test dependencies. No git commit or git push was performed.

## Results by component

| # | Component | Results and evidence |
|---|---|---|
| 1 | Registry | `src/store.mjs`: `runs.json` is a map, written to a temporary file and then renamed. Interprocess transactions are serialized with a directory lock. `events.jsonl` stores `ts`, `run_id`, `event`, and a snapshot of every run change. Snapshots can restore a missing/corrupt registry. Required run fields are present; `wrapper_pid`, `observation`, and the temporary `gate_attempt` claim supplement operational evidence. Tests cover atomic replacement, serialization failure, recovery, and 10 concurrent CLI registrations. |
| 2 | Status machine | `src/core.mjs`: path `registered → starting → running → awaiting_review → completed`, with terminal branches `failed`, `blocked`, `timed_out` from active states. Terminal states cannot be reopened. All transition pairs are tested, including rejection of direct transitions to `completed`; only the completion gate has that authorization. |
| 3 | CLI | `bin/ndm.mjs`, executable and package bin `ndm`: all register/run/start/heartbeat/progress/complete/status/list/watch/sweep/ack commands are available. The wrapper records spawn evidence, PID, start time, automatic heartbeat, exit code/signal, and stdout/stderr to the run log. Exit-0 ends in review; nonzero exit/signal or spawn failure sends an incident. Preflight is repeated before spawn. External start requires a live PID. CLI tests use real subprocesses. |
| 4 | Preflight | The brief must be a readable, nonempty file; cwd must be a directory; the executable must be found and executable; the artifact parent must exist. Rejection is recorded as `blocked`, with `preflight_rejected` and a list of named reasons, then sent to the outbox. Tests cover missing/empty/directory brief, missing/file cwd, command not found/not executable, and missing artifact parent. |
| 5 | Completion gate | Only accepts `awaiting_review`, checks the artifact if declared, executes the gate if declared in cwd, records output, and requires exit-0. The artifact is checked again after the gate. Rejection produces `completion_rejected`. The gate claim prevents two concurrent invocations from executing the gate twice. Tests cover missing artifact, failed gate, successful artifact + gate, and concurrent complete invocations. |
| 6 | Supervisor/alarm | `src/supervisor.mjs` and `src/alarms.mjs`: one-time sweep or independent watch; start-unconfirmed, lost wrapper/process, stale heartbeat (`observation: unobserved`, without failure due to heartbeat alone), deadline, and profile-based no-progress. Invalid run records produce `record_invalid` and do not stop other records. Persistent incidents, ID-deduplicated outbox files, persistent ack, and one escalation per incident. Optional webhook POST has a 5-second timeout; failures become events. Watch stops cleanly with SIGINT/SIGTERM. |
| 7 | Config | `src/config.mjs`: optional `ndm.config.json`, default state dir `.ndm`, sweep 10 s, heartbeat 10 s, start confirmation 15 s, stale heartbeat 45 s, escalation 120 s; default profile without a progress limit. Timer values, paths, profiles and webhook URLs are validated. Relative paths and CLI usage are explained in README. |

Heartbeat and no-progress are checked while `running`; a process that has exited to review is not required to keep sending heartbeat. Deadline applies to all nonterminal states, including review. The start-unconfirmed condition preserves `starting` and its incident can still be escalated.

A real race was found and fixed: the watcher could originally see the child already dead before the wrapper finished recording exit, sending a false `wrapper_lost`. `wrapper_pid` now proves that the wrapper is still responsible for recording exit. Regression tests run the watcher every 1 ms alongside 10 short-lived children, and kill a real wrapper while its child is still alive. A deadline reached earlier also cannot be overwritten by a late exit-0; CLI run returns nonzero in that case.

## Verification commands and results

This table records initial implementation verification, not pilot results. The commands below can be run directly from the checkout root, without an additional shell wrapper. Subsequent documentation corrections and adaptability test results are in [ADAPTABILITY-REVIEW.md](ADAPTABILITY-REVIEW.md).

| Command | Result |
|---|---|
| `npm test` → `node --test test/*.test.mjs` | **Exit 0: 30 tests, 30 pass, 0 fail, 0 skipped**, latest duration 3716.449375 ms. |
| `node scripts/inject-failures.mjs` | **Exit 0**, `result: PASS`, all four scenarios below passed. |
| `./bin/ndm.mjs --help` | **Exit 0**, shebang/executable and command list work. |
| `git diff --check` | **Exit 0**, no whitespace issues in the tracked diff. |

Beyond the Definition of Done, the suite verifies automatic heartbeat, signal termination, spawn error after successful preflight, repeated preflight, status/list JSON, CLI/config validation, progress with fresh heartbeat, heartbeat recovery and recurring incidents, ack/escalation, outbox recovery, concurrent delivery deduplication, wrapper loss, and timeout during a run.

The webhook test initially tried a real loopback HTTP server, but the sandbox rejected `listen 127.0.0.1` with **EPERM**. The final test uses a mock `fetch` to check JSON POST, timeout signal, HTTP success, HTTP 503, network exceptions, failure events, and the absence of blind retries. This is not evidence that real HTTP transport succeeded in this environment.

## Failure injection: measured latency

The script uses real CLI subprocesses and isolated temporary directories; production state is untouched and directories are cleaned up. Times use wall-clock milliseconds. Endpoint observation means the alarm line has been read from `alarms.jsonl` after the CLI finishes, so it is a conservative upper bound on local append latency. Latest sample:

| Scenario | Assertion | Measurement |
|---|---|---|
| Missing brief | Register exits nonzero; record `blocked`; alarm with reason `brief_missing` | From register invocation to observed alarm: **35 ms**. |
| Fast child exit-1 | Run exits nonzero; record `failed`; `process_failed` present; child exits <1 s | CLI spawn → incident **59 ms**; child spawn evidence → incident **31 ms**; CLI spawn → observed alarm **63 ms**. |
| Heartbeat stall | External start with live PID, stops sending heartbeat; sweep sends `heartbeat_stale`; state remains `running` with `unobserved` | Last heartbeat confirmation → observed alarm **198 ms**. |
| Deadline exceeded | Sweep changes state to `timed_out` and sends `deadline_exceeded` | Register invocation → observed alarm **236 ms**. |

The injection heartbeat stale threshold and deadline are deliberately accelerated to **0.1 s**, with a real 160 ms pause before sweep; injection config sweep interval is 0.02 s. No registry timestamps are falsified in the injection script. The exit-1 measurement is far below the 30-second target. The script requires incidents/alarms to exist, rather than claiming an SLA from one sample. These figures are not pilot results, p50/p95 distributions, or proof of an SLA for the default configuration on a loaded host.

## Remaining gaps and limitations

1. **A crash inside a transaction can leave `.lock`.** The next writer waits up to around 5 seconds and then fails; the watcher records sweep failure and keeps trying. There is no automatic lease recovery yet. Operators must ensure all writers have stopped and inspect `.lock/pid` before removing the lock. This is a real risk for unattended operation, even though killing the wrapper outside a transaction has been tested.
2. **No transaction across multiple files or guarantee of power-loss durability.** Rename protects the JSON registry from partially written reads, but there is no `fsync`, checksum, or automatic repair for truncated JSONL lines. A crash after appending an event but before renaming the registry can leave a valid registry that is behind; automatic replay currently applies only to a missing/corrupt registry. Incidents/event/snapshot/outbox may require operator reconciliation after storage failure.
3. **Best-effort webhook, one attempt per incident ID.** The attempt claim is recorded before HTTP so ambiguous calls are not repeated. A crash after the claim can prevent the POST; there is no retry/backoff or redelivery after channel recovery. The outbox file remains the persistent local endpoint. P4 regarding channel/host recovery is unproven and a cross-host watchdog is outside v1 scope.
4. **The gate is a trusted command, without a dedicated execution time limit.** Deadline can still be detected by an independent watcher and prevent late completion, but does not kill the gate. Killing the CLI while the gate is running leaves `gate_attempt` for manual inspection; an explicit retry after gate failure can execute it again. Gates should be checks without external effects. Artifact/gate are optional according to SPEC: both need to be declared if run acceptance requires them.
5. **Does not manage process tree termination, PID identity, or OS daemons.** Deadline/wrapper loss does not kill the child; work or external effects can continue. PID reuse and zombie processes have not been addressed. `watch` must be run separately and kept alive by the operator/service manager; a dead host cannot alarm about itself.
6. **Scale and platforms have not been piloted.** All files are read linearly and history is not rotated. There has been no direct testing of long-term load, network filesystems, full disks, host restarts, Windows, or Node 20/22 runtimes; verification was on Node 26.8.2 macOS. Only built-in APIs available since Node 20 are used.
7. **P1–P6 have not been assessed.** The 14-day pilot stated as ongoing in README has not been completed/assessed; there are no results yet for the supervision workload baseline, >=40 operational launches, >=20 fault samples, false alarm/triage measurements, or artifact quality assessment. Passing gates and green processes do not replace human/agent review.

Dashboard, child retry, LLM, npm publishing and cross-host watchdog remain unbuilt, consistent with v1 out-of-scope. Changes are ready for supervisor review; no commit/push.
