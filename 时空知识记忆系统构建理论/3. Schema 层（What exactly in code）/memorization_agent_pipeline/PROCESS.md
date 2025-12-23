# PROCESS

## Task
Revise Memorization Agent pipeline README to align current behavior vs planned fixes, and add executable TODOs (pre-production).

## Implementation
- Clarified graph write dependency (GraphUpsert injection) in pipeline step outputs and schema notes.
- Corrected configuration truth (script-only envs, http-mode requirements).
- Added an explicit TODO execution checklist with DoD for P0/P1 fixes.

## Tests
- Not run (documentation-only change).

## Result
- Documentation is now consistent with current code paths and highlights actionable steps without assuming production readiness.

## Follow-ups
- Execute TODOs in README (P0 graph writer injection, P1 validation/smoke tests).
