import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { parseDeploymentManifest, type DeploymentManifest } from '@liquid-ob/contracts'

import { ApiError } from './errors.js'

export interface RuntimeConfig {
  host: string
  port: number
  rpcUrl: string
  subgraphUrl: string
  manifest: DeploymentManifest
  maxIndexLag: bigint
  maxFills: number
  reserveCount: number
  pageSize: number
  corsOrigins: string[]
}

export async function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): Promise<RuntimeConfig> {
  const manifestPath = resolve(env.LIQUID_OB_MANIFEST ?? 'deployments/31337.json')
  const manifest = parseDeploymentManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
  if (!manifest.release.public && env.LIQUID_OB_ALLOW_LOCAL_MANIFEST !== 'true') {
    throw new ApiError(
      'INVALID_REQUEST',
      500,
      'Refusing a non-public deployment manifest without LIQUID_OB_ALLOW_LOCAL_MANIFEST=true',
    )
  }
  return {
    host: env.SOLVER_API_HOST ?? '127.0.0.1',
    port: integer(env.SOLVER_API_PORT, 3_878, 1, 65_535, 'SOLVER_API_PORT'),
    rpcUrl: required(env.SOLVER_API_RPC_URL, 'SOLVER_API_RPC_URL'),
    subgraphUrl: required(env.SOLVER_API_SUBGRAPH_URL, 'SOLVER_API_SUBGRAPH_URL'),
    manifest,
    maxIndexLag: BigInt(integer(env.SOLVER_API_MAX_INDEX_LAG, 5, 0, 10_000, 'SOLVER_API_MAX_INDEX_LAG')),
    maxFills: integer(env.SOLVER_API_MAX_FILLS, manifest.config.maxFills, 1, manifest.config.maxFills, 'SOLVER_API_MAX_FILLS'),
    reserveCount: integer(env.SOLVER_API_RESERVE_COUNT, manifest.config.maxFills, 0, 100, 'SOLVER_API_RESERVE_COUNT'),
    pageSize: integer(env.SOLVER_API_PAGE_SIZE, 200, 1, 1_000, 'SOLVER_API_PAGE_SIZE'),
    corsOrigins: (env.SOLVER_API_CORS_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  }
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new ApiError('INVALID_REQUEST', 500, `${name} is required`)
  return value
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiError('INVALID_REQUEST', 500, `${name} must be between ${minimum} and ${maximum}`)
  }
  return parsed
}
