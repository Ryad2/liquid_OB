# Prompt 0011: ETHGlobal Rules Compliance

Date: 25 July 2026

## Request

Analyze the supplied eight-page ETHGlobal Lisbon 2026 project-rules PDF in
detail before continuing implementation, with special attention to whether the
complete project must be live rather than localhost-only.

## Required Output

- Page-by-page identification of every requirement and informational item.
- A rigorous distinction between partner judging and optional finalist judging.
- An exact operational definition of deployed, live, auditable, and open
  source for this architecture.
- A current repository and end-to-end deployment compliance audit.
- A zero-localhost acceptance test and a mandatory submission release gate.
- No claim that the current scaffold is already finalist-ready.

## Decision

Localhost remains valid for development, tests, and fallback. It cannot be a
dependency of the canonical submitted demo. The finalist path requires a
publicly accessible source revision, explicit open-source license, public web
application, public protocol deployment, public data path, public or in-browser
solver, accessible video, and live judging participation.

The normative audit and release gate are recorded in
`docs/ETHGLOBAL_RULES_COMPLIANCE.md`.
