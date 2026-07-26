import { chmod, readFile, writeFile } from 'node:fs/promises'

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const envUrl = new URL('../../../.env', import.meta.url)
const exampleUrl = new URL('../../../.env.example', import.meta.url)
const force = process.argv.includes('--force')
let contents

try {
  contents = await readFile(envUrl, 'utf8')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
  contents = await readFile(exampleUrl, 'utf8')
}

const keyNames = ['DEPLOYER_PRIVATE_KEY', 'MAKER_PRIVATE_KEY', 'TAKER_PRIVATE_KEY']
const existingKeys = keyNames.map((name) => environmentValue(contents, name))
const populated = existingKeys.filter((value) => value !== '').length

if (!force && populated !== 0 && populated !== keyNames.length) {
  throw new Error('Refusing to mix existing and generated wallet keys; complete the set or rerun with --force')
}

const privateKeys = !force && populated === keyNames.length
  ? existingKeys
  : keyNames.map(() => generatePrivateKey())
const accounts = privateKeys.map((privateKey) => privateKeyToAccount(privateKey))

for (const [index, name] of keyNames.entries()) {
  contents = setEnvironmentValue(contents, name, privateKeys[index])
}
contents = setEnvironmentValue(contents, 'DEPLOYER_ADDRESS', accounts[0].address)
contents = setEnvironmentValue(contents, 'MAKER_ADDRESS', accounts[1].address)
contents = setEnvironmentValue(contents, 'TAKER_ADDRESS', accounts[2].address)
contents = setEnvironmentValue(contents, 'BASE_SEPOLIA_RPC_URL', 'https://base-sepolia-rpc.publicnode.com')
contents = setEnvironmentValue(contents, 'LIQUID_OB_OWNER', accounts[0].address)
contents = setEnvironmentValue(contents, 'DEMO_MAKER', accounts[1].address)
contents = setEnvironmentValue(contents, 'LIQUID_OB_DEPLOY_AQUA', 'true')
contents = setEnvironmentValue(contents, 'LIQUID_OB_DEPLOY_DEMO_TOKENS', 'true')

await writeFile(envUrl, contents, { encoding: 'utf8', mode: 0o600 })
await chmod(envUrl, 0o600)

console.log('Disposable Base Sepolia wallets are stored in the ignored .env file:')
console.log(`DEPLOYER_ADDRESS=${accounts[0].address}`)
console.log(`MAKER_ADDRESS=${accounts[1].address}`)
console.log(`TAKER_ADDRESS=${accounts[2].address}`)
console.log('No private key was printed. Fund only DEPLOYER_ADDRESS; the deployment flow can fund the other roles.')

function environmentValue(source, name) {
  const match = source.match(new RegExp(`^${name}=(.*)$`, 'm'))
  return match?.[1]?.trim() ?? ''
}

function setEnvironmentValue(source, name, value) {
  const line = `${name}=${value}`
  const pattern = new RegExp(`^${name}=.*$`, 'm')
  if (pattern.test(source)) return source.replace(pattern, line)
  return `${source.replace(/\s*$/, '\n')}${line}\n`
}
