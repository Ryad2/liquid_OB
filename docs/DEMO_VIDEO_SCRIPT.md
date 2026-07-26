# ArcBook Three-Minute Submission Video

This runbook is written for a final edited video of no more than three minutes.
The spoken script is in English for ETHGlobal and sponsor judges. Record the
wallet confirmation waits, but remove dead time while preserving the request,
signature, and confirmed result.

## Recording Setup

- Record the live application at <https://arcbook-nu.vercel.app> in 1080p.
- Use Base Sepolia and confirm that the global status bar reports the live
  solver online and writes enabled.
- Use the funded maker account for Curve Composer and the funded trader account
  for Trade. Never show private keys, seed phrases, `.env`, or wallet exports.
- Hide bookmarks, notifications, unrelated tabs, and identifying browser
  extensions before recording.
- Before the final take, test `Pay dETH`, `Exact pay`, and `1 dETH`. The route
  should currently show two independent curve-position fills. If market state
  has changed, use `5 dETH`, or describe the number of fills actually shown.
- Open the Activity page and one BaseScan transaction in advance so the final
  proof can be shown without waiting for a new index cycle.
- Record the maker and trader flows as separate clips. Cut confirmation waits;
  do not fake or replace the transaction request or confirmed state.

## Final Script

### 0:00-0:15 - Product Hook

**Screen:** Start on the ArcBook landing page. Move the alpha slider once, then
click `Start trading` only after the opening sentence.

**Narration:**

> Hi, I'm Ryad, and this is ArcBook: a functional order book where each maker
> publishes a bounded, executable pricing curve instead of dozens of
> disconnected limit orders. The complete demo is live on Base Sepolia.

### 0:15-0:31 - The Primitive

**Screen:** Keep the animated curve visible and move the alpha slider between
two clearly different shapes. Then open `Curve composer`.

**Narration:**

> In a traditional order book, a maker states one price and one size. In
> ArcBook, the maker specifies a price interval, inventory, and alpha. Alpha
> controls how liquidity is distributed through that interval, so one position
> expresses an entire execution policy.

### 0:31-1:00 - Compose A Two-Sided Position

**Screen:** In Curve Composer, highlight the sell range, sell alpha and reserve,
then the buy range, buy alpha and reserve. Pause on the two-curve preview and
the initial spread. Use the existing valid draft values for a reliable take.

**Narration:**

> Here I define the two sides independently. The sell curve offers six dETH
> from 2,004 to 2,350 dUSD, with alpha two controlling how its marginal price
> moves as inventory is consumed. The buy curve deploys twelve thousand dUSD
> from 1,945 down to 1,550 and uses the supported alpha-zero limit. The gap is
> the maker's spread, and the preview exposes the complete policy before
> anything is signed.

### 1:00-1:19 - Publish Through Aqua And SwapVM

**Screen:** Click `Review position`, briefly show the immutable policy and
transaction plan, then click `Sign & publish position`. Show the wallet request
and the confirmed application state. Cut only the mining delay.

**Narration:**

> Publishing encodes this as one immutable, two-sided position and ships it
> through 1inch Aqua. Aqua provides the shared-liquidity accounting, while our
> custom SwapVM instruction executes ArcBook's curve transition. This wallet
> request is a real onchain publication, not a mocked frontend update.

### 1:19-1:48 - Solve Across Curve Positions

**Screen:** Switch to the trader wallet and open `Trade`. Select `Pay dETH`,
`Exact pay`, and enter `1`. Show the quote metrics, the two fills, then select
`Route geometry` or open `Current route` so the split is unmistakable.

**Narration:**

> Now I switch to the trader and pay one dETH with exact input. The solver
> discovers indexed positions through The Graph, checks their current onchain
> state, quotes their executable capacity, and selects the best bounded
> combination. This route splits across two independent curve positions. The
> interface exposes every fill, the effective price, the ending marginal price,
> price impact, and the transaction bounds.

If the live state produces a different number of fills, replace only the
sentence beginning `This route` with:

> The solver selected the best available curve-position combination for the
> current live state, and every component of that route is visible here.

### 1:48-2:09 - Atomic Execution

**Screen:** Click `Execute route`. Show the required token approval if it is
requested, then show the batch-execution signature and confirmed result. Cut
wallet and block-confirmation waiting time.

**Narration:**

> Execution is atomic through the batch executor. Either every selected fill
> stays inside the quoted amount, deadline, and slippage bounds, or the whole
> route reverts. The wallet grants only the required token authorization and
> then signs the executable route.

### 2:09-2:34 - Inventory Recycling

**Screen:** Show `Current route`, especially the marginal-price movement and
opposite-side credit. Then open `Portfolio` and pause on `Inventory recycling`.

**Narration:**

> After settlement, ArcBook performs its defining state transition. Assets
> received by one side become inventory for the opposite side. A filled sell
> curve replenishes the buy curve, and a filled buy curve replenishes the sell
> curve. The position continuously recycles inventory while preserving its
> marginal-price rules, so the next quote uses the new state rather than stale
> liquidity.

### 2:34-2:48 - Public Indexing Proof

**Screen:** Open `Activity`. Show the indexed event metrics, a route row, and
briefly open its BaseScan link in the prepared tab.

**Narration:**

> Every publication, curve fill, atomic route, and dock event is indexed by The
> Graph. This page reads the live subgraph, and each event links back to its
> public Base Sepolia transaction.

### 2:48-3:00 - Close

**Screen:** Return to a strong product view showing the curve map and ArcBook
wordmark. Keep the final frame still for one second.

**Narration:**

> ArcBook combines expressive maker curves, solver-composed execution, Aqua and
> SwapVM settlement, live Graph indexing, and a public liquidity MCP for agents.
> It turns the order book from a list of prices into a market of executable
> functions. This is ArcBook.

## Editing Rules

- Keep the finished export between `2:50` and `2:59`; never exceed `3:00`.
- Accelerate or cut testnet waits, but retain the wallet request and resulting
  confirmed state so the onchain flow remains credible.
- Add small captions only for `Executable maker curves`, `Atomic multi-position
  route`, `1inch Aqua + SwapVM`, `Indexed by The Graph`, and `Base Sepolia`.
- Do not call the two fills `two makers` unless their displayed maker addresses
  are actually different. `Two independent curve positions` is always precise.
- Do not claim a Uniswap API integration. ArcBook is entered under the written
  sponsor exception for the new market primitive.
- Do not describe ArcBook as audited or production-ready. Call it a functional
  hackathon MVP running on public testnet.

## Failure-Safe Capture Plan

If a new transaction or subgraph update is slow, retain the live wallet signing
clip, then cut to the already-confirmed Portfolio or Activity state. Add the
transaction hash as a small caption and open its BaseScan page. Never substitute
mock data, localhost, or a different chain for a failed live take.
