<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/lockup-dark.png">
    <img alt="NoDeadman Muse" src="assets/lockup-light.png" width="520">
  </picture>
</p>

**No agent run dies silently.**

A deterministic run supervisor for Muse agents. It registers every agent run before it starts, preflights its brief, watches for start confirmation, exit, and heartbeat, and raises an alarm within seconds when a run dies, stalls, or never started — with evidence, not claims.

> Status: **v1 under construction.** The design and the pre-registered pilot predictions below are public from day one; the numbers will follow the pilot, pass or fail.

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

## Origin

Built by a one-person multi-agent fleet after its orchestrator missed a dead run for two hours — and the human became the alarm. The fix is deliberately boring: a registry, a preflight, a watcher, an alarm. The interesting part is whether the numbers above hold.

## License

MIT (to be added with v1).
