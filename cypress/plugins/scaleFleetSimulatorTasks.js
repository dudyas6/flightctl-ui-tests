const { spawn, execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

let simulatorProcess = null
let simulatorDiagnostics = []
const SIMULATOR_STOP_TIMEOUT_MS = 30000

const simulatorHasExited = (processHandle) =>
  processHandle.exitCode !== null || processHandle.signalCode !== null

function recordSimulatorDiagnostic(chunk) {
  const text = String(chunk || '').trim()
  if (!text) return
  simulatorDiagnostics.push(text)
  simulatorDiagnostics = simulatorDiagnostics.slice(-20)
}

/**
 * Parses ~/.config/flightctl/client.yaml to extract service.server and
 * authentication.access-token using section-specific scanning rather than
 * a simple regex. The client.yaml on Jenkins has multiple `server:` keys
 * (e.g. imageBuilderService.server, service.server) — a naïve regex matches
 * whichever appears first, which may be the image-builder API that only
 * supports v1alpha1 and returns 406 for device endpoints.
 */
function parseFlightctlConfig(configContent) {
  const lines = configContent.split('\n')

  // Extract service.server — must be inside the top-level 'service:' block only.
  let serverUrl = null
  let inSection = false
  for (const line of lines) {
    const t = line.trimEnd()
    if (/^service:\s*$/.test(t)) { inSection = true; continue }
    if (inSection && /^\S/.test(t) && t !== '') { inSection = false }
    if (inSection) {
      const m = t.match(/^\s+server:\s*(\S+)/)
      if (m) { serverUrl = m[1].replace(/\/$/, ''); break }
    }
  }

  // Extract authentication.access-token — must be inside the 'authentication:' block.
  let bearerToken = null
  inSection = false
  for (const line of lines) {
    const t = line.trimEnd()
    if (/^authentication:\s*$/.test(t)) { inSection = true; continue }
    if (inSection && /^\S/.test(t) && t !== '') { inSection = false }
    if (inSection) {
      const m = t.match(/^\s+access-token:\s*(\S+)/)
      if (m) { bearerToken = m[1]; break }
    }
  }

  // organization is a unique top-level key — simple regex is fine.
  const orgMatch = configContent.match(/^\s*organization:\s*(\S+)/m)
  const orgId = orgMatch ? orgMatch[1] : null

  return { serverUrl, bearerToken, orgId }
}

/**
 * Turns a path that starts with `~/` into an absolute path using the current user's home directory.
 * Other paths are returned unchanged; falsy values are returned as-is.
 */
function expandPath(p) {
  if (!p) return p
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

/**
 * Resolves the `flightctl` CLI binary used to list devices during polls.
 * Uses `CYPRESS_FLIGHTCTL_BIN` when set, otherwise defaults to `~/flightctl/bin/flightctl`.
 */
function getFlightctlBin() {
  const fromEnv = process.env.CYPRESS_FLIGHTCTL_BIN
  if (fromEnv) return expandPath(fromEnv)
  return path.join(os.homedir(), 'flightctl/bin/flightctl')
}

/**
 * Resolves the device simulator executable spawned for the scale demo.
 * Uses `CYPRESS_DEVICE_SIMULATOR_BIN` when set, otherwise defaults to `~/flightctl/bin/devicesimulator`.
 */
function getSimulatorBin() {
  const fromEnv = process.env.CYPRESS_DEVICE_SIMULATOR_BIN
  if (fromEnv) return expandPath(fromEnv)
  return path.join(os.homedir(), 'flightctl/bin/devicesimulator')
}

/**
 * Async delay helper used between polls so the wait loop does not hammer the API or CLI.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readFlightctlApiConfig() {
  const configPath = path.join(os.homedir(), '.config', 'flightctl', 'client.yaml')
  const configContent = fs.readFileSync(configPath, 'utf8')
  const { serverUrl, bearerToken, orgId } = parseFlightctlConfig(configContent)
  if (!serverUrl || !bearerToken) {
    throw new Error('Missing service.server or authentication.access-token in flightctl client config')
  }
  const parsedUrl = new URL(serverUrl)
  return {
    hostname: parsedUrl.hostname,
    port: parseInt(parsedUrl.port || '443', 10),
    bearerToken,
    orgQuery: orgId ? `?org_id=${orgId}` : '',
  }
}

function requestFlightctlApi(reqPath) {
  const { hostname, port, bearerToken } = readFlightctlApiConfig()
  const https = require('https')
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      port,
      path: reqPath,
      method: 'GET',
      rejectUnauthorized: false,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end()
  })
}

/**
 * Runs `flightctl get devices` with a label selector and returns how many devices appear in JSON `items`.
 * Tries several flag combinations (`-l` / `--selector`) so minor CLI differences still parse correctly.
 */
function countDevices(flightctlBin, labelSelector) {
  const attempts = [
    ['get', 'devices', '-l', labelSelector, '-o', 'json'],
    ['get', 'devices', '--selector', labelSelector, '-o', 'json'],
    ['get', 'devices', '--selector', labelSelector, '--output', 'json'],
  ]
  let lastErr
  for (const args of attempts) {
    try {
      const out = execFileSync(flightctlBin, args, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      })
      const data = JSON.parse(out)
      if (Array.isArray(data.items)) {
        return data.items.length
      }
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(
    `Unable to list devices with ${flightctlBin} (selector ${labelSelector}): ${lastErr && lastErr.message}`,
  )
}

/**
 * Registers Cypress `task` handlers that start/stop the simulator and wait until enough devices exist.
 * Call this from `setupNodeEvents` so specs can drive the background process from `cy.task(...)`.
 */
function registerScaleFleetSimulatorTasks(on) {
  on('task', {
    /**
     * Spawns the device simulator with fixed scale-demo arguments (50 devices, fleet label, concurrency 1).
     * If a simulator child is already running, returns `{ alreadyRunning: true }` instead of starting another.
     */
    scaleFleetSimulatorStart({ count = 50, label = 'fleet=scale-fleet-00', initialDeviceIndex = 0 } = {}) {
      if (simulatorProcess) {
        if (simulatorHasExited(simulatorProcess)) {
          simulatorProcess = null
        } else if (!simulatorProcess.killed) {
          return { alreadyRunning: true, pid: simulatorProcess.pid }
        } else {
          throw new Error(`Device simulator PID ${simulatorProcess.pid} is still stopping`)
        }
      }
      // Remove stale device data so the simulator re-submits enrollment requests
      // after a backend cleanup (deleted devices leave orphaned dirs that fool the simulator).
      const dataDir = path.join(os.homedir(), '.flightctl', 'data')
      if (fs.existsSync(dataDir)) {
        for (const entry of fs.readdirSync(dataDir)) {
          if (/^device-/.test(entry)) {
            try { fs.rmSync(path.join(dataDir, entry), { recursive: true, force: true }) } catch (_) {}
          }
        }
      }
      const bin = getSimulatorBin()
      const args = [
        `--count=${count}`,
        '--label',
        label,
        '--log-level',
        'error',
        `--initial-device-index=${initialDeviceIndex}`,
        '--max-concurrency',
        '10',
      ]
      simulatorDiagnostics = []
      simulatorProcess = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      simulatorProcess.stdout?.on('data', recordSimulatorDiagnostic)
      simulatorProcess.stderr?.on('data', recordSimulatorDiagnostic)
      simulatorProcess.once('error', (error) => recordSimulatorDiagnostic(`spawn error: ${error.message}`))
      simulatorProcess.once('exit', (code, signal) => {
        recordSimulatorDiagnostic(`process exited: code=${code ?? 'null'} signal=${signal || 'none'}`)
      })
      return { pid: simulatorProcess.pid }
    },

    /**
     * Patches a device's reported OS image and digest via the FlightCtl REST API.
     * Reads server URL and bearer token from ~/.config/flightctl/client.yaml and
     * calls PUT /api/v1/devices/{name}/status directly — `flightctl apply` only
     * updates the device spec, not the status subresource.
     *
     * Returns { success: true } or { success: false, error: string }.
     */
    async patchDeviceStatus({ deviceName, image, imageDigest }) {
      // Read FlightCtl client config to get server URL and bearer token.
      // The CLI's `apply` command only updates the device spec, not status.
      // We must PUT to /api/v1/devices/{name}/status directly.
      const configPath = path.join(os.homedir(), '.config', 'flightctl', 'client.yaml')
      let configContent
      try {
        configContent = fs.readFileSync(configPath, 'utf8')
      } catch (e) {
        return { success: false, error: `Cannot read flightctl config ${configPath}: ${e.message}` }
      }

      const { serverUrl, bearerToken, orgId } = parseFlightctlConfig(configContent)
      if (!serverUrl) return { success: false, error: 'Cannot find service.server in flightctl config' }
      if (!bearerToken) return { success: false, error: 'Cannot find authentication.access-token in flightctl config' }
      console.log(`[patchDeviceStatus] Using FlightCtl API server: ${serverUrl}`)

      const parsedUrl = new URL(serverUrl)
      const hostname = parsedUrl.hostname
      const port = parseInt(parsedUrl.port || '443', 10)
      // org_id query param is required when the service account belongs to multiple orgs
      const orgQuery = orgId ? `?org_id=${orgId}` : ''

      const https = require('https')

      const makeRequest = (method, reqPath, body) => new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined
        const options = {
          hostname,
          port,
          path: reqPath,
          method,
          rejectUnauthorized: false,
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
            // Routes to v1beta1 sub-router where device endpoints live.
            // Without this, server defaults to v1alpha1 (no device routes → 404).
            'Flightctl-API-Version': 'v1beta1',
          },
        }
        if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload)
        const req = https.request(options, (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
        })
        req.on('error', reject)
        if (payload) req.write(payload)
        req.end()
      })

      const getPath = `/api/v1/devices/${deviceName}${orgQuery}`
      const statusPath = `/api/v1/devices/${deviceName}/status${orgQuery}`

      const applyStatus = async (attempt) => {
        const getResp = await makeRequest('GET', getPath, null)
        if (getResp.statusCode !== 200) {
          return { success: false, error: `GET ${hostname}:${port}${getPath} (attempt ${attempt}) returned ${getResp.statusCode}: ${getResp.body.slice(0, 300)}` }
        }
        let device
        try {
          device = JSON.parse(getResp.body)
        } catch (e) {
          return { success: false, error: `parse device JSON: ${e.message}` }
        }
        // Replace status wholesale with a fully-initialized object matching NewDeviceStatus()
        // from the Go e2e harness. Mutating the agent's existing status fields risks sending
        // values the v1beta1 server rejects (unknown enum values, missing required fields, etc.).
        device.status = {
          conditions: [{ type: 'Updating', status: 'Unknown', lastTransitionTime: new Date().toISOString(), reason: 'Unknown', message: '' }],
          applications: [],
          applicationsSummary: { status: 'Unknown' },
          config: { renderedVersion: '' },
          integrity: { status: 'Unknown' },
          resources: { cpu: 'Unknown', disk: 'Unknown', memory: 'Unknown' },
          updated: { status: 'Unknown' },
          summary: { status: 'Unknown' },
          lifecycle: { status: 'Unknown' },
          os: { image, imageDigest },
          systemInfo: { agentVersion: '', architecture: '', bootID: '', operatingSystem: '' },
        }
        const putResp = await makeRequest('PUT', statusPath, device)
        if (putResp.statusCode === 409 && attempt < 3) {
          return applyStatus(attempt + 1)
        }
        if (putResp.statusCode >= 200 && putResp.statusCode < 300) {
          return { success: true }
        }
        return { success: false, error: `PUT /status (attempt ${attempt}) returned ${putResp.statusCode}: ${putResp.body.slice(0, 300)}` }
      }

      try {
        return await applyStatus(1)
      } catch (e) {
        return { success: false, error: `HTTP request failed: ${e.message}` }
      }
    },

    /**
     * Resolves a device's internal hash name from a label selector.
     * The simulator names devices with opaque hashes, but we track them by label.
     * Returns the first matching device's metadata.name, or throws if none found.
     */
    getDeviceNameByLabel({ labelSelector, timeoutMs = 10000 }) {
      const flightctlBin = getFlightctlBin()
      const args = ['get', 'devices', '-l', labelSelector, '-o', 'json']
      const out = execFileSync(flightctlBin, args, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        timeout: timeoutMs,
      })
      const data = JSON.parse(out)
      const items = data.items || []
      if (items.length === 0) {
        throw new Error(`No device found with label selector: ${labelSelector}`)
      }
      return items[0].metadata.name
    },

    /**
     * Patches the reported OS mode on an existing device via GET/PUT.
     * The device simulator always reports osMode=package; the catalog deploy wizard
     * filters out package-based devices, so we flip osMode to "image" after
     * enrollment so the device appears as a valid deploy target.
     * Newer agents report the authoritative value in status.systemInfo.osMode;
     * status.capabilities.osMode is retained for older-agent compatibility.
     *
     * IMPORTANT: stop the simulator BEFORE calling this — otherwise the agent
     * heartbeat will overwrite the patched osMode back to "package".
     *
     * Returns { success: true } or { success: false, error: string }.
     */
    async patchDeviceOsMode({ deviceName, osMode = 'image' }) {
      const configPath = path.join(os.homedir(), '.config', 'flightctl', 'client.yaml')
      let configContent
      try {
        configContent = fs.readFileSync(configPath, 'utf8')
      } catch (e) {
        return { success: false, error: `Cannot read flightctl config ${configPath}: ${e.message}` }
      }

      const { serverUrl, bearerToken, orgId } = parseFlightctlConfig(configContent)
      if (!serverUrl) return { success: false, error: 'Cannot find service.server in flightctl config' }
      if (!bearerToken) return { success: false, error: 'Cannot find authentication.access-token in flightctl config' }

      const https = require('https')
      const parsedUrl = new URL(serverUrl)
      const hostname = parsedUrl.hostname
      const port = parseInt(parsedUrl.port || '443', 10)
      const orgQuery = orgId ? `?org_id=${orgId}` : ''

      const makeReq = (method, reqPath, body) => new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined
        const options = {
          hostname, port, path: reqPath, method,
          rejectUnauthorized: false,
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
            'Flightctl-API-Version': 'v1beta1',
          },
        }
        if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload)
        const req = https.request(options, (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
        })
        req.on('error', reject)
        if (payload) req.write(payload)
        req.end()
      })

      const getPath = `/api/v1/devices/${deviceName}${orgQuery}`
      const statusPath = `/api/v1/devices/${deviceName}/status${orgQuery}`

      const tryPatch = async (attempt) => {
        const getResp = await makeReq('GET', getPath, null)
        if (getResp.statusCode !== 200) {
          return { success: false, error: `GET device (attempt ${attempt}) returned ${getResp.statusCode}: ${getResp.body.slice(0, 300)}` }
        }
        let device
        try { device = JSON.parse(getResp.body) } catch (e) {
          return { success: false, error: `parse device JSON: ${e.message}` }
        }
        if (!device.status) device.status = {}
        if (!device.status.systemInfo) device.status.systemInfo = {}
        if (!device.status.capabilities) device.status.capabilities = {}
        device.status.systemInfo.osMode = osMode
        device.status.capabilities.osMode = osMode
        console.log(`[patchDeviceOsMode] Setting ${deviceName} osMode=${osMode} (attempt ${attempt})`)

        const putResp = await makeReq('PUT', statusPath, device)
        if (putResp.statusCode === 409 && attempt < 3) {
          return tryPatch(attempt + 1)
        }
        if (putResp.statusCode >= 200 && putResp.statusCode < 300) {
          return { success: true }
        }
        return { success: false, error: `PUT /status (attempt ${attempt}) returned ${putResp.statusCode}: ${putResp.body.slice(0, 300)}` }
      }

      try {
        return await tryPatch(1)
      } catch (e) {
        return { success: false, error: `HTTP request failed: ${e.message}` }
      }
    },

    /**
     * Fetches a device's current status subresource and returns it.
     * Used to verify that patchDeviceStatus actually persisted the digest.
     * Returns the status object, or null on error.
     */
    async getDeviceStatus({ deviceName }) {
      const configPath = path.join(os.homedir(), '.config', 'flightctl', 'client.yaml')
      let configContent
      try {
        configContent = fs.readFileSync(configPath, 'utf8')
      } catch (e) {
        return null
      }

      const { serverUrl, bearerToken, orgId } = parseFlightctlConfig(configContent)
      if (!serverUrl || !bearerToken) return null
      console.log(`[getDeviceStatus] Using FlightCtl API server: ${serverUrl}`)

      const parsedUrl = new URL(serverUrl)
      const hostname = parsedUrl.hostname
      const port = parseInt(parsedUrl.port || '443', 10)
      const orgQuery = orgId ? `?org_id=${orgId}` : ''

      const https = require('https')
      const resp = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname, port,
          path: `/api/v1/devices/${deviceName}${orgQuery}`,
          method: 'GET',
          rejectUnauthorized: false,
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
            'Flightctl-API-Version': 'v1beta1',
          },
        }, (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
        })
        req.on('error', reject)
        req.end()
      })

      if (resp.statusCode !== 200) return null
      try {
        return JSON.parse(resp.body)
      } catch (e) {
        return null
      }
    },

    /**
     * Fetches /api/v1/vulnerabilities/fleets/{fleetName} and returns a diagnostic object:
     *   { statusCode, cveCount, cves: [{cveId, severity}], rawBody (first 2000 chars) }
     * Used to diagnose why fleet CVE count shows 0 in the UI even though the device has CVEs.
     * NOTE: vulnerability endpoints live in v1alpha1 — do NOT send Flightctl-API-Version header.
     */
    async getFleetVulnerabilities({ fleetName }) {
      const configPath = path.join(os.homedir(), '.config', 'flightctl', 'client.yaml')
      let configContent
      try {
        configContent = fs.readFileSync(configPath, 'utf8')
      } catch (e) {
        return { error: `Cannot read flightctl config: ${e.message}` }
      }
      const { serverUrl, bearerToken, orgId } = parseFlightctlConfig(configContent)
      if (!serverUrl || !bearerToken) return { error: 'Missing server URL or bearer token in client config' }

      const https = require('https')
      const parsedUrl = new URL(serverUrl)
      const hostname = parsedUrl.hostname
      const port = parseInt(parsedUrl.port || '443', 10)
      const orgQuery = orgId ? `?org_id=${orgId}` : ''

      console.log(`[getFleetVulnerabilities] GET ${serverUrl}/api/v1/vulnerabilities/fleets/${fleetName}${orgQuery}`)
      try {
        const resp = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname, port,
            path: `/api/v1/vulnerabilities/fleets/${fleetName}${orgQuery}`,
            method: 'GET',
            rejectUnauthorized: false,
            headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
          }, (res) => {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
          })
          req.on('error', reject)
          req.end()
        })
        console.log(`[getFleetVulnerabilities] HTTP ${resp.statusCode}: ${resp.body.slice(0, 500)}`)
        let parsed = null
        try { parsed = JSON.parse(resp.body) } catch (_) {}
        const items = parsed && parsed.items ? parsed.items : []
        return {
          statusCode: resp.statusCode,
          cveCount: items.length,
          cves: items.map((v) => ({
            cveId: v.cveId || v.metadata?.name,
            severity: v.severity,
            source: v.source || v.findings?.[0]?.source,
          })),
          rawBody: resp.body.slice(0, 2000),
        }
      } catch (e) {
        return { error: `HTTP request failed: ${e.message}` }
      }
    },

    /**
     * Fetches /api/v1/devices?owner=Fleet/{fleetName} to check which devices the fleet owns
     * and what imageDigest they report. Helps diagnose why ListFleetDeviceImageDigests returns
     * no digests even though the device was patched.
     * Returns { deviceCount, devices: [{name, owner, imageDigest}] }
     */
    async getFleetDevices({ fleetName }) {
      const configPath = path.join(os.homedir(), '.config', 'flightctl', 'client.yaml')
      let configContent
      try {
        configContent = fs.readFileSync(configPath, 'utf8')
      } catch (e) {
        return { error: `Cannot read flightctl config: ${e.message}` }
      }
      const { serverUrl, bearerToken, orgId } = parseFlightctlConfig(configContent)
      if (!serverUrl || !bearerToken) return { error: 'Missing server URL or bearer token' }

      const https = require('https')
      const parsedUrl = new URL(serverUrl)
      const hostname = parsedUrl.hostname
      const port = parseInt(parsedUrl.port || '443', 10)
      const orgQuery = orgId ? `&org_id=${orgId}` : ''
      const reqPath = `/api/v1/devices?labelSelector=fleet%3D${encodeURIComponent(fleetName)}${orgQuery}`

      console.log(`[getFleetDevices] GET ${serverUrl}${reqPath}`)
      try {
        const resp = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname, port, path: reqPath, method: 'GET',
            rejectUnauthorized: false,
            headers: {
              Authorization: `Bearer ${bearerToken}`,
              'Content-Type': 'application/json',
              'Flightctl-API-Version': 'v1beta1',
            },
          }, (res) => {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
          })
          req.on('error', reject)
          req.end()
        })
        console.log(`[getFleetDevices] HTTP ${resp.statusCode}: ${resp.body.slice(0, 500)}`)
        let parsed = null
        try { parsed = JSON.parse(resp.body) } catch (_) {}
        const items = parsed && parsed.items ? parsed.items : []
        return {
          statusCode: resp.statusCode,
          deviceCount: items.length,
          devices: items.map((d) => ({
            name: d.metadata?.name,
            owner: d.metadata?.owner,
            imageDigest: d.status?.os?.imageDigest,
          })),
        }
      } catch (e) {
        return { error: `HTTP request failed: ${e.message}` }
      }
    },

    /**
     * Fetches /api/v1/vulnerabilities/devices/{deviceName} and returns a diagnostic object:
     *   { statusCode, cveCount, cves: [{cveId, severity}], rawBody (first 2000 chars) }
     * Used to diagnose whether device CVEs are indexed at the time Step 5 assertions run.
     * NOTE: vulnerability endpoints live in v1alpha1 — do NOT send Flightctl-API-Version header.
     */
    async getDeviceVulnerabilities({ deviceName }) {
      const configPath = path.join(os.homedir(), '.config', 'flightctl', 'client.yaml')
      let configContent
      try {
        configContent = fs.readFileSync(configPath, 'utf8')
      } catch (e) {
        return { error: `Cannot read flightctl config: ${e.message}` }
      }
      const { serverUrl, bearerToken, orgId } = parseFlightctlConfig(configContent)
      if (!serverUrl || !bearerToken) return { error: 'Missing server URL or bearer token in client config' }

      const https = require('https')
      const parsedUrl = new URL(serverUrl)
      const hostname = parsedUrl.hostname
      const port = parseInt(parsedUrl.port || '443', 10)
      const orgQuery = orgId ? `?org_id=${orgId}` : ''

      console.log(`[getDeviceVulnerabilities] GET ${serverUrl}/api/v1/vulnerabilities/devices/${deviceName}${orgQuery}`)
      try {
        const resp = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname, port,
            path: `/api/v1/vulnerabilities/devices/${deviceName}${orgQuery}`,
            method: 'GET',
            rejectUnauthorized: false,
            headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
          }, (res) => {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
          })
          req.on('error', reject)
          req.end()
        })
        console.log(`[getDeviceVulnerabilities] HTTP ${resp.statusCode}: ${resp.body.slice(0, 500)}`)
        let parsed = null
        try { parsed = JSON.parse(resp.body) } catch (_) {}
        const items = parsed && parsed.items ? parsed.items : []
        return {
          statusCode: resp.statusCode,
          cveCount: items.length,
          cves: items.map((v) => ({
            cveId: v.cveId || v.metadata?.name,
            severity: v.severity,
            source: v.source,
          })),
          rawBody: resp.body.slice(0, 2000),
        }
      } catch (e) {
        return { error: `HTTP request failed: ${e.message}` }
      }
    },

    /**
     * Polls /api/v1/vulnerabilities/devices/{deviceName} until cveCount >= expectedCount
     * or timeoutMs elapses. Returns { success: true, cveCount } when found, or
     * { success: false, cveCount, reason } on timeout/error.
     *
     * Use this in Step 4 BEFORE asserting the UI so the test waits for the flightctl
     * periodic VulnerabilitySync to index the digest — the UI only shows what the backend has.
     */
    async pollDeviceVulnerabilities({ deviceName, expectedCount = 1, exact = false, timeoutMs = 600000, pollMs = 15000 }) {
      const configPath = path.join(os.homedir(), '.config', 'flightctl', 'client.yaml')
      let configContent
      try {
        configContent = fs.readFileSync(configPath, 'utf8')
      } catch (e) {
        return { success: false, cveCount: 0, reason: `Cannot read flightctl config: ${e.message}` }
      }
      const { serverUrl, bearerToken, orgId } = parseFlightctlConfig(configContent)
      if (!serverUrl || !bearerToken) return { success: false, cveCount: 0, reason: 'Missing server URL or bearer token' }

      const https = require('https')
      const parsedUrl = new URL(serverUrl)
      const hostname = parsedUrl.hostname
      const port = parseInt(parsedUrl.port || '443', 10)
      const orgQuery = orgId ? `?org_id=${orgId}` : ''
      const reqPath = `/api/v1/vulnerabilities/devices/${deviceName}${orgQuery}`

      const fetchCount = async () => {
        const resp = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname, port, path: reqPath, method: 'GET',
            rejectUnauthorized: false,
            headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
          }, (res) => {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
          })
          req.on('error', reject)
          req.end()
        })
        let parsed = null
        try { parsed = JSON.parse(resp.body) } catch (_) {}
        return parsed && parsed.items ? parsed.items.length : 0
      }

      const deadline = Date.now() + timeoutMs
      let lastCount = 0
      let attempt = 0
      while (Date.now() < deadline) {
        attempt++
        try {
          lastCount = await fetchCount()
          console.log(`[pollDeviceVulnerabilities] attempt ${attempt}: ${deviceName} has ${lastCount} CVEs (want >= ${expectedCount})`)
          if ((exact && lastCount === expectedCount) || (!exact && lastCount >= expectedCount)) {
            return { success: true, cveCount: lastCount }
          }
        } catch (e) {
          console.log(`[pollDeviceVulnerabilities] attempt ${attempt}: request failed: ${e.message}`)
        }
        if (Date.now() + pollMs < deadline) {
          await sleep(pollMs)
        } else {
          break
        }
      }
      return { success: false, cveCount: lastCount, reason: `Timed out after ${timeoutMs}ms — last cveCount=${lastCount}` }
    },

    /**
     * Reads the configured vulnerability backend from the periodic service ConfigMap.
     * CI may provide CYPRESS_VULNERABILITY_BACKEND when kubectl access is unavailable.
     */
    checkVulnerabilityBackend() {
      if (process.env.CYPRESS_VULNERABILITY_BACKEND) {
        return process.env.CYPRESS_VULNERABILITY_BACKEND
      }
      try {
        for (const configMapName of ['flightctl-periodic-config', 'flightctl-periodic']) {
          try {
            const raw = execFileSync(
              'kubectl',
              ['get', 'configmap', configMapName, '-n', 'flightctl', '-o', 'jsonpath={.data.config\\.yaml}'],
              { encoding: 'utf8', timeout: 15000 },
            )
            const match = raw.match(/vulnerabilityReporting:[\s\S]*?\n\s+backend:\s*["']?([a-zA-Z0-9_-]+)["']?/)
            if (match) return match[1]
          } catch (e) {
            // Try the legacy ConfigMap name before reporting that the backend is unknown.
          }
        }
      } catch (e) {
        console.log(`[checkVulnerabilityBackend] Cannot read periodic ConfigMap: ${e.message}`)
      }
      return null
    },

    /**
     * Fetches the estate-wide vulnerability summary through the same API used by the UI.
     */
    async getVulnerabilitySummary() {
      try {
        const { orgQuery } = readFlightctlApiConfig()
        const resp = await requestFlightctlApi(`/api/v1/vulnerabilities/summary${orgQuery}`)
        let parsed = null
        try { parsed = JSON.parse(resp.body) } catch (_) {}
        return {
          statusCode: resp.statusCode,
          cvesBySeverity: parsed && parsed.cvesBySeverity ? parsed.cvesBySeverity : null,
          rawBody: resp.body.slice(0, 2000),
        }
      } catch (e) {
        return { error: `HTTP request failed: ${e.message}` }
      }
    },

    /**
     * Fetches CVE impact data for an affected-device assertion.
     */
    async getVulnerabilityImpact({ cveId }) {
      try {
        const { orgQuery } = readFlightctlApiConfig()
        const separator = orgQuery ? '&' : '?'
        const resp = await requestFlightctlApi(
          `/api/v1/vulnerabilities/cves/${encodeURIComponent(cveId)}/impact${orgQuery}${separator}limit=100`,
        )
        let parsed = null
        try { parsed = JSON.parse(resp.body) } catch (_) {}
        return {
          statusCode: resp.statusCode,
          items: parsed && parsed.items ? parsed.items : [],
          rawBody: resp.body.slice(0, 4000),
        }
      } catch (e) {
        return { error: `HTTP request failed: ${e.message}` }
      }
    },

    /**
     * Sends SIGTERM to the spawned simulator process and waits for it to exit before
     * clearing the module-level handle. This keeps a final agent heartbeat from
     * overwriting status patches made immediately after the stop task.
     * Safe to call when nothing is running; subsequent starts create a fresh child process.
     */
    scaleFleetSimulatorStop() {
      const processToStop = simulatorProcess
      if (!processToStop) return null

      if (simulatorHasExited(processToStop)) {
        if (simulatorProcess === processToStop) simulatorProcess = null
        return {
          pid: processToStop.pid,
          exitCode: processToStop.exitCode,
          signal: processToStop.signalCode,
        }
      }

      return new Promise((resolve, reject) => {
        const onExit = (code, signal) => {
          clearTimeout(timeout)
          processToStop.removeListener('error', onError)
          if (simulatorProcess === processToStop) simulatorProcess = null
          resolve({ pid: processToStop.pid, exitCode: code, signal })
        }
        const onError = (error) => {
          clearTimeout(timeout)
          processToStop.removeListener('exit', onExit)
          reject(new Error(`Failed waiting for device simulator PID ${processToStop.pid} to stop: ${error.message}`))
        }
        const timeout = setTimeout(() => {
          processToStop.removeListener('exit', onExit)
          processToStop.removeListener('error', onError)
          reject(new Error(`Timed out after ${SIMULATOR_STOP_TIMEOUT_MS}ms waiting for device simulator PID ${processToStop.pid} to stop`))
        }, SIMULATOR_STOP_TIMEOUT_MS)

        processToStop.once('exit', onExit)
        processToStop.once('error', onError)

        if (simulatorHasExited(processToStop)) {
          onExit(processToStop.exitCode, processToStop.signalCode)
          return
        }

        if (!processToStop.killed) {
          try {
            processToStop.kill('SIGTERM')
          } catch (error) {
            onError(error)
          }
        }
      })
    },

    /**
     * Creates the scale-fleet if it does not already exist, so enrolled devices get fleet ownership.
     * Safe to call repeatedly — no-ops when the fleet is already present.
     */
    scaleFleetEnsureExists({ fleetName = 'scale-fleet-00', selectorKey = 'fleet', selectorValue = 'scale-fleet-00' } = {}) {
      const bin = getFlightctlBin()
      try {
        execFileSync(bin, ['get', 'fleet', fleetName, '-o', 'name'], { encoding: 'utf8' })
        return { existed: true }
      } catch (_) {
        // Fleet does not exist — create it via apply
      }
      const yaml = [
        'apiVersion: v1beta1',
        'kind: Fleet',
        'metadata:',
        `  name: ${fleetName}`,
        'spec:',
        '  selector:',
        '    matchLabels:',
        `      ${selectorKey}: ${selectorValue}`,
        '  template:',
        '    spec: {}',
      ].join('\n') + '\n'
      const tmpPath = path.join(os.tmpdir(), `fleet-${fleetName}.yaml`)
      fs.writeFileSync(tmpPath, yaml)
      try {
        execFileSync(bin, ['apply', '-f', tmpPath], { encoding: 'utf8' })
      } finally {
        try { fs.unlinkSync(tmpPath) } catch (_) {}
      }
      return { existed: false, created: true }
    },

    /**
     * Removes the scale-fleet and all devices bearing its label so subsequent specs start clean.
     * Failures are swallowed — cleanup is best-effort.
     */
    scaleFleetCleanup({ fleetName = 'scale-fleet-00', labelSelector = 'fleet=scale-fleet-00' } = {}) {
      const bin = getFlightctlBin()
      try { execFileSync(bin, ['delete', 'fleet', fleetName], { encoding: 'utf8' }) } catch (_) {}
      try {
        const out = execFileSync(bin, ['get', 'enrollmentrequests', '-o', 'json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
        const names = (JSON.parse(out).items || []).map((i) => i.metadata && i.metadata.name).filter(Boolean)
        const CHUNK = 50
        for (let i = 0; i < names.length; i += CHUNK) {
          const chunk = names.slice(i, i + CHUNK)
          try { execFileSync(bin, ['delete', 'devices', ...chunk], { encoding: 'utf8' }) } catch (_) {}
        }
      } catch (_) {}
      return null
    },

    async scaleFleetSimulatorWaitForDevices({
      expected = 50,
      labelSelector = 'fleet=scale-fleet-00',
      timeoutMs = 600000,
      pollMs = 5000,
      settleMs = 0,
    }) {
      const flightctlBin = getFlightctlBin()
      const deadline = Date.now() + timeoutMs
      let last = 0
      let lastErr
      while (Date.now() < deadline) {
        try {
          const c = countDevices(flightctlBin, labelSelector)
          last = c
          if (c >= expected) {
            // The CLI confirmed enough devices, but the UI enrollment pipeline may still
            // be processing the last batch. Wait an extra settle period so all devices
            // are fully visible in the browser before any test navigates to page 4.
            if (settleMs > 0) {
              await sleep(settleMs)
            }
            return { count: c }
          }
        } catch (e) {
          lastErr = e
        }
        await sleep(pollMs)
      }
      const processState = !simulatorProcess
        ? 'not started'
        : simulatorProcess.exitCode !== null
          ? `exited with code ${simulatorProcess.exitCode}`
          : simulatorProcess.killed
            ? 'killed'
            : 'still running'
      const diagnostics = simulatorDiagnostics.length ? ` Diagnostics: ${simulatorDiagnostics.join(' | ')}` : ''
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for ${expected} devices (last count: ${last}; simulator ${processState}). ${lastErr ? lastErr.message : ''}${diagnostics}`,
      )
    },
  })
}

module.exports = { registerScaleFleetSimulatorTasks }
