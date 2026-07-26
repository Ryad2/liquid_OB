# AI Usage Disclosure

AI assistance is used as an engineering tool, not as an unreviewed source of
protocol correctness. The repository owner remains responsible for every
design decision, mathematical assumption, test, and submitted line of code.

## 25 July 2026: repository bootstrap

- Tool: OpenAI Codex
- Work: inspected the empty remote, checked official tool documentation,
  proposed the workspace, and generated configuration and documentation
  scaffolding.
- Human review required: repository structure, dependency choices, security
  boundaries, and every future implementation decision.
- Imported implementation during this step: none.

## 25 July 2026: hackathon execution plan

- Tool: OpenAI Codex
- Work: converted the product thesis and current sponsor requirements into a
  time-boxed architecture, implementation sequence, test gates, demo script,
  fallback strategy, and submission checklist.
- Human review required: sponsor eligibility, dependency licenses, curve
  semantics, mathematical assumptions, and every release decision.
- Output: `docs/HACKATHON_PLAN.md` and `prompts/0002-hackathon-plan.md`.

## 25 July 2026: exact curve architecture

- Tool: OpenAI Codex
- Work: documented the exact bounded-curve state, equations, branch model,
  solver requirements, tests, and product-facing demo language.
- Human decision: the project uses one analytical curve family rather than a
  segmented approximation or arbitrary maker-provided code.
- Human review required: single-curve orientation, fixed-point domains,
  Aqua/SwapVM state mapping, and whether active/spectator coupling belongs in a
  later milestone.

## 25 July 2026: Uniswap eligibility update

- Tool: OpenAI Codex
- Work: removed the conditional API adapter from the plan, fixed Uniswap as the
  third partner selection, and created the required feedback-document draft.
- Human-supplied requirement: written sponsor confirmation permits this project
  to apply without a forced API integration, while `FEEDBACK.md` and the
  developer feedback form remain mandatory.
- Human review required: final feedback content, identifying submission note,
  form completion, and private retention of the original confirmation.

## 25 July 2026: end-to-end product specification

- Tool: OpenAI Codex
- Work: specified one `alpha`-parameterized curve family, its zero-order and
  flat-order limits, two-sided maker positions, automatic inventory recycling,
  deterministic rescaling, multi-position solving, settlement, data, UI,
  tests, and sponsor relationships.
- Human decisions: all numerically safe `alpha` values are permitted; received
  assets immediately fund the opposite curve; equal endpoint prices produce a
  standard flat price-and-volume position.
- Human review required: exact fixed-point domains, empty-side rearming,
  maker-favorable rounding, solver optimality, and Aqua/SwapVM accounting.

## 25 July 2026: mathematical kernel audit

- Tool: OpenAI Codex
- Work: independently reconstructed the dual-parameter curve, reduced native
  encoding, exact coordinate maps, singular limits, direction conversion,
  flat-order limit, and homothetic scaling; checked identities numerically at
  80-digit precision across representative alpha values from -20 to 20.
- Corrections: replaced the legacy affine encoding with
  `(y, yInt, alphaNative, mu, kappa)`, restored
  `betaNative = alphaNative - 1`, fixed output-per-input quote semantics, and
  corrected buy/sell compilation.
- Human review required: fixed-point domain constants, production rounding
  policy, and the product-specific empty-side rearming rule.

## 25 July 2026: bonding-curve and effective-price re-audit

- Tool: OpenAI Codex
- Work: independently re-derived the reserve curve by integrating the
  reciprocal marginal schedule; verified secant-rate, dual-mean, reciprocal
  direction, reduced encoding, derivative, and inverse identities at
  90-to-100-digit precision across signed alpha values and both singular
  branches.
- Corrections: renamed the maker function as a marginal schedule, documented
  the actual integrated bonding curve, distinguished buy quote progress from
  sell base progress, and required partial-fill effective prices to use actual
  pre-fill and post-fill marginal rates.
- Human review required: maker-facing parameter vocabulary, fixed-point
  tolerances near singular branches, and all fee-inclusive UI quote semantics.

## 25 July 2026: end-to-end implementation architecture

- Tool: OpenAI Codex
- Work: decomposed the complete product into onchain math, canonical strategy
  encoding, a custom SwapVM/Aqua execution path, logical runtime accounting,
  atomic routing, TypeScript packages, solver services, The Graph indexing and
  MCP tooling, web flows, security tests, deployment profiles, and submission
  operations.
- Architecture corrections: removed the redundant position directory and
  parallel custody concepts; Aqua lifecycle events carry immutable strategy
  bytes, while the custom router keeps only logical executable state and final
  transfers remain in the official Aqua path.
