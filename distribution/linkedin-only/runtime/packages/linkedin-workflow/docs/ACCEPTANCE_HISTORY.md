# Historical acceptance evidence

Archived checkpoints; pending statements below describe their historical time, not the current execution queue. Current status is in STATUS.md and ACCEPTANCE.md.

# Acceptance ledger

Scope: the complete PRD and E2E plan, not just the implemented subset. This is an interim ledger, not a release sign-off. Real receipts stay local; repository tests use synthetic/deidentified data.

| Cases | Current evidence | Remaining proof |
| --- | --- | --- |
| SN-01 | Explicit-profile account/search flows exercised live; wrong/disconnected Profile blocked in replay | Natural-language first task with two connected Profiles |
| SN-02 | Generic redirect remains unknown; synthetic explicit authenticated denial is unavailable and stops navigation | Controlled dependent-search stop now verified; optional real denied-account layout remains unobserved and is not a required gate |
| SN-03–06 | Account parser, unknown states, independent access, changed identity, balance and local budget tests; live account/subscription read | Full failure matrix and quota-unknown read-only live scenario |
| SN-07 | Live lead field discovery; support metadata separate from visibility/lock uncertainty | Complete two-type matrix and restricted-feature presentation |
| SN-08 | Geography and company exact-candidate reads; duplicate-label ambiguity retained and refused | Full P0 dynamic candidate matrix and ambiguity scenario through formal CLI |
| SN-09 | Live company industry + headquarters + headcount combination returned three visible cards | Company single/change/multi/clear and keyword-clear grouped L checks passed on 854feda; remaining controlled transition and full subcase audit |
| SN-10 | Five-field generic combination including seniority include/exclude verified through CLI; explicit empty result | Six grouped lead L queries and one nonempty detail DOM comparison passed; remaining controlled subcase/competition audit and final candidate verification |
| SN-11 | Base-page clean-state guards and sequential keyword/headcount live checks | Company and lead changed/cleared conditions verified across successive CLI operations; active-session interference and remaining controlled transitions remain |
| SN-12 | Actual company/lead empty-state headings observed; full lead combination returned verified_empty; parser rejects loading and conflicting cards | Company full CLI empty-flow replay and additional transition cases |
| SN-13 | Company and person defined sections read live; missing/wrong-target tests | Additional layouts and field omissions through replay/live matrix |
| SN-14–15 | Live company page coverage (25), bound restore to page 2 (30 unique), lead pages 1–2 (30 unique); replay deduplication, budget interruption, changed query/identity, expiring/corrupt checksums and page caps | Live final-window and additional interruption variants; full assertion audit |
| SN-16 | Bounded waits and classified transport failures; installed dev.7 CLI controlled-browser checks verified login/verification/redirect/denial, capability separation, unknown quota, detail 403/rate/window/timeout/locator/identity branches. Development source additionally blocks visible modal dialogs and preserves normal/hidden-dialog reads through actual CLI/DOM replay, with owned-session cleanup | Remaining search-specific interruption assertions and full case audit; controlled evidence does not claim real-site error layouts |
| SN-17 | Tests stop on an unapplied field or keyword; live strict checks exposed disabled-control layout | Verify every core operation's failure phase and observed/requested differences |
| SN-18 | Input, field/mode, URL, limit validation and CLI startup tests; installed candidate formal matrix: 27 invalid search limit/page/field/business-argument/keyword, detail ID/origin/query and option-field cases all rejected with zero dispatched OpenCLI calls | Remaining operation-specific assertions and complete matrix audit |
| SN-19–23 | Skill keeps changing business strategy and assessment outside platform adapters | Medical/changed-industry/person-first/specified-company/prompt-injection business scenarios |
| SN-24–25 | Lossless exports, CSV formula protection, Markdown escaping, atomic write/cleanup tests; formal CLI real 30-entity JSON/CSV roundtrip, Markdown rows and overwrite refusal | Integrated installed-package assessment/export completed with facts, inferences and unknowns; CLI read/write/overwrite failures verified. Formal CLI mixed-content JSON/CSV/Markdown roundtrip plus interrupted write cleanup and retry passed; final candidate confirmation remains |
| SN-26 | Doctor verified; runtime package boundary, clean commit/hash manifest and reversible project installer pass tests | Fixed clean-source candidate 0.1.0-dev.6 (3fd3f763965b) built and installed offline in an isolated project; installed Skill explicitly read; installed CLI account/search/detail/model assessment and JSON/CSV/Markdown export completed. Automatic host indexing and other hosts remain unverified |

No row here implies the whole numbered case passes unless all of its E2E-plan assertions have direct evidence. Current implementation still cannot satisfy the entire acceptance plan.

