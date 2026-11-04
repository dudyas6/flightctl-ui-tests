const { runFlightctl } = require('./flightctlConsoleTasks')

const apply = (resource) => runFlightctl(['apply', '-f', '-'], { input: JSON.stringify(resource) })
const device = (name) => JSON.parse(runFlightctl(['get', 'device', name, '-o', 'json']))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const remove = (kind, name) => {
  try {
    runFlightctl(['delete', kind, name])
  } catch (error) {
    if (!/not found|notfound|404/i.test(`${error.message} ${error.stderr || ''}`)) throw error
  }
}

function registerDynamicSelectorTasks(on) {
  on('task', {
    dynamicSelectorSetup() {
      const id = `${Date.now().toString(36)}-${process.pid}`
      const fixture = {
        device: `selector-device-${id}`,
        scalar: `selector-scalar-${id}`,
        map: `selector-map-${id}`,
        scalarKey: `qe.flightctl.io/architecture-${id}`,
        mapKey: `qe.flightctl.io/map-${id}`,
        operatorKey: `qe.flightctl.io/operator-${id}`,
      }
      const resource = (kind, name, extra) => ({
        apiVersion: 'flightctl.io/v1beta1', kind,
        metadata: { name, ...extra },
      })
      const scope = `metadata.labels["test-id"] == "${id}"`
      try {
        apply(resource('Device', fixture.device, {
          labels: { 'test-id': id, [fixture.operatorKey]: 'static' },
        }))
        apply({ ...resource('LabelSyncMapping', fixture.scalar), spec: {
          resourceType: 'Device', key: fixture.scalarKey,
          expression: `${scope} ? status.systemInfo.architecture : dyn(null)`,
        } })
        apply({ ...resource('LabelSyncMapping', fixture.map), spec: {
          resourceType: 'Device',
          expression: `${scope} ? {"${fixture.mapKey}": status.systemInfo.architecture} : {}`,
        } })
      } catch (error) {
        remove('labelsyncmapping', fixture.scalar)
        remove('labelsyncmapping', fixture.map)
        remove('device', fixture.device)
        throw error
      }
      return fixture
    },

    async dynamicSelectorWaitForLabels({ name, expected = {}, absent = [], timeoutMs = 180000 }) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const labels = device(name).metadata.labels || {}
        if (Object.entries(expected).every(([key, value]) => labels[key] === value) &&
          absent.every((key) => !(key in labels))) return labels
        await sleep(2000)
      }
      throw new Error(`Timed out waiting for labels on ${name}`)
    },

    dynamicSelectorMatches(selector) {
      const list = JSON.parse(runFlightctl(['get', 'devices', '-l', selector, '-o', 'json']))
      return (list.items || []).map((item) => item.metadata.name)
    },

    dynamicSelectorGetFleet(name) {
      return JSON.parse(runFlightctl(['get', 'fleet', name, '-o', 'json']))
    },

    dynamicSelectorDeleteScalar(name) {
      remove('labelsyncmapping', name)
      return null
    },

    dynamicSelectorCleanup(fixture) {
      if (fixture.fleet) remove('fleet', fixture.fleet)
      remove('labelsyncmapping', fixture.scalar)
      remove('labelsyncmapping', fixture.map)
      remove('device', fixture.device)
      return null
    },
  })
}

module.exports = { registerDynamicSelectorTasks }