- Imported implementation during this step: none.
- Human review required: exact upstream versions and licenses, target public
  network, custom SwapVM interface details, numerical storage widths, and every
  security assumption before implementation.
- Output: `docs/ARCHITECTURE.md` and
  `prompts/0007-end-to-end-architecture.md`.

## 25 July 2026: native micro-pool indexing clarification

- Tool: OpenAI Codex
- Work: clarified that every maker position is a single-maker programmable
  micro-pool for routing purposes and that the Liquid OB Subgraph indexes the
  protocol's own complete position and curve-state universe.
- Architecture correction: the solver first optimizes over one indexed market
  snapshot, then refreshes only selected fills and a bounded reserve shortlist
  through batched RPC reads; it does not perform one RPC read per position.
- Imported implementation during this step: none.
- Human review required: shortlist size, maximum acceptable index lag, fallback
  provider policy, and final GraphQL pagination/index design.
- Output: architecture, product, and hackathon specifications plus
  `prompts/0008-native-subgraph-solver-path.md`.

## 25 July 2026: Uniswap v4 hook architecture evaluation

- Tool: OpenAI Codex
- Work: compared the accepted Aqua/SwapVM backend with a genuine Uniswap v4
  custom-accounting hook across maker accounting, custody, solvency, callbacks,
  flash-accounting gas potential, routing, security, sponsor eligibility, and
  implementation risk.
- Decision: keep Aqua/SwapVM as the only hackathon settlement backend; retain a
  v4-native hook as a separately benchmarked post-MVP alternative rather than
  nesting both settlement systems.
- Imported implementation during this step: none.
- Human review required: sponsor interpretation, future PoolManager backing
  design, comparative gas benchmarks, and specialized hook security review.
- Output: `docs/UNISWAP_V4_HOOK_EVALUATION.md`, ADR-011, and
  `prompts/0009-uniswap-v4-hook-evaluation.md`.

## 25 July 2026: dependency-ordered implementation plan

- Tool: OpenAI Codex
- Work: converted the complete architecture into a file-by-file development
  sequence with vertical slices, dependency gates, test requirements, public
  deployment timing, native Subgraph ordering, solver integration, UI flows,
  security freeze, stop conditions, and an intended commit history.
- Decision: prove official Aqua/SwapVM transfers before protocol logic; validate
  math independently before settlement; freeze and deploy events before The
  Graph; make the native Subgraph precede the live solver API and product UI.
- Imported implementation during this step: none.
- Human review required: license selection, upstream pins, compiler matrix,
  public network, actual deadline, and time allocation before Phase 0 begins.
- Output: `docs/IMPLEMENTATION_ORDER.md`, ADR-012, and
  `prompts/0010-protocol-implementation-order.md`.

## 25 July 2026: ETHGlobal rules compliance audit

- Tool: OpenAI Codex
- Work: extracted and visually reviewed all eight pages of the supplied event
  rules, separated partner and finalist judging, audited the public repository
  and live architecture, and defined a zero-localhost acceptance test and
  submission release gate.
- Decision: localhost is permitted for development and fallback, but no local
  process may be required by the canonical finalist demo.
- Human review required: root license, public deployment and hosting profile,
  finalist add-on, selected partners, and written answers to any rule
  clarification.
- Output: `docs/ETHGLOBAL_RULES_COMPLIANCE.md` and
  `prompts/0011-ethglobal-rules-compliance.md`.

## 25 July 2026: canonical protocol language implementation

- Tool: OpenAI Codex
- Work: implemented Phase 2 user-defined unit types, two-sided position and
  route structs, canonical errors and events, Quoter/Lens/Executor interfaces,
  compact policy encoding, domain-separated identifiers, structural
  validation, and deterministic codec tests.
- Decisions: WAD is `1e18`; transfer amounts remain token-native `uint256`;
  payload values use 128-bit WAD fields; alpha uses a symmetric signed 128-bit
  range; payload, SwapVM program, and Aqua strategy hashes are distinct; Aqua
  owns lifecycle events while Liquid OB owns reconstructable runtime events.
- Imported implementation during this step: none.
- Human review required: root open-source license before publication and every
  future numerical-domain constant before deployment.
- Output: Solidity Phase 2 files, `docs/WIRE_FORMAT.md`, ADR-013, and
  `prompts/0012-canonical-protocol-language.md`.

## 25 July 2026: independent high-precision mathematical oracle

- Tool: OpenAI Codex
- Work: implemented a Python standard-library `Decimal` evaluator directly
  from `MATH_SPEC.md`, deterministic valid and invalid-domain vector
  generation, independent equation identities, WAD rounding intervals, unit
  tests, and CI drift detection.
- Independence boundary: the evaluator imports no contract artifact, Solidity
  implementation, generated ABI, or TypeScript SDK code.
