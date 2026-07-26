# ETHGlobal Lisbon 2026 Rules Compliance

Status: release gate based on the eight-page project-rules PDF supplied on
25 July 2026. This is an engineering interpretation, not a replacement for a
written clarification from ETHGlobal.

## 1. Bottom Line

The PDF does **not** literally say that localhost is forbidden during
development or testing. It does say that a finalist project must be open
source, deployed, and live, and separately repeats that a live deployment is
required.

Liquid OB therefore uses the strict operational rule below:

> Localhost may be used for development, tests, and emergency fallback only.
> The submitted end-to-end demo must work from a fresh browser without any
> process, RPC node, indexer, database, solver, tunnel, or file served from a
> team member's computer.

A sponsor-specific allowance for local forks can qualify evidence for that
sponsor, but it does not replace the stronger ETHGlobal finalist live-
deployment gate.

Liquid OB is **not currently finalist-ready**. The complete local product,
indexer, solver, MCP, live adapter and release automation exist, but no public
deployment/hosting evidence, open-source license, video or final submission
evidence has been recorded.

## 2. Page-By-Page Requirement Audit

### Page 1: Judging And Prizes

This page is a title page. It introduces no independent qualification rule.

### Page 2: Two Judging Paths

Partner judging:

- A project qualifies only for partner prizes selected during submission.
- Teams should demo live to partners to receive feedback.
- A team is eligible for up to three partners.

Operational decision:

- Select no more than three partner organizations, even if one organization
  exposes multiple prize categories.
- The current intended set is 1inch, The Graph, and Uniswap.
- Prepare a distinct live proof and requirement map for each selected partner.

Finalist judging is an optional add-on at submission:

- It is the route for teams seeking a Top 10 place at the event.
- The team must present to the finalist judging panel.

Operational decision:

- Explicitly select the finalist add-on in the submission flow.
- Treat partner judging and finalist judging as separate presentations with
  separate evidence, not as one automatic qualification.

### Page 3: How To Be A Finalist

The page names four mandatory conditions:

1. An auditable repository.
2. An open-source, deployed, and live project.
3. A demo video included in the submission.
4. Participation in live finalist judging.

For Liquid OB, the operational interpretation of auditability is that judges
can connect the submitted UI, deployment addresses, source commit, events,
tests, and transaction evidence without private explanations. This sentence is
our release standard, not a fifth condition quoted from the slide.

### Page 4: Finalist Pack

This page describes finalist benefits, not build requirements:

- twelve months of ETHGlobal Plus;
- 1,000 USDC per team member;
- a 500 USD flight credit for a future hackathon;
- an ETHConf 2027 Pro Pass;
- private founder events; and
- more than 15,000 USD in developer credits.

No implementation decision should be inferred from this benefits page.

### Page 5: Finalist Judging Format

- Finalist judging uses a separate judging panel.
- The format is four minutes of demo followed by three minutes of questions.
- Video submissions are required.
- A live deployment is required.
- Preparation must not be left until the last minute.

Operational decision:

- The four-minute script is a hard product constraint.
- Record the video before the submission buffer begins.
- Deploy and rehearse the public vertical slice well before final submission.
- Keep a recorded fallback, but demonstrate the same public contracts and
  state represented by the live application.

### Page 6: Key To A Good Submission

- Record a video; the slide suggests CursorClip or ScreenKite.
- Prefer demonstration over slides.
- Use Git and GitHub properly, with many commits and smaller diffs.
- Add detailed descriptions and screenshots to the project page.

Operational decision:

- Continue coherent, independently green commits.
- Do not squash the hackathon history into a final single commit.
- The project page must contain architecture, product proof, screenshots,
  public links, and exact sponsor evidence.
- Slides may support the demo but may not replace executable proof.

### Page 7: Clarifications

The page directs teams to ask the ETHGlobal team when a rule is unclear.

Clarifications worth obtaining in writing:

1. Does a public testnet deployment satisfy "live deployment" for finalist
   judging, or is a mainnet deployment expected?
2. If a deterministic solver runs entirely in the public browser application,
   is a separate hosted solver service unnecessary?
3. Is the three-partner cap counted by organization or by individual bounty?

