# Current extension: 2026-10-21

Development candidate dev.10 expands the parameter catalog to 15 account and 33 lead fields (2 CRM entries explicitly restricted in the validated Core environment). See ALL_FILTERS.md for exact contracts and verification limits. It also includes the local HTML report work. New runtime validation: three formal CLI groups passed with 76 OpenCLI calls total; four range types, name+toggle, follower enumeration. Other newly catalogued fields are not all independently CLI-tested. The dev.9 acceptance below remains historical and must not be applied to the extension.

# Development status

2026-10-20. The independent SalesNav development and scoped acceptance are complete. The private repository contains reviewed source and deidentified evidence summaries; no public release is claimed. Align, external writes, P1 filters and other hosts remain outside the original scope.

## Implemented and verified scope

- Explicit Chrome Profile, display identity and exact self-URL checks; independent SalesNav/company/lead capability gates; unknown differs from denial.
- Company keywords/industry/headquarters/headcount; lead keywords/current company/geography/title/function/seniority, multiselect, supported exclusions, complete-replacement clearing and actual postconditions. Live field evidence: COMPANY_FIELD_VERIFICATION.md and LEAD_FIELD_VERIFICATION.md.
- Defined company/person details, field-level missing/partial states, bounded pagination, exact-ID deduplication and query/account/version-bound recovery.
- Pre-dispatch local budgets, same-Profile exclusion, owned-tab cleanup, short-lived identity-revalidated diagnostic snapshots. No global configuration changes.
- Local atomic JSON/CSV/Markdown exports, complete-envelope preservation, formula-safe CSV display, no overwrite and interrupted-write cleanup.
- Independent project-local Skill/CLI installation and a real first task without Align. macOS/Codex explicit installed Skill invocation verified; automatic host indexing and other systems unverified.

Deterministic steps and error/recovery contracts are in PLATFORM_OPERATIONS.md; full scope audit is FINAL_AUDIT.md. Historical failures remain in ACCEPTANCE_HISTORY.md.

## Completed acceptance checkpoint

Frozen `0.1.0-dev.8`, source `81ac508ecbd9a3b4d53f9df19b3030576f8a6566`, package SHA-256 `4aee780cf03efde8f115806ac6c47e72f9936e4dc6e00ff2065cf73af8bb1baa`: 127 offline tests; 42 installed payload files checked; 24 controlled technical groups (553 protocol calls, including three final account-gate gaps).

All ten authorized independent SN-19–23 runs completed and were reviewed against raw receipts. Aggregate includes failures/recovery/report corrections: 112 commands, 903 live and 236 controlled calls. Run outcomes and limitations are in ACCEPTANCE.md. Business outcomes do not imply a fully qualified prospect list; unknown regional headcount and contradictory person locations remained explicit.

## Final candidate and additive fix

Audit found nominal monthly quota was not a separate returned field, although current balance was already distinguished. Development version `0.1.0-dev.9` adds `nominal_quota` with explicit unknown/null and preserves that state during context reuse. It never infers monthly allocation from current available InMail. Targeted account/context regression and the final 128-test clean-source build passed. The final project-only offline install checked 45 payload files. Formal controlled quota-unknown replay passed (45 calls), and the final installed CLI completed exact account checking, one real search/detail, model assessment and lossless JSON export (44 live calls, six commands).

Only runtime changes from dev.8 are that additive metadata and version. Search, selection, detail, pagination, budget, locking, export and business Skill implementations are unchanged. Existing business dual runs remain bound to dev.8; dev.9 is not represented as ten new independent runs. Final review must verify this impact boundary and the new metadata paths rather than restart all business scenarios.

Final candidate: `0.1.0-dev.9`, source `3703dae3f9dd5c7f56371509fbdd1a7d9fc161e9`, archive SHA-256 `c70cdc93dca53763189b74cc4cf926f7d5ae03340febc13ced4633dc0a0e7f65`. Its packaged documents preserve the build-time checkpoint; this repository contains the subsequent final sign-off. Runtime/source hashes were checked, not inferred from version text alone.

Private primary evidence is archived under ignored `.local/acceptance/dev8-business-dev9-final/` with original-to-archive path mapping. It is not uploaded. Both recorded controlled services exited; final native Chrome inventory showed one original ordinary company page and no managed test page.
