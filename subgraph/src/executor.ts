import { RouteExecuted } from '../generated/BatchExecutor/BatchExecutor'
import { Route } from '../generated/schema'
import {
  ONE,
  loadOrCreateMarket,
  loadOrCreateProtocol,
  loadOrCreateSnapshot,
  loadOrCreateToken,
  quoteKindName,
  sideName,
} from './common'

export function handleRouteExecuted(event: RouteExecuted): void {
  const id = event.params.routeId.toHexString()
  if (Route.load(id) !== null) return

  const side = sideName(event.params.side)
  const tokenIn = loadOrCreateToken(event.params.tokenIn)
  const tokenOut = loadOrCreateToken(event.params.tokenOut)
  const baseToken = side == 'SELL' ? tokenOut : tokenIn
  const quoteToken = side == 'SELL' ? tokenIn : tokenOut
  const market = loadOrCreateMarket(
    event.params.marketId,
    baseToken,
    quoteToken,
    event.block.number,
    event.block.timestamp,
  )

  const route = new Route(id)
  route.routeId = event.params.routeId
  route.market = market.id
  route.payer = event.params.payer
  route.recipient = event.params.recipient
  route.refundRecipient = event.params.refundRecipient
  route.side = side
  route.kind = quoteKindName(event.params.kind)
  route.tokenIn = tokenIn.id
  route.tokenOut = tokenOut.id
  route.amountInRaw = event.params.amountIn
  route.amountOutRaw = event.params.amountOut
  route.limitRaw = event.params.limit
  route.fillCount = event.params.fillCount
  route.blockNumber = event.block.number
  route.timestamp = event.block.timestamp
  route.transactionHash = event.transaction.hash
  route.save()

  market.routeCount = market.routeCount.plus(ONE)
  market.lastUpdateBlock = event.block.number
  market.lastUpdateTimestamp = event.block.timestamp
  market.save()
  const snapshot = loadOrCreateSnapshot(market, event.block.timestamp)
  snapshot.routeCount = snapshot.routeCount.plus(ONE)
  snapshot.lastUpdateBlock = event.block.number
  snapshot.save()
  const protocol = loadOrCreateProtocol(event.block.number, event.block.timestamp)
  protocol.routeCount = protocol.routeCount.plus(ONE)
  protocol.save()
}