The build must not wait for these answers. The conservative architecture below
already satisfies the strict interpretation.

### Page 8: Closing Page

This is a closing graphic and introduces no requirement.

## 3. Current Compliance Snapshot

Audit date: 26 July 2026.

| Requirement | Current evidence | Status | Release action |
| --- | --- | --- | --- |
| Auditable repository | Public GitHub repository, documented architecture, CI, provenance, coherent history and committed deployment evidence | READY | Keep the submitted commit and README links immutable |
| Open source | Third-party notices are preserved, but independent Liquid OB code has no root license | BLOCKED | Select and commit an explicit compatible open-source license before publishing protocol implementation |
| Deployed | Base Sepolia manifest records all contracts, deployment transactions, code hashes and start block | READY | Preserve `deployments/84532.json` and explorer evidence |
| Live product | `https://arcbook-nu.vercel.app` serves fail-closed live mode over HTTPS | READY AUTOMATED | Complete one final clean-browser visual and wallet run |
| Live data | Studio Subgraph `arcbook/v0.1.0` indexes three positions and route history without indexing errors | READY | Keep the versioned endpoint available through judging |
| Live solver | Public API passes readiness, Graph/RPC freshness and a three-maker onchain route simulation | READY | Record the multi-maker quote in the demo video |
| Graph MCP | Public MCP passes initialize, readiness and `discover_positions` through the release gate | READY | Demonstrate one tool call in the recorded demo |
| Demo video | No submitted video URL exists | BLOCKED | Record, upload, and test the final video link without team credentials |
| Live finalist judging | Requires an owner action and physical availability | PENDING | Select the finalist add-on and attend the judging panel |
| Git discipline | Public `main` contains multiple coherent implementation, integration and deployment commits | READY | Push only reviewed final submission changes |
| Project description and screenshots | Detailed repository documents exist; the ETHGlobal project page and final screenshots do not | PARTIAL | Publish concise product copy, architecture proof, screenshots, and live links on the project page |
| Three-partner maximum | The planned set contains exactly three organizations | PLANNED | Select only 1inch, The Graph, and Uniswap unless the strategy is deliberately changed |

The local Aqua/SwapVM smoke test and optional official Base fork test remain
dependency evidence. The separate Base Sepolia manifest, bytecode checks,
seeded positions and indexed route transactions are the public ArcBook
deployment evidence.

## 4. Required Public Demo Topology

| Component | Canonical demo requirement | Acceptable public evidence |
| --- | --- | --- |
| Source | Judges can inspect the exact submitted revision | Public repository URL and immutable commit SHA |
| License | Independent code has explicit open-source terms | Root license plus preserved third-party SPDX and notices |
| Web application | Loads without team infrastructure | Public HTTPS URL tested in an incognito browser and on mobile |
| Wallet path | A judge can connect and understand the network | Supported wallet, public chain ID, visible switching and error states |
| Liquid OB contracts | Real public state transitions occur | Explorer-verified addresses, deployment transaction, commit, and ABI |
| Aqua/SwapVM path | Official or permitted deployed contracts perform real token transfers | Upstream addresses, strategy transaction, and transfer trace |
| Solver | Routing works without a developer laptop | Browser-side deterministic solver or public HTTPS API with health endpoint |
| Market discovery | Current positions are discoverable publicly | Live Subgraph endpoint, deployment ID, indexed block, and lag indicator |
| Graph MCP | Reusable liquidity tools work without a developer laptop | Public Streamable HTTP endpoint, readiness proof and recorded tool calls |
| Transaction proof | The demo is reproducible after the call | Explorer links for publish, route execution, recycling, and dock |
| Media | Judges can review asynchronously | Public or unlisted video URL with no login requirement |
| Submission page | Requirements are easy to audit | Detailed description, screenshots, sponsor map, and all public URLs |

The frontend may call a public RPC directly. A browser-side solver also avoids
the need for a separate backend. If any server-side solver or API proxy is
introduced, it becomes part of the live surface and must be publicly hosted,
observable, and free of laptop-only dependencies.

## 5. What May Remain Local

The following are valid local engineering or fallback tools:

