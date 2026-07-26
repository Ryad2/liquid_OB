import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const root = resolve(process.env.WEB_ROOT ?? 'dist')
const host = process.env.WEB_HOST ?? '0.0.0.0'
const port = integer(process.env.WEB_PORT ?? '8080')
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
])

const server = createServer(async (request, response) => {
  secure(response)
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    response.end('{"status":"healthy"}\n')
    return
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' })
    response.end()
    return
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://arcbook.invalid').pathname)
    const requested = resolve(root, `.${pathname}`)
    if (requested !== root && !requested.startsWith(`${root}${sep}`)) {
      response.writeHead(400)
      response.end('Bad request')
      return
    }
    const exists = await regularFile(requested)
    if (!exists && extname(pathname) !== '') {
      response.writeHead(404)
      response.end('Not found')
      return
    }
    const file = exists ? requested : resolve(root, 'index.html')
    const extension = extname(file).toLowerCase()
    const immutable = file.includes(`${sep}assets${sep}`)
    response.writeHead(200, {
      'content-type': mimeTypes.get(extension) ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    if (request.method === 'HEAD') response.end()
    else createReadStream(file).on('error', () => response.destroy()).pipe(response)
  } catch {
    response.writeHead(404)
    response.end('Not found')
  }
})

server.listen(port, host, () => {
  process.stdout.write(`ArcBook web listening on ${host}:${port}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)))
}

async function regularFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

function secure(response) {
  response.setHeader('content-security-policy', "default-src 'self'; connect-src 'self' https: wss:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  response.setHeader('referrer-policy', 'strict-origin-when-cross-origin')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('x-frame-options', 'DENY')
}

function integer(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) throw new Error('WEB_PORT is invalid')
  return parsed
}
