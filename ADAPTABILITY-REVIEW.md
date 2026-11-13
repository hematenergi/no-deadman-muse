# Adaptability review — NoDeadman Muse

Date: 2026-11-13. Reviewer: Codex, independent review of documentation and adoption procedures. Baseline checkout: `59583f0d61f360ba5c76ffbe7d5c738b90e220b1`. Test environment: macOS/Darwin arm64, Node.js v26.8.2, POSIX shell. No commit/push.

## Scope and results

The entire README, SKILL, SPEC actually located at `docs/SPEC.md`, REPORT, and LICENSE were read. There is no bundled `ndm.config.json` at the root: the README's JSON example was compared with `loadConfig()`. The CLI code, registration/preflight, completion, storage, supervisor, alarms, and related tests were traced to check the documentation's claims. The public content review also found dependencies on the original machine in the documentation/asset generator.

Corrections were made in the working tree. The supervisor CLI was not changed: the behavioral findings below match the v1 contract and were corrected in the documents. The optional asset generator was fixed to let the operator select font and renderer inputs; no logo assets were regenerated. Both required suites passed. This is evidence of local adoption and document consistency, not evidence that every OS or every agent integration has been tested.

## List of findings and fixes

Locations refer to sections/function names in the corrected version, so they remain discoverable after line numbers change.

