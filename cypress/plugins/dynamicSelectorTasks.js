const { runFlightctl } = require('./flightctlConsoleTasks')

const API_VERSION = 'flightctl.io/v1beta1'
const TEST_ID_LABEL = 'test-id'
const DEFAULT_WAIT_TIMEOUT_MS = 180000
const WAIT_INTERVAL_MS = 2000
const NOT_FOUND_PATTERN = /not found|notfound|404/i

/** Registers Cypress tasks that create, inspect, and remove dynamic-selector fixtures. */
function registerDynamicSelectorTasks(on) {
  if (!on || typeof on !== 'function') {
    throw new TypeError('registerDynamicSelectorTasks requires the Cypress on callback')
  }

  on('task', {
    dynamicSelectorSetup,
    dynamicSelectorWaitForLabels,
    dynamicSelectorMatches,
    dynamicSelectorGetFleet,
    dynamicSelectorDeleteScalar,
    dynamicSelectorCleanup,
  })
}

/** Creates a device and two scoped label mappings, cleaning partial resources on failure. */
function dynamicSelectorSetup() {
  const id = `${Date.now().toString(36)}-${process.pid}`
  const fixture = {
    device: `selector-device-${id}`,
    scalar: `selector-scalar-${id}`,
    map: `selector-map-${id}`,
    fleets: [],
    scalarKey: `qe.flightctl.io/architecture-${id}`,
    mapKey: `qe.flightctl.io/map-${id}`,
    operatorKey: `qe.flightctl.io/operator-${id}`,
  }
  const scope = `metadata.labels[${JSON.stringify(TEST_ID_LABEL)}] == ${JSON.stringify(id)}`

  console.log(`[dynamicSelectorSetup] creating fixture ${id}`)
  try {
    applyResource(resource('Device', fixture.device, {
      labels: { [TEST_ID_LABEL]: id, [fixture.operatorKey]: 'static' },
    }))
    applyResource({
      ...resource('LabelSyncMapping', fixture.scalar),
      spec: {
        resourceType: 'Device',
        key: fixture.scalarKey,
        expression: `${scope} ? status.systemInfo.architecture : dyn(null)`,
      },
    })
    applyResource({
      ...resource('LabelSyncMapping', fixture.map),
      spec: {
        resourceType: 'Device',
        expression: `${scope} ? {"${fixture.mapKey}": status.systemInfo.architecture} : {}`,
      },
    })
  } catch (error) {
    try {
      cleanupFixture(fixture)
    } catch (cleanupError) {
      console.error(`[dynamicSelectorSetup] partial cleanup failed: ${errorMessage(cleanupError)}`)
    }
    throw error
  }

  return fixture
}

/** Polls a device until expected labels exist and absent labels have been removed. */
async function dynamicSelectorWaitForLabels(args) {
  const { name, expected = {}, absent = [], timeoutMs = DEFAULT_WAIT_TIMEOUT_MS } = args || {}
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('dynamicSelectorWaitForLabels requires a device name')
  }
  if (!isStringMap(expected)) {
    throw new TypeError('dynamicSelectorWaitForLabels expected must be a string map')
  }
  if (!Array.isArray(absent) || absent.some((key) => typeof key !== 'string' || key === '')) {
    throw new TypeError('dynamicSelectorWaitForLabels absent must be an array of label keys')
  }
  if (Object.keys(expected).length === 0 && absent.length === 0) {
    throw new TypeError('dynamicSelectorWaitForLabels requires an expected or absent label')
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('dynamicSelectorWaitForLabels timeoutMs must be a positive number')
  }

  const deadline = Date.now() + timeoutMs
  let lastLabels = {}
  let lastError
  console.log(`[dynamicSelectorWaitForLabels] waiting for labels on ${name}`)
  while (Date.now() < deadline) {
    try {
      lastLabels = getDevice(name).metadata.labels || {}
      const expectedFound = Object.entries(expected).every(([key, value]) => lastLabels[key] === value)
      const absentRemoved = absent.every((key) => !Object.prototype.hasOwnProperty.call(lastLabels, key))
      if (expectedFound && absentRemoved) return lastLabels
      lastError = undefined
    } catch (error) {
      lastError = error
    }
    await sleep(WAIT_INTERVAL_MS)
  }

  const details = `last labels: ${JSON.stringify(lastLabels)}`
  const errorDetails = lastError ? `; last error: ${errorMessage(lastError)}` : ''
  throw new Error(`Timed out waiting for labels on ${name}; ${details}${errorDetails}`)
}

/** Returns the device names matching a non-empty FlightCtl label selector. */
function dynamicSelectorMatches(selector) {
  if (typeof selector !== 'string' || selector.trim() === '') {
    throw new TypeError('dynamicSelectorMatches requires a non-empty label selector')
  }
  const output = runFlightctl(['get', 'devices', '-l', selector, '-o', 'json'])
  const list = parseJson(output, 'device list')
  if (!list || !Array.isArray(list.items)) {
    throw new Error('dynamicSelectorMatches received a device list without an items array')
  }
  return list.items.map((item) => {
    const name = item && item.metadata && item.metadata.name
    if (typeof name !== 'string' || name === '') {
      throw new Error('dynamicSelectorMatches found a device without metadata.name')
    }
    return name
  })
}

