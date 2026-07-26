# Uniswap Developer Feedback

This document records the concrete developer and qualification experience for
the ETHGlobal Lisbon submission. It contains no private messages or API keys.

## Project

ArcBook is a functional order book where makers publish bounded execution
curves instead of only flat price-and-size orders. A solver can route one taker
order across competing curves and settle the selected fills onchain.

## Integration Scope

The project does not force a Uniswap API call into its core execution path.
Project-specific eligibility for this approach was confirmed in writing by the
sponsor team. The original confirmation is retained privately.

## Developer Experience

### Materials reviewed

- [Uniswap Developer documentation](https://developers.uniswap.org/docs)
- [Developer Platform quick start](https://developers.uniswap.org/docs/get-started/quickstart)
- [Quote API reference](https://developers.uniswap.org/docs/api-reference/aggregator_quote)
- [AMM and UniswapX routing guide](https://developers.uniswap.org/docs/trading/swapping-api/amm-vs-uniswapx-routing)
- The ETHGlobal Lisbon bounty description and Developer Feedback Form.

### What was clear

- The documentation clearly separates API, SDK and direct protocol integration
  paths and provides concrete request payloads for the API path.
- The quote documentation clearly identifies route type, gas estimates and
  simulation status as data that an integrator must inspect rather than infer.
- Sponsor representatives were responsive when the project's unusual scope
  required an eligibility clarification.

### Friction encountered

- The published bounty required a valid API key and API-backed core
  functionality, while the accepted project is a new onchain market primitive
  whose core path deliberately does not call that API. Eligibility therefore
  depended on a separate written sponsor clarification.
- The public qualification text had no field for a sponsor-approved exception,
  so a team could not determine from the bounty page alone whether it was safe
  to invest time in this category of protocol work.
- It was unclear what API-specific feedback was expected from an approved
  submission that evaluated the API documentation but did not force an API call
  into settlement.

### Suggested improvements

- Add an explicit "new protocol primitive" or "sponsor-approved exception"
  qualification path with a place to record the approving sponsor contact.
- Publish a machine-checkable submission checklist that distinguishes mandatory
  API execution from documentation/feedback requirements.
- State whether API feedback from an exception project should cover the
  integration decision and documentation, rather than an integration it did not
  implement.

## Product Feedback

- Verified observation: the Uniswap API exposes simulated routes over Uniswap
  AMM and UniswapX liquidity, while ArcBook currently simulates its own
  multi-maker route before returning unsigned calldata.
- Future product idea, not implemented in this submission: an ArcBook solver
  could request a Uniswap quote as an external benchmark or fallback venue and
  compare net executable output after gas and fees.
- Future product idea, not a current Uniswap capability claim: programmable
  maker curves could become another route source if a later adapter exposes
  their liquidity to Uniswap routing infrastructure.

## Submission Checklist

- [x] Replace every placeholder with project-specific feedback.
- [x] Add links to the Uniswap resources reviewed.
- [x] Verify that no API key, private message, or personal detail is included.
- [ ] Verify that the repository has an explicit open-source license.
- [ ] Submit the Uniswap Developer Feedback Form.
- [ ] Include this file's public URL in the form.
- [ ] Add the requested project-identifying note to the bounty submission.