| # | File + location | Class | Defect found → fix |
|---|---|---|---|
| 1 | README, opening paragraph | non-generic | Audience limited to “Muse agents” → individuals, teams, and agents; the product name remains NoDeadman Muse. |
| 2 | README, opening / How it works | claim-code-mismatch | Implied that all launches are automatically registered and all runs that never launch are detected within seconds → only registered runs are monitored; an unlaunched `registered` run is detected at its deadline, not the 15 s start threshold. |
| 3 | README Quickstart; README/SKILL setup | non-generic | POSIX shell, `test`, an existing checkout, and the watcher directory were not explicit enough → prerequisites stated, watcher run from the same registry directory, process manager only an option, native Windows unverified. |
| 4 | README Quickstart / Running v1 | execution-error | `<RUN_ID>`/`RUN_ID` required manual replacement and raw angle brackets mean redirection to the shell → runnable examples capture the ID in a shell variable and quote it. Exit 1 in the failure example is marked as the expected result. |
| 5 | README/SKILL register | inconsistent | Instructions only said to capture the bare ID, without mentioning that preflight rejection also prints an ID → require checking the exit code; explain `blocked`, exit 1, and stderr messages. Invalid CLI input may be rejected before producing an ID. |
| 6 | README For agents; SKILL opening | non-generic | CLI usage appeared tied to the checkout/current directory and a configuration file appeared mandatory → the registry workspace can be chosen freely, configuration is optional, the CLI can be invoked through an absolute path from another workspace; no particular runtime/tool/skill folder is required. |
| 7 | README/SKILL Launch workflow | claim-code-mismatch | Relative briefs were always described as wrong → actual rules explained: brief/cwd relative to the invocation directory, artifact relative to the run cwd, child arguments relative to the child cwd. |
| 8 | README Use case 1 | execution-error | Brief `./runs/REFAC-123/BRIEF.md` passed again to an agent whose cwd was already that folder → the same absolute brief path is used for registration and the child. |
| 9 | README Use cases 1 and 3; README/SKILL register template | inconsistent | Agent command, BRIEF/RELEASE, release script, and parent `dist` were not provided and were not clearly marked as templates → prerequisites/examples marked explicitly; placeholders explained and must be replaced/quoted. The Running v1 example mentions the brief from Quickstart. |
| 10 | README/SKILL setup | claim-code-mismatch | Claimed there were no alarms at all without a watcher → register/run/complete still send immediate failure alarms; sweep/watch are required for periodic checks and escalation. |
| 11 | README/SKILL start verification | claim-code-mismatch | Polling had to see `starting` then `running`, so a successful short-lived child could be mistaken for a dead one → check PID, `started_at`, history/events; polling may already see review/failed. Missing evidence is described as unconfirmed, not definitive proof of death. |
| 12 | README/SKILL completion contract | claim-code-mismatch | Artifact and gate described as always required by the CLI → both are optional according to SPEC/code; the adoption protocol still requests both as evidence of results, with a clear distinction from CLI rules. |
| 13 | README/SKILL completion | inconsistent | Gate described as proving existence alone → existence + gate exit only prove the declared checks; quality review remains the operator's job. |
| 14 | README/SKILL status monitoring | claim-code-mismatch | `status` appeared to check freshness directly → it only reads stored state; check heartbeat timestamps and progress incidents, do not rely on the `running` label alone. |
| 15 | README How it works; SKILL setup/failure | claim-code-mismatch | Sweep “every 10 s”, start “≤15 s”, escalation at exactly 2 minutes, and delivery ≤30 s sounded like guarantees → thresholds/defaults explained separately from sweep scheduling, pass duration, and pilot predictions. Webhook is a single best-effort POST with a 5 s timeout, without automatic retry. |
| 16 | README How it works | inconsistent | Diagram could imply that all terminal branches originate only from review → success path and terminal branches from each active state explained separately. |
| 17 | README/SKILL preflight | claim-code-mismatch | “Declared prerequisites”/working directory “correct” too broad → actual checks specified: readable/nonempty brief, directory cwd, executable, artifact parent. Task arguments/dependencies are not preflight's responsibility. |
| 18 | README Quickstart, injection description | claim-code-mismatch | Wrapper exit-1 attributed to the watcher and injection claimed to cover every failure class → wrapper reports exit immediately; injection covers only the four scenarios actually present. |
| 19 | README Use case 2 | execution-error | `$!` used without a background launch in the example → explicit PID from the scheduler/operator, after registration and before launch; ID/PID marked as placeholders. |
| 20 | README/SKILL external processes | claim-code-mismatch | Attach path did not explain the absence of a successful-exit API → marked as liveness-only, cannot reach review/completed; scheduling `ndm run` recommended for verified completion. |
| 21 | README Use case 2; SKILL external processes; docs/SPEC supervisor | claim-code-mismatch | Heartbeat/no-progress conflated as automatic “unobserved” → stale heartbeat retains `running` with an `observation` field; no-progress requires a profile and only sends an incident. External heartbeat interval explained. |
| 22 | README Use case 4 / Design principles; SKILL setup | non-generic | Registry “whole fleet” could be read as cross-host/tenant; event “bus” and all metadata “in config” inaccurate → one local registry per host, trusted operators, JSONL log; run owner/path from register, host settings from config. Access to argv/log data needs to be restricted. |
| 23 | README Use case 4 | claim-code-mismatch | Ack sounded like it removed queue items → incidents and acks append to history; ack does not remove them. |
| 24 | README/SKILL launch logs | inconsistent | “Wrapper log” not distinguished from child/gate output → location `<stateDir>/logs/<RUN_ID>.log` specified, wrapper stderr stored separately. |
| 25 | REPORT, Verification commands | non-generic | Local shell wrapper appeared as a verification step → direct commands listed; old figures remain marked as initial implementation results, not new test or pilot results. |
| 26 | REPORT, gap #7 | inconsistent | “No 14-day pilot yet” ambiguous relative to the README's ongoing status → clarified as not yet completed/assessed. The meaning of the pilot status is unchanged. |
| 27 | docs/SPEC, opening / supervisor / out of scope | inconsistent | README reference was not a relative link; wrapper loss description too brief → `../README.md` link and wrapper PID versus external PID rules aligned with the implementation that avoids the child-exit race. State contract unchanged. |
| 28 | assets/BRAND.md; assets/build-logo.py, font/renderer configuration | non-generic | Personal/agent names and font/helper renderer paths from the original machine leaked into public content → brand history made generic, generator accepts `--serif-font`, `--tag-font`, and `--resvg`, and uses the standard resvg CLI without a helper outside the repo. Geometry, colors, and bundled assets unchanged. |
| 29 | assets/BRAND.md, file list / regeneration | inconsistent | Proof/context PNGs described as if included in the checkout; generator dependencies incomplete → generator outputs marked as not included; Python/fontTools/Pillow/numpy/resvg/fonts listed as optional prerequisites, separate from the Node CLI with no runtime dependencies. Specific parser-failure claim replaced with a general SVG compatibility rationale. |

## Execution evidence

### Scratch and Quickstart