- Human review required: every equation transcription, scenario coverage,
  future accepted EVM numerical bounds, and all Solidity differential results.
- Output: `tools/reference/`, `test/vectors/`, `docs/REFERENCE_MODEL.md`,
  ADR-014, and `prompts/0013-independent-mathematical-oracle.md`.

## 25 July 2026: parallel frontend handoff boundary

- Tool: OpenAI Codex
- Work: audited implemented and missing protocol layers; defined a
  framework-neutral frontend client, explicit amount and freshness models,
  deterministic mock markets/positions/routes, maker preview, unsendable
  transaction plans, package tests, and a web integration harness.
- Decision: frontend components consume one product gateway and never import
  fixtures, provisional ABIs or transport clients. The then-planned live
  adapter would replace only the composition root and may not silently fall
  back to mock.
- Human review required: final screen design, wallet stack, live adapter,
  deployment manifest, exact SDK math, service URLs and every enabled write.
- Output: `packages/frontend-api/`, `docs/IMPLEMENTATION_STATUS.md`,
  `docs/FRONTEND_HANDOFF.md`, ADR-015, and
  `prompts/0014-parallel-frontend-handoff.md`.

## 25 July 2026: full-precision Solidity arithmetic

- Tool: OpenAI Codex
- Work: implemented Phase 4A checked 512-bit rational arithmetic, mathematical
  signed floor/ceiling, WAD multiplication/division/reciprocal, safe signed
  conversion, uint128 amount boundaries, token-decimal normalization, reserve
  addition/subtraction/scaling, deterministic boundary tests, and fuzz tests.
- Imported implementation: no copied source. The wrapper calls the already
  pinned OpenZeppelin v5.4.0 `Math` and `SafeCast` libraries recorded in
  `PROVENANCE.md`.
- Decision: keep transcendental and curve formulas out of this commit; make
  Phase 4B the next independent gate.
- Human review required: signed rounding semantics, every overflow boundary,
  gas profile, and the future transcendental numerical domain.
- Output: `FullPrecisionMath.sol`, its unit tests, ADR-016, and
  `prompts/0015-full-precision-math.md`.

## 25 July 2026: bounded Solidity transcendental arithmetic

- Tool: OpenAI Codex
- Work: audited fixed-point logarithm/exponential candidates; pinned Solady
  v0.1.26; implemented protocol-owned domains, exact identities, stable
  `log1p`/`expm1`, full-precision signed real powers, conservative intervals,
  oracle regressions, monotonicity fuzzing, condition-aware inverse tests, and
  rejected-domain tests.
- Imported implementation: unmodified Solady
  `FixedPointMathLib.lnWad`/`expWad`, MIT, exact commit and purpose recorded in
  `PROVENANCE.md`. No source was copied; Solady `powWad` is not used.
- Decision: treat every returned scalar as an approximation and require later
  curve arithmetic to consume the documented interval in its maker-favorable
  direction.
- Human review required: formal approximation-error proof, accepted domain,
  downstream interval composition, gas profile, and specialist production
  audit.
- Output: `TranscendentalMath.sol`, its unit tests,
  `TRANSCENDENTAL_MATH_AUDIT.md`, ADR-017, and
  `prompts/0016-bounded-transcendental-math.md`.

## 25-26 July 2026: protocol, product and release implementation

- Tool: OpenAI Codex
- Work: implemented and tested the remaining curve compiler/kernel,
  two-sided runtime, Aqua/SwapVM settlement, lifecycle Lens, atomic batch
  executor, deployment scripts, generated clients, solver, native Subgraph,
  Solver API, live frontend adapter, wallet/UI flows, Graph-backed MCP service,
  containers, observability and release workflows.
- Verification: deterministic, unit, integration, differential, fuzz and
  adversarial contract tests; TypeScript type/lint/unit/build gates; Matchstick
  Subgraph tests; MCP in-memory and HTTP protocol tests; container builds and
  explicit public-release checks.
- Decision: all offchain services remain untrusted and unsigned; The Graph is
  discovery, Lens/Quoter/RPC are refresh, BatchExecutor simulation is the last
  pre-wallet gate, and contracts remain authoritative. Live mode never falls
  back to mock.
- Human review required: every economic assumption and numerical bound,
  independent security audit, root-license selection, sponsor eligibility,
  public deployment/hosting credentials, explorer verification, firsthand
  feedback, live transaction evidence and final demo/submission.
- Imported implementation: only pinned dependencies already itemized in
  `PROVENANCE.md` and `LICENSES/`; the MCP server uses the official SDK package
  without copied source.

Material future specifications and implementation plans are stored in
`prompts/`. Routine autocomplete and formatting do not need separate entries.
