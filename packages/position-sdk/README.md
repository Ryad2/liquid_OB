# `@liquid-ob/position-sdk`

Framework-neutral live transaction and read helpers for one validated ArcBook
deployment. The package composes canonical strategy encoding with generated
ABIs; it never owns a private key and never sends a transaction.

The SDK exposes:

- maker publish calls: base approval, quote approval, `Aqua.ship`;
- Lens snapshots and exact-input/exact-output Quoter reads;
- exact-input/exact-output batch calldata and simulation;
- complete immutable-position docking through Aqua.

The application must validate the deployment manifest and bytecode before
presenting returned calls as sendable.