The HTTPS clone attempt from the README was actually run and **failed with exit 128**: `Could not resolve host: github.com`. This is a sandbox DNS/network limitation, not a successful public clone. To continue, the same baseline was cloned locally with `git clone --no-hardlinks` into `/tmp/ndm-adaptability-original`. A fresh final clone at `/tmp/ndm-adaptability-final-zmw_2_a2/no-deadman-muse` received an overlay of only the corrected files from the working tree because the changes were deliberately not committed.

The original Quickstart succeeded after the placeholder ID was replaced with a real ID. Separate reproduction of the original Use case 1 brief path: register exit 0, child read a path that became incorrect after cwd changed, run exit 1. This is an example defect, not a preflight failure: preflight does not understand another agent's arguments.

The final Quickstart was extracted from the README's fenced blocks and run in the same shell to preserve ID variables. The watcher ran as a separate process with default config and was stopped via SIGTERM (exit 0).

| Step | Final result |
|---|---|
| Write brief | Exit 0; file non-empty. |
| Register with artifact and gate | Exit 0; bare UUID captured in `RUN_ID`. |
| Run + status | Exit 0; `awaiting_review`, PID and `started_at` present. |
| Complete | Exit 0; `result.txt` contains exactly `report body`; history `registered → starting → running → awaiting_review → completed`. |
| Register failure example | Exit 0; new ID, separate from the successful run. |
| Run `process.exit(1)` | **Expected exit 1**; status `failed`, incident/alarm `process_failed` for the same ID. |
| List, status without ID, ack, sweep | Exit 0; JSON and persistent ack verified. |
| Injection from Quickstart | Exit 0, PASS. |

Final evidence IDs: success `629bdefe-8527-409b-a81a-790eeab226d7`; failure `e94ade84-5f9c-4e10-8af4-b6d1976b41c3`. Test state isolated from the working workspace's `.ndm`. Watcher/child processes launched for testing were stopped after the checks.

### Templates and adaptability

The final runner recorded **29 shell/CLI invocations**, covering:

- All Quickstart shell blocks after the clone step, plus the Running v1 block (including `npm test` and injection) with the documented brief prerequisite.
- Coding-agent use case with the `your-agent-command` executable fixture: actually read the absolute brief from the run cwd and produced REPORT, then run/complete succeeded. This is a CLI contract test using a stub, not evidence of compatibility with a particular agent product.
- Release use case with fixture `RELEASE.md`, parent `dist`, and executable `scripts/release.sh`: register/run/complete succeeded. The fixture bundle contains only test data for the `test -s` gate, not a quality or ZIP format test.
- README and SKILL register templates are identical after ignoring whitespace; both were filled with the same values and succeeded from a workspace outside the checkout through an absolute CLI path. Brief, cwd, and state directory names contain spaces; arbitrary owner `example-team`.
- Both documents' external start/heartbeat/progress templates were run using a real child PID, after register. Complete while still running was rejected; after the PID disappeared, sweep changed the status to failed. No external successful exit was assumed.
- Profile `batch` with no-progress 0.1 s raised an alarm even while the heartbeat was fresh and did not change observation. Losing heartbeat produced `unobserved`; ack succeeded. Timers were accelerated only in the profile test workspace.
- All README default JSON fields matched `loadConfig()` without a config file, after normalizing relative `stateDir` to absolute. `--help` and the executable shebang also exited 0.

Additional measurement without a config file in scratch `/tmp/ndm-default-HZTeCJ`: a real wrapper emitted a heartbeat after **10.005 ms**; an external PID that stayed alive without heartbeat received `heartbeat_stale` after **50.092 ms** under the default watcher. At around second 46, reading `status` still did not include observation `unobserved`; after the next sweep, status remained `running` and observation became `unobserved`. There was no no-progress alarm because the default profile sets no limit. This is one sample supporting the threshold + sweep rule, not a latency guarantee.

### YAML and links

SKILL frontmatter was already valid at baseline and remains valid after correction. Checked using a real YAML parser, **Ruby Psych 5.3.1**, `YAML.safe_load`, not regex as a parser. Assertions ensure the map contains `name` and `description` with non-empty string values. No YAML dependency needed to be added to the package. The already-quoted description was preserved; there is no other frontmatter in the repo's public documents.

