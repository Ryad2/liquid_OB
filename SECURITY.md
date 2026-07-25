# Security Policy

Liquid OB is experimental hackathon software. It has not been audited and must
not be used with assets of value.

Do not disclose a suspected vulnerability in a public issue. Contact the
repository owner privately with reproduction steps and affected commit hashes.

Never place a private key or sponsor API key in the browser application. Keys
that authenticate server-side APIs must remain in a server-side environment or
secret manager.

The frontend currently runs against deterministic mock data. Mock transaction
plans are deliberately marked `sendable: false`; wallet code must enforce this
field and must never submit mock addresses or calldata. Future live mode must
fail closed when its deployment manifest, network, services, quote freshness,
or final simulation cannot be validated. It must never silently fall back to
mock data.