## Current frozen-candidate checkpoint (2026-10-20)

The historical table above is an evidence inventory, not a fresh execution queue. Current candidate is `0.1.0-dev.8`, source `81ac508ecbd9a3b4d53f9df19b3030576f8a6566`, archive SHA-256 `4aee780cf03efde8f115806ac6c47e72f9936e4dc6e00ff2065cf73af8bb1baa`. It passed 127 offline tests; isolated project installation checked 42 payload files. The same installed candidate passed all 23 repository controlled technical groups (508 protocol calls), source hashes matched the package manifest. See CONTROLLED_ACCEPTANCE.md for exact coverage and protocol-bridge limits.

This closes the formerly pending fixed-candidate controlled aggregate; it does not close all top-level cases. Field L receipts remain bound to their original source hashes. The final audit must check changed runtime files against that coverage rather than assume every historical L check applies unchanged.

SN-19 dev.8 run 1 initially stopped before search on subprocess connection errors. Privileged read-only diagnostics confirmed the intended Profile and controlled service were connected. The same independent run resumed with original failures preserved; actual account check, option discovery and direction queries are now executing serially. No business PASS is recorded at this checkpoint. Remaining SN-19–23 runs, dev.8 first real installed task and full assertion audit remain open.

## Historical fixed-candidate acceptance

Candidate: `0.1.0-dev.6`, source `3fd3f763965bd94dd0165ea097ad63e1d3f20a5f`, archive SHA-256 `bda69b6c1614c63f4a27d18daa8795929d9606d309bb6a885520f56e21ecd117`. Remote main was verified at that source commit before this ledger update. Raw receipts stay outside Git.

The isolated first task exported one assessed company, preserving the original detail record and marking regional presence/team size and verified global size as unknown. This proves the installed first-task chain, not the entire business prospecting requirement. Eleven formal CLI negative-input/export-failure checks passed against the installed candidate.

User authorized ten independent, serial business runs (SN-19–23, twice each). They use the same installed candidate and inherited model configuration. Historical runs are recorded below; independent business acceptance is stopped pending technical verification. No aggregate pass is claimed.

SN-19 run 1 completed as `PARTIAL_NOT_PASSED`: exact account binding, observed headcount options, a five-card search with matching applied conditions, one real company detail, four separately labelled synthetic counterexamples, and lossless JSON assessment export were verified. A second Boolean search returned `search_not_confirmed`, not an empty result. No candidate was claimed to satisfy regional presence/team evidence. Eye/hearing/IVD direction-specific coverage remains unproven. Receipt-accounted local calls: 147/220; doctor dependency probes are separately recorded. The independent run 2 outcome is recorded below.

SN-19 run 2 also completed as partial/not passed: dental and IVD searches returned five cards each; ophthalmic and hearing multi-headcount queries failed at selection, one company detail/export succeeded, and no regional qualification was invented. Both old-candidate runs remain failed evidence. Developer reproduction isolated three defects (option count churn, snapshot input truncation, empty pager containers). All three have regression tests and live query rechecks; corrected ophthalmic and long Boolean queries each returned five records. The fixed dev.7 source has 102 passing tests; the new frozen candidate still needs independent reruns.

Development source after `4a9b592` has 107 passing tests. Three controlled-browser cases (normal company, visible modal, hidden modal) ran through the real CLI, OpenCLI transport and DOM extraction, with all external requests intercepted. The visible modal returns `page_blocked` at `readCompany`; normal/hidden cases preserve source fields. All three closed their owned session. The dedicated controlled browser was terminated in finally. This is R evidence on development source, not a new frozen candidate or a real-account run.

Execution-context development source has 115 passing offline tests. Nine controlled CLI steps verified unknown quota remains usable for a confirmed read, identical full/cached company facts, no settings reads during reuse, invalidation after 403, zero-dispatch rejection of invalidated context, same-name self-URL changes, and browser reconnection invalidation before opening the target. Full company read used 16 protocol calls versus 9 with context, including connection-generation verification and owned-session cleanup; this is R performance evidence only. A separate inline-denial replay proves stale entity DOM is not extracted after explicit access denial, and the context is invalidated. No new real-account business run or frozen candidate was created for these changes.

Cleanup-failure replay additionally verified that a completed diagnostic keeps its observed facts but does not issue a reusable context when owned-tab cleanup fails; only one cleanup attempt is made, and the outer controlled browser is still disposed. Context files are diagnostic snapshots, not credentials or reusable authorization.

## Company matrix and dependent-stop verification after 854feda