- Forge unit, fuzz, invariant, and fork tests;
- Anvil and local chain snapshots;
- a local Graph node used during mapping development;
- mocked transports in component tests;
- local reference models and vector generators;
- a local copy of the production frontend for emergency fallback; and
- terminal deployment and seeding scripts.

None of them may be the only way to experience the submitted product. A local
fork explicitly permitted by one sponsor may prove that integration, but the
finalist demo must still have a public deployed vertical slice.

## 6. The Zero-Localhost Acceptance Test

Run this test from a second machine or a clean browser profile before recording
the video and again before submission:

1. Open only the public application URL.
2. Connect a clean demo wallet to the documented public network.
3. Discover seeded maker positions from the live index.
4. Request a route through the browser or public solver.
5. Inspect the selected curves, expected amounts, versions, and slippage.
6. Submit one real public transaction.
7. Open its explorer trace from the UI.
8. Refresh and observe both recycled curve states in the live index.
9. Repeat the seeded scenario without a terminal or manual state repair.

The test fails if it needs localhost, a local tunnel, a terminal command, an
uncommitted environment value, a private dashboard session, browser cache, a
team-only API credential, or a process running on a developer laptop.

## 7. Mandatory Submission Gate

Do not mark Liquid OB submission-ready until every box is complete:

- [ ] No required service in the canonical demo resolves to localhost, a
      private IP, a temporary tunnel, or a developer machine.
- [ ] Public repository contains every submitted commit and has no secrets.
- [ ] Root open-source license is selected and compatible with all distributed
      code and selected sponsor requirements.
- [ ] Public application loads from a clean desktop and mobile browser.
- [ ] Public chain, contract addresses, deployment blocks, upstream addresses,
      and explorer links are committed in a deployment manifest.
- [ ] At least one real public publish/fill/recycle transaction is linked.
- [ ] Live Graph endpoint returns current Liquid OB positions and index height.
- [ ] Solver path is public or executes entirely inside the public frontend.
- [ ] Public MCP endpoint initializes and its four tools return live structured
      evidence.
- [ ] Fresh-browser demo succeeds twice without terminal intervention.
- [ ] Two-to-four-minute submission video is accessible without login.
- [ ] Four-minute finalist demo and three-minute Q&A have been rehearsed twice.
- [ ] ETHGlobal project page includes detailed copy and final screenshots.
- [ ] No more than three partner organizations are selected.
- [ ] Finalist/Top 10 add-on is selected in the submission flow.
- [ ] Every selected sponsor requirement is mapped to source, live evidence,
      and a video timestamp.

## 8. Evidence Manifest

Before submission, the README or a dedicated deployment document must expose:

```text
PUBLIC_REPOSITORY_URL=
SUBMISSION_COMMIT_SHA=
PUBLIC_APP_URL=
CHAIN_ID=
NETWORK_NAME=
LIQUID_OB_DEPLOYMENT_MANIFEST=
BLOCK_EXPLORER_CONTRACT_URLS=
UPSTREAM_AQUA_SWAPVM_ADDRESSES=
SUBGRAPH_ENDPOINT=
SUBGRAPH_DEPLOYMENT_ID=
SOLVER_MODE=browser|hosted
SOLVER_HEALTH_URL=
PUBLIC_MCP_URL=
DEMO_PUBLISH_TX=
DEMO_ROUTE_TX=
DEMO_DOCK_TX=
DEMO_VIDEO_URL=
ETHGLOBAL_PROJECT_URL=
```

`SOLVER_HEALTH_URL` is intentionally empty only when `SOLVER_MODE=browser`.
Secrets, private keys, and sponsor API keys must never appear in this manifest.

## 9. Immediate Consequences For Development

1. Resolve the root-license decision before finalist submission.
2. Run the protected testnet deployment workflow and manually review the
   generated manifest and explorer verification before merging it.
3. Deploy the Subgraph and immutable API/MCP/web images to public HTTPS hosts.
4. Seed the public market and run `pnpm release:verify`; preserve local tests,
   but never count them as the live product.
5. Pass the complete clean-browser wallet flow twice without a terminal.
6. Record video and project-page evidence before the final feature freeze.