/** Fetches a Fleet resource and checks that its selector is present. */
function dynamicSelectorGetFleet(name) {
  requireName(name, 'Fleet name')
  const fleet = parseJson(runFlightctl(['get', 'fleet', name, '-o', 'json']), `Fleet ${name}`)
  if (!fleet || !fleet.spec || !fleet.spec.selector) {
    throw new Error(`Fleet ${name} has no spec.selector`)
  }
  return fleet
}

/** Deletes one scalar mapping, treating an already-removed mapping as success. */
function dynamicSelectorDeleteScalar(name) {
  removeResource('labelsyncmapping', name)
  return null
}

/** Removes the fixture's optional Fleet, mappings, and device. */
function dynamicSelectorCleanup(fixture) {
  if (!fixture) {
    console.log('[dynamicSelectorCleanup] no fixture to clean')
    return null
  }
  cleanupFixture(fixture)
  return null
}

/** Builds a Kubernetes-style FlightCtl resource envelope. */
function resource(kind, name, extra = {}) {
  requireName(kind, 'resource kind')
  requireName(name, 'resource name')
  return { apiVersion: API_VERSION, kind, metadata: { name, ...extra } }
}

/** Applies one resource using the existing shared FlightCtl CLI runner. */
function applyResource(value) {
  if (!value || typeof value !== 'object' || !value.metadata || typeof value.metadata !== 'object') {
    throw new TypeError('applyResource requires a resource with kind and metadata.name')
  }
  requireName(value.kind, 'resource kind')
  requireName(value.metadata.name, 'resource name')
  console.log(`[dynamicSelector] applying ${value.kind}/${value.metadata.name}`)
  runFlightctl(['apply', '-f', '-'], { input: JSON.stringify(value) })
}

/** Reads and validates one device JSON resource. */
function getDevice(name) {
  requireName(name, 'device name')
  const device = parseJson(runFlightctl(['get', 'device', name, '-o', 'json']), `device ${name}`)
  if (!device || !device.metadata || typeof device.metadata !== 'object') {
    throw new Error(`Device ${name} has no metadata object`)
  }
  return device
}

/** Deletes a named resource, ignoring only an explicit not-found response. */
function removeResource(kind, name) {
  requireName(kind, 'resource kind')
  requireName(name, 'resource name')
  console.log(`[dynamicSelector] deleting ${kind}/${name}`)
  try {
    runFlightctl(['delete', kind, name])
  } catch (error) {
    const message = errorMessage(error)
    if (NOT_FOUND_PATTERN.test(`${message} ${error && error.stderr ? error.stderr : ''}`)) return
    console.error(`[dynamicSelector] failed to delete ${kind}/${name}: ${message}`)
    throw error
  }
}

/** Cleans fixture resources in dependency order and reports all failed deletions. */
function cleanupFixture(fixture) {
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
    throw new TypeError('cleanupFixture requires a fixture object')
  }
  for (const key of ['device', 'scalar', 'map']) {
    requireName(fixture[key], `fixture ${key} name`)
  }
  const fleets = Array.isArray(fixture.fleets) ? fixture.fleets : []
  if (fleets.some((name) => typeof name !== 'string' || name.trim() === '')) {
    throw new TypeError('cleanupFixture received an invalid Fleet name')
  }
  const fleetNames = [...new Set([...(fixture.fleet ? [fixture.fleet] : []), ...fleets])]
  const resources = [
    ...fleetNames.map((name) => ['fleet', name]),
    fixture.scalar && ['labelsyncmapping', fixture.scalar],
    fixture.map && ['labelsyncmapping', fixture.map],
    fixture.device && ['device', fixture.device],
  ].filter(Boolean)
  const errors = []
  resources.forEach(([kind, name]) => {
    try {
      removeResource(kind, name)
    } catch (error) {
      errors.push(`${kind}/${name}: ${errorMessage(error)}`)
    }
  })
  if (errors.length > 0) throw new Error(`Fixture cleanup failed: ${errors.join('; ')}`)
}

/** Parses CLI JSON output and adds the resource context to parse errors. */
function parseJson(output, description) {
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new Error(`Unable to parse ${description} JSON: ${error.message}`)
  }
}

/** Validates that a resource name or kind is a non-empty string. */
function requireName(value, description) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${description} must be a non-empty string`)
  }
}

/** Checks that an expected label value map contains only string keys and values. */
function isStringMap(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([key, item]) => key !== '' && typeof item === 'string')
}

/** Delays between CLI polls without blocking Node's event loop. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Converts thrown values to readable messages for logs and task errors. */
function errorMessage(error) {
  return error && typeof error.message === 'string' ? error.message : String(error)
}

module.exports = { registerDynamicSelectorTasks }