Five grouped live company queries passed (single Boolean combination, changed conditions, three-field multiselect, clear all fields, clear keywords), with direct observed-page query comparison, exact actual protocol budget counts and owned-tab cleanup. See COMPANY_FIELD_VERIFICATION.md. These receipts supplement SN-09/SN-11; they do not close all required L+R or lead assertions. No new business double run or frozen candidate was created.

Three controlled CLI account-search attempts under explicit denial, login and verification returned account_unconfirmed, opened only the diagnostic home page, never opened the dependent search page, and closed the owned session. This closes the specific missing dependent-stop evidence for SN-02 and supplements SN-16; real denied layout is optional per the plan and remains unobserved. State snapshots for these gate branches are controlled protocol fixtures; do not describe them as live-site DOM observations.

## Lead matrix and additional controlled/file evidence

Six lead field groups and one queried-person detail comparison passed across explicitly recorded source hashes; see LEAD_FIELD_VERIFICATION.md. Missing current-role section remained not_observed. Failed budget/no-ID/redraw/route attempts remain local failure evidence and are excluded from passed groups.

See EXPORT_AND_SEARCH_REPLAY_VERIFICATION.md for full-envelope mixed-content CLI exports, injected partial temporary write and exact retry, plus actual controlled search DOM normal/empty/overlay branches. Partial collection now invalidates its old diagnostic snapshot while preserving facts and recovery. Production-CLI controlled replay and the persistent private-file invalidation regression passed; full offline suite is 125 tests. These records do not close the outstanding complete recovery/competition matrix, independent business double runs or final candidate installation gate.

## Repository controlled acceptance before dev.8 freeze

23 controlled technical groups now have direct production-CLI/protocol/DOM evidence; see CONTROLLED_ACCEPTANCE.md and test/acceptance/README.md. New coverage includes second-page failure/export/recovery, budget refusal before Next dispatch, ID/name dedup semantics, zero-dispatch invalid checkpoints, independent company/lead access, partial-field and keyword postconditions with observed differences, and same-Profile inter-process exclusion. CSS selector_not_found maps to page_changed. No new real-user tab or business double run was needed for these tests.

This supplements SN-04, SN-06, SN-08 and SN-13–18. Individual development group receipts are not a fixed candidate aggregate. Final candidate package binding, SN-19–23 independent dual runs, SN-26 final isolated first task and the complete 26-case audit remain open.

## dev.8 independent business checkpoint: SN-19 run 1

The same independent run recovered its subprocess permissions without changing candidate payload or deleting the first blocked phase. Four real direction queries returned five bounded records each with requested/applied conditions equal. Three real details were read; the report retained their original IDs, URLs and fields exactly. Four synthetic counterexamples were read through normal account-read and assessed separately. No SEA headcount was invented, no synthetic company entered the real result list, and no company was claimed to satisfy all requirements.

Root independently checked archive/source binding on every recorded command, trace counts against all receipts, target Profile on successful platform operations, four direction queries, detail/report equality and full JSON/CSV roundtrips. Markdown retained entity IDs and unknown states. Cumulative usage including failed phase: 25 commands, 173 live protocol calls and 63 controlled calls. Outcome: bounded SN-19 hard assertions supported; business outcome remains three review-only entities and zero fully confirmed entities. This is one run, not a dual-run signoff.

SN-26 now has current-candidate first-task evidence: the previously verified isolated project install and explicit installed Skill invocation were followed by successful account check, real searches, real detail reads, model assessment and three exports. Initial environment failure and subsequent recovery remain recorded. This proves the scoped macOS/Codex explicit invocation chain; automatic host indexing and other hosts are not claimed. No extra browser task was repeated solely to provide SN-26 evidence.

SN-19 run 2 has started independently against the same installed candidate. Other eight business runs and the full 26-case assertion audit remain outstanding at this checkpoint.

## dev.8 SN-19 independent dual-run review

Run 2 independently completed four bounded live directions, three details and four separate synthetic counterexamples; 20 commands, 184 live and 49 controlled calls. Root independently verified every receipt source/package binding, actual trace counts, account binding, condition equality, original detail/report field equality, synthetic separation and model decisions, no unknown team count promoted to qualification, and JSON/CSV full-envelope roundtrip. Both runs support the SN-19 bounded hard assertions; neither proves a fully qualified business shortlist or SEA team evidence. Both failures from the older candidate runs remain historical rather than overwritten.

The second run also observed the live company field catalog: 14 currently visible fields, three core adapted company filters, unsupported additional fields, unknown per-field lock states and separately restricted CRM capability. This supplements SN-07 without opening another duplicate inspection task. The panel is a visible subset, not the entire platform field inventory.

SN-20 run 1 is now executing serially. Remaining eight business runs and final complete assertion audit are open.
