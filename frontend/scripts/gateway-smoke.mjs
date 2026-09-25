import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()))
}

const seen = { gatewayToken: null, authorization: null }
const backend = createServer((request, response) => {
  seen.gatewayToken = request.headers['x-chill-staging-gateway'] ?? null
  seen.authorization = request.headers.authorization ?? null
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ status: 'guest' }))
})

const backendPort = await listen(backend)
const gatewayPortProbe = createServer()
const gatewayPort = await listen(gatewayPortProbe)
await close(gatewayPortProbe)
const gateway = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    APP_ENV: 'staging',
    PORT: String(gatewayPort),
    BACKEND_URL: `http://127.0.0.1:${backendPort}`,
    BACKEND_PROXY_TOKEN: 'gateway-smoke-token',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

try {
  const deadline = Date.now() + 5000
  let root
  while (!root && Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}/`)
      if (response.status === 200) root = response
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  assert.equal(root?.status, 200, 'A frontend Basic Auth nélkül is elérhető')

  const health = await fetch(`http://127.0.0.1:${gatewayPort}/healthz`)
  assert.equal(health.status, 200)

  const proxied = await fetch(`http://127.0.0.1:${gatewayPort}/api/auth/me`, {
    headers: { Authorization: 'Basic should-not-be-forwarded' },
  })
  assert.equal(proxied.status, 200)
  assert.equal(seen.gatewayToken, 'gateway-smoke-token')
  assert.equal(seen.authorization, null)
  console.log('Frontend gateway smoke passed: public guest shell, healthcheck, server-side proxy token, no auth forwarding')
} finally {
  gateway.kill()
  await close(backend)
}
