import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'

const appEnv = process.env.APP_ENV ?? 'dev'
const port = Number(process.env.PORT ?? 4173)
const backendUrl = (process.env.BACKEND_URL ?? '').replace(/\/$/, '')
const proxyToken = process.env.BACKEND_PROXY_TOKEN ?? ''
const distRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'dist')

if (appEnv === 'staging' && (!backendUrl || !proxyToken)) {
  console.error('Staging requires BACKEND_URL and BACKEND_PROXY_TOKEN.')
  process.exit(1)
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function proxyApi(req, res) {
  if (!backendUrl) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Backend URL is not configured')
    return
  }
  const incoming = new URL(req.url, 'http://frontend.local')
  const target = `${backendUrl}${incoming.pathname}${incoming.search}`
  const headers = { ...req.headers, 'x-chill-staging-gateway': proxyToken }
  delete headers.host
  delete headers.connection
  delete headers.authorization
  try {
    const hasBody = !['GET', 'HEAD'].includes(req.method ?? 'GET')
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req : undefined,
      duplex: hasBody ? 'half' : undefined,
    })
    const responseHeaders = Object.fromEntries(response.headers.entries())
    delete responseHeaders.connection
    res.writeHead(response.status, responseHeaders)
    if (response.body) Readable.fromWeb(response.body).pipe(res)
    else res.end()
  } catch {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Backend is unavailable')
  }
}

function safeStaticPath(urlPath) {
  let pathname
  try {
    pathname = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const candidate = resolve(distRoot, `.${normalize(pathname)}`)
  const relativePath = relative(distRoot, candidate)
  return candidate === distRoot || (!relativePath.startsWith('..') && !isAbsolute(relativePath)) ? candidate : null
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    res.end()
    return
  }
  const requestedPath = safeStaticPath(new URL(req.url, 'http://frontend.local').pathname)
  const hasExtension = extname(requestedPath ?? '') !== ''
  const filePath = requestedPath && existsSync(requestedPath) && statSync(requestedPath).isFile()
    ? requestedPath
    : hasExtension
      ? null
      : join(distRoot, 'index.html')
  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  res.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream' })
  if (req.method === 'HEAD') res.end()
  else createReadStream(filePath).pipe(res)
}

const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }
  if (req.url?.startsWith('/api/')) {
    void proxyApi(req, res)
    return
  }
  serveStatic(req, res)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`CHill frontend listening on port ${port} (${appEnv})`)
})
