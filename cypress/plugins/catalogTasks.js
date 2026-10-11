const fs = require('fs')
const os = require('os')
const path = require('path')
const { runFlightctl } = require('./flightctlConsoleTasks')

const DEFAULT_CATALOG_NAME = 'default'
const CHANNEL = 'stable'
const INITIAL_VERSION = '1.0.0'
const UPDATE_VERSION = '1.1.0'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isNotFound(error) {
  return /not found|notfound|404/i.test(`${error?.message || ''} ${error?.stderr || ''}`)
}

function catalogItemManifest({ catalogName, itemName, displayName, category, type, artifactUri }) {
  return [
    'apiVersion: flightctl.io/v1alpha1',
    'kind: CatalogItem',
    'metadata:',
    `  name: ${itemName}`,
    `  catalog: ${catalogName}`,
    'spec:',
    `  category: ${category}`,
    `  type: ${type}`,
    `  displayName: ${displayName}`,
    '  artifacts:',
    '    - type: container',
    `      uri: ${artifactUri}`,
    '  versions:',
    `    - version: "${INITIAL_VERSION}"`,
    `      channels: [${CHANNEL}]`,
    `      references: {container: "${INITIAL_VERSION}"}`,
    `    - version: "${UPDATE_VERSION}"`,
    `      channels: [${CHANNEL}]`,
    `      references: {container: "${UPDATE_VERSION}"}`,
    `      replaces: "${INITIAL_VERSION}"`,
    '',
  ].join('\n')
}

async function waitForCatalogItem(catalogName, itemName, timeoutMs = 60000, pollMs = 2000) {
  const deadline = Date.now() + timeoutMs
  let lastError

  while (Date.now() < deadline) {
    try {
      const output = runFlightctl(['get', 'catalogitems', itemName, '--catalog', catalogName, '-o', 'json'])
      const item = JSON.parse(output)
      if (item.metadata?.name === itemName && item.metadata?.catalog === catalogName) return item
      lastError = new Error(`Catalog item ${catalogName}/${itemName} was returned without matching metadata`)
    } catch (error) {
      lastError = error
    }

    if (Date.now() + pollMs < deadline) await sleep(pollMs)
  }

  throw new Error(
    `Timed out waiting for catalog item ${catalogName}/${itemName}: ${lastError?.message || 'unknown error'}`,
  )
}

async function waitForResourceGone(kind, name, extraArgs = [], timeoutMs = 60000, pollMs = 2000) {
  const deadline = Date.now() + timeoutMs
  let lastError

  while (Date.now() < deadline) {
    try {
      runFlightctl(['get', kind, name, ...extraArgs, '-o', 'json'])
      lastError = new Error(`${kind}/${name} still exists`)
    } catch (error) {
      if (isNotFound(error)) return
      lastError = error
    }

    if (Date.now() + pollMs < deadline) await sleep(pollMs)
  }

  throw new Error(`Timed out waiting for ${kind}/${name} deletion: ${lastError?.message || 'unknown error'}`)
}

function deleteCatalogItem(catalogName, itemName) {
  try {
    runFlightctl(['delete', 'catalogitems', itemName, '--catalog', catalogName])
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
}

async function cleanupCatalogItems(catalogName, itemNames) {
  for (const itemName of itemNames) {
    deleteCatalogItem(catalogName, itemName)
    await waitForResourceGone('catalogitems', itemName, ['--catalog', catalogName])
  }
}

function fixtureNames() {
  const suffix = `${Date.now().toString(36)}-${process.pid}`
  return {
    fleetName: `catalog-inheritance-fleet-${suffix}`,
    editFleetName: `catalog-inheritance-edit-fleet-${suffix}`,
    osItemName: `catalog-inheritance-os-${suffix}`,
    appItemName: `catalog-inheritance-app-${suffix}`,
  }
}

async function catalogInheritanceSetup({ catalogName = DEFAULT_CATALOG_NAME } = {}) {
  const names = fixtureNames()
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flightctl-edm5295-'))
  const osDisplayName = names.osItemName
  const appDisplayName = names.appItemName

  const manifests = [
    catalogItemManifest({
      catalogName,
      itemName: names.osItemName,
      displayName: osDisplayName,
      category: 'system',
      type: 'os',
      artifactUri: 'quay.io/sdelacru/flightctl-centos',
    }),
    catalogItemManifest({
      catalogName,
      itemName: names.appItemName,
      displayName: appDisplayName,
      category: 'application',
      type: 'container',
      artifactUri: 'quay.io/sdelacru/flightctl-centos',
    }),
  ]

  try {
    manifests.forEach((manifest, index) => {
      const manifestPath = path.join(tempDir, `catalog-item-${index}.yaml`)
      fs.writeFileSync(manifestPath, manifest)
      runFlightctl(['apply', '-f', manifestPath])
    })
    await waitForCatalogItem(catalogName, names.osItemName)
    await waitForCatalogItem(catalogName, names.appItemName)
    return { catalogName, ...names, initialVersion: INITIAL_VERSION, updateVersion: UPDATE_VERSION, channel: CHANNEL }
  } catch (error) {
    await cleanupCatalogItems(catalogName, [names.osItemName, names.appItemName]).catch(() => {})
    throw new Error(`Failed to create EDM-5295 catalog fixtures: ${error.message}`)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function catalogInheritanceCleanup({
  catalogName = DEFAULT_CATALOG_NAME,
  fleetName,
  editFleetName,
  osItemName,
  appItemName,
} = {}) {
  let cleanupError
  const fleetNames = [fleetName, editFleetName].filter(Boolean)

  for (const fleetToDelete of fleetNames) {
    try {
      runFlightctl(['delete', 'fleet', fleetToDelete])
    } catch (error) {
      if (!isNotFound(error)) cleanupError ||= error
      continue
    }
    try {
      await waitForResourceGone('fleet', fleetToDelete)
    } catch (error) {
      cleanupError ||= error
    }
  }

  try {
    await cleanupCatalogItems(catalogName, [osItemName, appItemName].filter(Boolean))
  } catch (error) {
    cleanupError ||= error
  }

  if (cleanupError) throw cleanupError
  return { cleaned: true, catalogName, fleetName, editFleetName, osItemName, appItemName }
}

function registerCatalogTasks(on) {
  on('task', {
    catalogInheritanceSetup,
    catalogInheritanceCleanup,
  })
}

module.exports = { registerCatalogTasks }
