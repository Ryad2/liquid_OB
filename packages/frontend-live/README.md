# `@liquid-ob/frontend-live`

Production composition adapter for ArcBook frontends. It combines the public
solver/read API, a versioned deployment manifest, exact local curve math, and
onchain transaction encoders behind `LiquidOBFrontendClient`.

The adapter fails closed when the manifest and API disagree, when indexed data
is stale, or when a public release has not enabled writes. UI code should import
this package only from its composition root.