Relative Markdown links and HTML `src` were checked against repo files, including README anchors: **12 references, all valid**, after this report file became available. The README header, pilot status, the entire P1–P6 prediction section, LICENSE, and all bundled SVG/PNG files were also compared byte for byte with baseline: all remained identical. Both Python files passed `ast.parse` syntax checks. `ndm.config.json` is not linked as a bundled file; the README JSON is an optional configuration example.

### Regression from the repo root

| Command | Result |
|---|---|
| `npm test` | Exit 0; **30 tests, 30 pass, 0 fail, 0 skipped**. |
| `node scripts/inject-failures.mjs` | Exit 0; **PASS**, all four scenarios. |
| `python3 test/logo-generator.test.py` | Exit 0; 1 unittest with 3 subcases: help, missing font, missing renderer. All ensure no asset output is written before validation succeeds; no graphics packages required. |
| Psych YAML parser | Exit 0; structure/name/description valid. |
| `git diff --check` | Exit 0. |

Root injection sample in this review (wall clock, including subprocess overhead): missing brief to observed alarm **39 ms**; exit-1 from CLI spawn to incident **57 ms**, child spawn to incident **23 ms**, CLI spawn to observed alarm **61 ms**; heartbeat stall **200 ms**; deadline **227 ms**. Injection heartbeat/deadline thresholds **0.1 s**, not operational defaults. These figures are one sample, not an SLA or pilot results.

## Intentionally unchanged

- README logo/header, bundled SVG/PNG, brand colors/geometry: this is not a redesign task. The “NoDeadman Muse” product identity remains; “Muse” as an agent prerequisite has been removed.
- P1–P6 predictions and pilot status in README: frozen by mandate; not declared passed based on this suite. Origin remains a generic story of a one-person multi-agent fleet.
- MIT LICENSE and copyright attribution: the name there is legal attribution, not a setup prerequisite. The obligation to retain the notice is not removed.
- API, state machine, default values, and optional artifact/gate in the CLI: consistent with SPEC. Protocol documentation may recommend artifact + gate, without claiming the CLI requires them.
- No runtime dependency, agent framework, process manager, webhook retry, external exit API, cross-host daemon, installer, or npm publishing added: unnecessary for the corrections and some explicitly outside v1 scope.
- Historical REPORT implementation figures preserved, marked as historical; this run's results reported separately. User registry/live state not edited.
- No folders or context outside the repo opened except the already-authorized skill/RTK instructions; no mailbox used or other parties contacted. This run's brief is sufficient for the work.

## Remaining risks and verification limits

1. GitHub cloning over HTTPS could not be demonstrated from the sandbox due to DNS; a local clone does not replace evidence of public connectivity. No commit/push, so public availability still requires the repo owner to publish the corrections.
2. POSIX/macOS and Node 26.8.2 were tested in this run. Native Windows, WSL, Linux, Node 20/22, process managers, and particular agent runtimes have not been directly tested; the documents do not claim that platform matrix passed.
3. The registry is single-host with mutually trusted operators. PID reuse, zombie processes, network filesystems, multi-user permissions, history scaling/rotation, crash locks, and power-loss durability remain v1 limitations already detailed in REPORT.
4. The watcher requires an independent process that stays alive. Wrapper heartbeat proves the wrapper is signaling, not that the agent is making progress. No-progress requires a profile; deadline does not kill the child/gate. A dead host cannot alarm about itself.
5. Webhook is a single best-effort attempt; channel/host recovery and real HTTP transport are not demonstrated by mock tests. P4 remains a prediction, not a promised feature.
6. Artifact/gate are optional and the gate is a trusted command without a dedicated timeout. Operators need to choose checks and perform quality review. External attach cannot successfully complete a run in v1.
7. Full logo regeneration was not run: fonts, fontTools, Pillow, and the resvg binary were unavailable in this test environment. Argument validation and Python syntax were tested; usage of `resvg --width WIDTH INPUT OUTPUT` was checked against the [official resvg CLI source](https://github.com/linebender/resvg/blob/main/crates/resvg/src/main.rs). Byte-identical output across font/renderer versions has not been demonstrated. Regeneration must be done in a copy of the checkout because it overwrites assets.

There is no technical blocker inside the repo preventing either required suite. The network and graphics tooling limits above are reported as they are and are not treated as evidence of success that has not been established.
