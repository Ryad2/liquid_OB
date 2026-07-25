# Security Policy

Liquid OB is experimental hackathon software. It has not been audited and must
not be used with assets of value. The current security evidence and residual
risks are recorded in [`docs/SECURITY_GATE.md`](docs/SECURITY_GATE.md).

Report a suspected vulnerability privately to the repository owner with
reproduction steps, affected commit hashes and impact. Do not disclose it in a
public issue before a coordinated fix is available.

Never place a deployer private key or sponsor API key in source control or the
browser application. Deployment keys belong in the local process environment;
server API keys belong in a server-side secret manager.

The live frontend must fail closed if its chain, deployment manifest, quote
freshness or final transaction simulation cannot be validated. It must never
silently substitute mock addresses, mock calldata or mock quotes.

Supported demo assets are conventional ERC-20 tokens with at most 18 decimals.
Rebasing, callback-enabled and non-standard transfer tokens are outside the
supported boundary. Fee-on-transfer route input is rejected by the batch
executor's exact balance reconciliation.

Arithmetic, transcendentals, curve execution, recycling, Aqua settlement,
lifecycle reads and atomic multi-maker routes have deterministic and fuzz test
coverage. Those tests are not a formal proof, a gas-optimality claim or an
external security review.
