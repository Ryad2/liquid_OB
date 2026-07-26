import { loadConfig } from './config.js'
import { createHttpHandler } from './http.js'
import { LiquidOBApiClient } from './liquid-ob-client.js'
import { ExecutableLiquidityService } from './service.js'
import { StandardDexGraphClient } from './standard-dex.js'

export function buildRuntimeHttpHandler(environment: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(environment)
  const service = new ExecutableLiquidityService(
    new LiquidOBApiClient({ baseUrl: config.liquidObApiUrl, timeoutMs: config.timeoutMs }),
    new StandardDexGraphClient({ ...config.standardDex, timeoutMs: config.timeoutMs }),
  )
  return createHttpHandler(service, config)
}
