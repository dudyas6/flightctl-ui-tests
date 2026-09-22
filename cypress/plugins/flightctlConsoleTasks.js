/**
 * Cypress tasks for running commands on enrolled devices via `flightctl console`.
 * Requires `flightctl` CLI installed and logged in on the machine running Cypress.
 *
 * Usage in tests:
 *   cy.task('flightctlConsoleCommand', {
 *     deviceAlias: 'test-device-edited2',
 *     commands: ['logger -p user.info "test message"', 'whoami']
 *   })
 */
const { execSync } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs')

function parseFlightctlClientConfig(configContent) {
  const lines = configContent.split('\n')
  let serverUrl = null
  let bearerToken = null
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

  const orgMatch = configContent.match(/^\s*organization:\s*(\S+)/m)
  const orgId = orgMatch ? orgMatch[1] : null

  return { serverUrl, bearerToken, orgId }
}

function getFlightctlBin() {
  const fromEnv = process.env.CYPRESS_FLIGHTCTL_BIN
  if (fromEnv) return fromEnv

  const fromBuild = path.join(os.homedir(), 'flightctl', 'bin', 'flightctl')
  if (fs.existsSync(fromBuild)) return fromBuild

  return 'flightctl'
}

function getDeviceName(bin, alias) {
  try {
    const output = execSync(`${bin} get devices -o json`, { encoding: 'utf-8', timeout: 15000 })
    const devices = JSON.parse(output)
    const items = devices.items || []
    if (alias) {
      const match = items.find((d) => d.metadata?.labels?.alias === alias)
      if (match) return match.metadata.name
    }
    if (items.length > 0) {
      return items[0].metadata.name
    }
  } catch (e) { /* fall through */ }
  return null
}

/**
 * Returns the Trustify API base URL.
 * Reads CYPRESS_TRUSTIFY_URL env var first; falls back to querying the
 * flightctl-periodic ConfigMap for the configured endpoint.
 * Returns null if the URL cannot be determined.
 */
function getTrustifyUrl() {
  if (process.env.CYPRESS_TRUSTIFY_URL) {
    return process.env.CYPRESS_TRUSTIFY_URL.replace(/\/$/, '')
  }
  // Fall back: read endpoint from flightctl-periodic ConfigMap via kubectl.
  // Use jsonpath to drill directly to the endpoint value — avoids a YAML parser dep.
  try {
    const raw = execSync(
      "kubectl get configmap flightctl-periodic -n flightctl -o jsonpath='{.data.config\\.yaml}'",
      { encoding: 'utf-8', timeout: 15000 }
    )
    // Extract `endpoint: <url>` from under the trustify: block using a simple regex
    const m = raw.match(/trustify:\s*[\r\n]+(?:[^\S\r\n]+\S[^\r\n]*[\r\n]+)*?[^\S\r\n]+endpoint:\s*(\S+)/m)
    if (m) return m[1].replace(/\/$/, '')
  } catch (e) {
    console.log(`[getTrustifyUrl] kubectl fallback failed: ${e.message}`)
  }
  return null
}

