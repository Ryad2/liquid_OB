import {
  batchExecutorAbi,
  lensAbi,
  quoterAbi,
  routerAbi,
  type DeploymentManifest,
} from '@liquid-ob/contracts'
import type { PositionConfig } from '@liquid-ob/curve-math'
import type { Address, PublicClient } from 'viem'

import { buildPublishPositionPlan } from './builders.js'
import type {
  ExactInputRoute,
  ExactOutputRoute,
  PositionLocator,
  PublishPositionPlan,
  QuoteRequest,
} from './types.js'

export async function readLiquidCurveOpcode(
  client: PublicClient,
  manifest: DeploymentManifest,
): Promise<number> {
  return client.readContract({
    address: manifest.contracts.router.address,
    abi: routerAbi,
    functionName: 'liquidCurveOpcode',
  })
}

export async function preparePublishPosition(
  client: PublicClient,
  manifest: DeploymentManifest,
  input: {
    maker: Address
    config: PositionConfig
    baseAllocation: bigint
    quoteAllocation: bigint
  },
): Promise<PublishPositionPlan> {
  return buildPublishPositionPlan(manifest, {
    ...input,
    liquidCurveOpcode: await readLiquidCurveOpcode(client, manifest),
  })
}

export async function readPosition(
  client: PublicClient,
  manifest: DeploymentManifest,
  position: PositionLocator,
) {
  return client.readContract({
    address: manifest.contracts.lens.address,
    abi: lensAbi,
    functionName: 'getPosition',
    args: [position],
  })
}

export async function quoteExactInput(
  client: PublicClient,
  manifest: DeploymentManifest,
  request: QuoteRequest,
) {
  return client.readContract({
    address: manifest.contracts.quoter.address,
    abi: quoterAbi,
    functionName: 'quoteExactInput',
    args: [request],
  })
}

export async function quoteExactOutput(
  client: PublicClient,
  manifest: DeploymentManifest,
  request: QuoteRequest,
) {
  return client.readContract({
    address: manifest.contracts.quoter.address,
    abi: quoterAbi,
    functionName: 'quoteExactOutput',
    args: [request],
  })
}

export async function simulateExactInputRoute(
  client: PublicClient,
  manifest: DeploymentManifest,
  account: Address,
  route: ExactInputRoute,
) {
  return client.simulateContract({
    account,
    address: manifest.contracts.batchExecutor.address,
    abi: batchExecutorAbi,
    functionName: 'executeExactInput',
    args: [route],
  })
}

export async function simulateExactOutputRoute(
  client: PublicClient,
  manifest: DeploymentManifest,
  account: Address,
  route: ExactOutputRoute,
) {
  return client.simulateContract({
    account,
    address: manifest.contracts.batchExecutor.address,
    abi: batchExecutorAbi,
    functionName: 'executeExactOutput',
    args: [route],
  })
}