function registerFlightctlConsoleTasks(on) {
  on('task', {
    /**
     * Probes the FlightCtl REST API to determine whether vulnerability reporting is enabled.
     * Reads server URL and bearer token from ~/.config/flightctl/client.yaml.
     * Returns true if GET /api/v1/vulnerabilities/summary returns 200.
     * 501 = not implemented (Trustify disabled). Note: do NOT send Flightctl-API-Version: v1beta1
     * here — the vulnerability endpoint lives in the default v1alpha1 router; that header causes 406.
     */
    async checkVulnerabilityEnabled() {
      const configPath = path.join(os.homedir(), '.config', 'flightctl', 'client.yaml')
      let configContent
      try {
        configContent = fs.readFileSync(configPath, 'utf8')
      } catch (e) {
        console.log(`[checkVulnerabilityEnabled] Cannot read ${configPath}: ${e.message}`)
        return false
      }

      const { serverUrl, bearerToken, orgId } = parseFlightctlClientConfig(configContent)
      if (!serverUrl || !bearerToken) {
        console.log('[checkVulnerabilityEnabled] Missing server URL or bearer token in client config')
        return false
      }

      console.log(`[checkVulnerabilityEnabled] Probing FlightCtl API at ${serverUrl}`)
      const https = require('https')
      const parsedUrl = new URL(serverUrl)
      const hostname = parsedUrl.hostname
      const port = parseInt(parsedUrl.port || '443', 10)
      const orgQuery = orgId ? `?org_id=${orgId}` : ''

      try {
        const resp = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname, port,
            path: `/api/v1/vulnerabilities/summary${orgQuery}`,
            method: 'GET',
            rejectUnauthorized: false,
            headers: {
              Authorization: `Bearer ${bearerToken}`,
              'Content-Type': 'application/json',
            },
          }, (res) => {
            res.resume()
            resolve(res.statusCode)
          })
          req.on('error', reject)
          req.end()
        })
        console.log(`[checkVulnerabilityEnabled] /api/v1/vulnerabilities/summary → HTTP ${resp}`)
        return resp === 200
      } catch (e) {
        console.log(`[checkVulnerabilityEnabled] Request failed: ${e.message}`)
        return false
      }
    },

    /**
     * Uploads the test SBOMs and advisories to Trustify so vulnerability data is
     * available for the test digest sha256:aaaa...aaaa (DigestA = 7 CVEs).
     *
     * The Trustify URL is read from CYPRESS_TRUSTIFY_URL env var, or discovered
     * from the flightctl-periodic ConfigMap via kubectl as a fallback.
     *
     * SBOM files are read from CYPRESS_FLIGHTCTL_TESTDATA_PATH env var, or from
     * the default path relative to the flightctl repo checkout on the CI host.
     *
     * Returns { seeded: true } on success, { seeded: false, reason: string } when
     * the URL cannot be found (non-fatal — caller decides whether to skip the suite).
     * Throws on upload errors so test failures surface clearly.
     */
    async seedTrustifySBOMs() {
      const trustifyUrl = getTrustifyUrl()
      if (!trustifyUrl) {
        console.log('[seedTrustifySBOMs] Cannot determine Trustify URL — skipping SBOM seed')
        return { seeded: false, reason: 'Trustify URL not found' }
      }
      console.log(`[seedTrustifySBOMs] Trustify URL: ${trustifyUrl}`)

      const candidates = process.env.CYPRESS_FLIGHTCTL_TESTDATA_PATH
        ? [process.env.CYPRESS_FLIGHTCTL_TESTDATA_PATH]
        : [
          path.join(os.homedir(), 'flightctl', 'test', 'e2e', 'vulnerability', 'testdata'),
          path.join(os.homedir(), 'repos', 'flightctl', 'test', 'e2e', 'vulnerability', 'testdata'),
          path.join('/home', 'jenkins', 'flightctl', 'test', 'e2e', 'vulnerability', 'testdata'),
        ]
      const testdataPath = candidates.find((p) => fs.existsSync(p)) || candidates[0]

      if (!fs.existsSync(testdataPath)) {
        console.log(`[seedTrustifySBOMs] Testdata path not found: ${testdataPath} — skipping`)
        return { seeded: false, reason: `Testdata not found at ${testdataPath}` }
      }

      const http = require('http')
      const https = require('https')

      const upload = (urlStr, filePath, contentType = 'application/json') => new Promise((resolve, reject) => {
        const data = fs.readFileSync(filePath)
        const parsed = new URL(urlStr)
        const lib = parsed.protocol === 'https:' ? https : http
        const options = {
          hostname: parsed.hostname,
          port: parseInt(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'), 10),
          path: parsed.pathname + (parsed.search || ''),
          method: 'POST',
          rejectUnauthorized: false,
          headers: {
            'Content-Type': contentType,
            'Content-Length': data.length,
          },
        }
        const req = lib.request(options, (res) => {
          let body = ''
          res.on('data', (c) => { body += c })
          res.on('end', () => {
            if (res.statusCode === 201 || res.statusCode === 409) {
              // 201 = created, 409 = conflict (already exists) — both are OK
              resolve({ statusCode: res.statusCode })
            } else {
              reject(new Error(`POST ${urlStr} → HTTP ${res.statusCode}: ${body.slice(0, 200)}`))
            }
          })
        })
        req.on('error', reject)
        req.write(data)
        req.end()
      })

      const sboms = [
        { file: 'sbom-digest-a.json', digest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        { file: 'sbom-digest-b.json', digest: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
        { file: 'sbom-digest-c.json', digest: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' },
      ]

      for (const s of sboms) {
        const filePath = path.join(testdataPath, s.file)
        if (!fs.existsSync(filePath)) {
          console.log(`[seedTrustifySBOMs] SBOM file not found, skipping: ${filePath}`)
          continue
        }
        const url = `${trustifyUrl}/api/v2/sbom?labels=sha256~${s.digest}`
        console.log(`[seedTrustifySBOMs] Uploading ${s.file} → ${url}`)
        const result = await upload(url, filePath)
        console.log(`[seedTrustifySBOMs] ${s.file} → HTTP ${result.statusCode}`)
      }

      // Upload advisories (each .json file in testdata/advisories/)
      const advisoriesDir = path.join(testdataPath, 'advisories')
      if (fs.existsSync(advisoriesDir)) {
        const advisoryFiles = fs.readdirSync(advisoriesDir).filter((f) => f.endsWith('.json'))
        for (const f of advisoryFiles) {
          const filePath = path.join(advisoriesDir, f)
          const url = `${trustifyUrl}/api/v2/advisory`
          console.log(`[seedTrustifySBOMs] Uploading advisory ${f} → ${url}`)
          try {
            const result = await upload(url, filePath)
            console.log(`[seedTrustifySBOMs] advisory ${f} → HTTP ${result.statusCode}`)
          } catch (e) {
            console.log(`[seedTrustifySBOMs] advisory ${f} upload failed (non-fatal): ${e.message}`)
          }
        }
      } else {
        console.log(`[seedTrustifySBOMs] No advisories directory at ${advisoriesDir}, skipping`)
      }

      console.log('[seedTrustifySBOMs] SBOM seed complete')
      return { seeded: true }
    },

    flightctlConsoleCommand({ commands, deviceAlias }) {
      const bin = getFlightctlBin()
      const deviceName = getDeviceName(bin, deviceAlias)
      if (!deviceName) {
        const hint = deviceAlias ? ` alias=${deviceAlias}` : ''
        return [{ cmd: 'get devices', stdout: '', error: `No enrolled device found${hint} (using ${bin})` }]
      }

      const results = []
      for (const cmd of commands) {
        try {
          const stdout = execSync(
            `${bin} console dev/${deviceName} --notty -- ${cmd}`,
            { encoding: 'utf-8', timeout: 15000 }
          )
          results.push({ cmd, stdout: stdout.trim(), error: null })
        } catch (err) {
          results.push({ cmd, stdout: err.stdout || '', error: err.message })
        }
      }
      return results
    },
  })
}

module.exports = { registerFlightctlConsoleTasks }
