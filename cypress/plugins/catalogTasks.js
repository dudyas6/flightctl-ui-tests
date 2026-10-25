const fs = require('fs')
const os = require('os')
const path = require('path')
const { runFlightctl } = require('./flightctlConsoleTasks')

const DEFAULT_CATALOG_NAME = 'default'
const CHANNEL = 'stable'
const INITIAL_VERSION = '1.0.0'
const UPDATE_VERSION = '1.1.0'
const GRAPH_INITIAL_VERSION = '2.0.0'
const GRAPH_REACHABLE_VERSION = '2.1.0'
const GRAPH_LATEST_VERSION = '2.2.0'
const GRAPH_UNREACHABLE_VERSION = '9.0.0'
const CONFIG_VERSION = '3.0.0'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isNotFound(error) {
  return /not found|notfound|404/i.test(`${error?.message || ''} ${error?.stderr || ''}`)
}

function catalogItemManifest({
  catalogName,
  itemName,
  displayName,
  category,
  type,
  artifactUri,
  artifactType = 'container',
  versions = [
    { version: INITIAL_VERSION, reference: INITIAL_VERSION, channels: [CHANNEL] },
    { version: UPDATE_VERSION, reference: UPDATE_VERSION, channels: [CHANNEL], replaces: INITIAL_VERSION },
  ],
}) {
  const versionLines = versions.flatMap((version) => [
    `    - version: "${version.version}"`,
    `      channels: [${(version.channels || [CHANNEL]).join(', ')}]`,
    `      references: {${artifactType}: "${version.reference || version.version}"}`,
    ...(version.replaces ? [`      replaces: "${version.replaces}"`] : []),
    ...(version.skips ? [`      skips: [${version.skips.map((skip) => `"${skip}"`).join(', ')}]`] : []),
    ...(version.skipRange ? [`      skipRange: "${version.skipRange}"`] : []),
    ...(version.config ? [`      config: ${JSON.stringify(version.config)}`] : []),
    ...(version.configSchema ? [`      configSchema: ${JSON.stringify(version.configSchema)}`] : []),
  ])

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
    `    - type: ${artifactType}`,
    `      uri: ${artifactUri}`,
    '  versions:',
    ...versionLines,
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
    graphFleetName: `catalog-inheritance-graph-fleet-${suffix}`,
    unreachableFleetName: `catalog-inheritance-unreachable-fleet-${suffix}`,
    configFleetName: `catalog-inheritance-config-fleet-${suffix}`,
    requiredFleetName: `catalog-inheritance-required-fleet-${suffix}`,
    noSchemaFleetName: `catalog-inheritance-no-schema-fleet-${suffix}`,
    manualFleetName: `catalog-inheritance-manual-fleet-${suffix}`,
    osItemName: `catalog-inheritance-os-${suffix}`,
    appItemName: `catalog-inheritance-app-${suffix}`,
    graphAppItemName: `catalog-inheritance-graph-app-${suffix}`,
    unreachableAppItemName: `catalog-inheritance-unreachable-app-${suffix}`,
    schemaAppItemName: `catalog-inheritance-schema-app-${suffix}`,
    requiredAppItemName: `catalog-inheritance-required-app-${suffix}`,
    noSchemaAppItemName: `catalog-inheritance-no-schema-app-${suffix}`,
    vmCandidateItemName: `catalog-inheritance-vm-candidate-${suffix}`,
  }
}

async function catalogInheritanceSetup({
  catalogName = DEFAULT_CATALOG_NAME,
  includeAdvancedFixtures = true,
} = {}) {
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
    ...(includeAdvancedFixtures ? [
      catalogItemManifest({
        catalogName,
        itemName: names.graphAppItemName,
        displayName: names.graphAppItemName,
        category: 'application',
        type: 'container',
        artifactUri: 'quay.io/sdelacru/flightctl-centos',
        versions: [
          { version: GRAPH_INITIAL_VERSION, reference: GRAPH_INITIAL_VERSION, channels: [CHANNEL] },
          {
            version: GRAPH_REACHABLE_VERSION,
            reference: GRAPH_REACHABLE_VERSION,
            channels: [CHANNEL],
            replaces: GRAPH_INITIAL_VERSION,
          },
          {
            version: GRAPH_LATEST_VERSION,
            reference: GRAPH_LATEST_VERSION,
            channels: [CHANNEL],
            replaces: GRAPH_REACHABLE_VERSION,
          },
          { version: GRAPH_UNREACHABLE_VERSION, reference: GRAPH_UNREACHABLE_VERSION, channels: [CHANNEL] },
        ],
      }),
      catalogItemManifest({
        catalogName,
        itemName: names.unreachableAppItemName,
        displayName: names.unreachableAppItemName,
        category: 'application',
        type: 'container',
        artifactUri: 'quay.io/sdelacru/flightctl-centos',
        versions: [
          { version: GRAPH_INITIAL_VERSION, reference: GRAPH_INITIAL_VERSION, channels: [CHANNEL] },
          { version: GRAPH_UNREACHABLE_VERSION, reference: GRAPH_UNREACHABLE_VERSION, channels: [CHANNEL] },
        ],
      }),
      catalogItemManifest({
        catalogName,
        itemName: names.schemaAppItemName,
        displayName: names.schemaAppItemName,
        category: 'application',
        type: 'container',
        artifactUri: 'quay.io/sdelacru/flightctl-centos',
        versions: [{
          version: CONFIG_VERSION,
          reference: CONFIG_VERSION,
          channels: [CHANNEL],
          config: { envVars: { LOG_LEVEL: 'info' } },
          configSchema: {
            type: 'object',
            properties: {
              envVars: {
                type: 'object',
                properties: { LOG_LEVEL: { type: 'string', default: 'info' } },
                required: ['LOG_LEVEL'],
              },
            },
          },
        }],
      }),
      catalogItemManifest({
        catalogName,
        itemName: names.requiredAppItemName,
        displayName: names.requiredAppItemName,
        category: 'application',
        type: 'container',
        artifactUri: 'quay.io/sdelacru/flightctl-centos',
        versions: [{
          version: CONFIG_VERSION,
          reference: CONFIG_VERSION,
          channels: [CHANNEL],
          configSchema: {
            type: 'object',
            properties: {
              envVars: {
                type: 'object',
                properties: { REQUIRED_VALUE: { type: 'string', minLength: 1 } },
                required: ['REQUIRED_VALUE'],
              },
            },
          },
        }],
      }),
      catalogItemManifest({
        catalogName,
        itemName: names.noSchemaAppItemName,
        displayName: names.noSchemaAppItemName,
        category: 'application',
        type: 'container',
        artifactUri: 'quay.io/sdelacru/flightctl-centos',
        versions: [{ version: CONFIG_VERSION, reference: CONFIG_VERSION, channels: [CHANNEL] }],
      }),
      catalogItemManifest({
        catalogName,
        itemName: names.vmCandidateItemName,
        displayName: names.vmCandidateItemName,
        category: 'application',
        type: 'container',
        artifactType: 'qcow2',
        artifactUri: 'quay.io/sdelacru/flightctl-vm-disk',
      }),
    ] : []),
  ]

  const itemNames = manifests.map((manifest) => manifest.match(/metadata:\n  name: ([^\n]+)/)[1])

  try {
    manifests.forEach((manifest, index) => {
      const manifestPath = path.join(tempDir, `catalog-item-${index}.yaml`)
      fs.writeFileSync(manifestPath, manifest)
      runFlightctl(['apply', '-f', manifestPath])
    })
    for (const itemName of itemNames) await waitForCatalogItem(catalogName, itemName)
    return {
      catalogName,
      ...names,
      catalogItemNames: itemNames,
      initialVersion: INITIAL_VERSION,
      updateVersion: UPDATE_VERSION,
      graphInitialVersion: GRAPH_INITIAL_VERSION,
      graphReachableVersion: GRAPH_REACHABLE_VERSION,
      graphLatestVersion: GRAPH_LATEST_VERSION,
      graphUnreachableVersion: GRAPH_UNREACHABLE_VERSION,
      configVersion: CONFIG_VERSION,
      channel: CHANNEL,
    }
  } catch (error) {
    await cleanupCatalogItems(catalogName, itemNames).catch(() => {})
    throw new Error(`Failed to create EDM-6153 catalog fixtures: ${error.message}`)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function catalogInheritanceCleanup({
  catalogName = DEFAULT_CATALOG_NAME,
  fleetName,
  editFleetName,
  graphFleetName,
  unreachableFleetName,
  configFleetName,
  requiredFleetName,
  noSchemaFleetName,
  manualFleetName,
  osItemName,
  appItemName,
  catalogItemNames,
} = {}) {
  let cleanupError
  const fleetNames = [
    fleetName,
    editFleetName,
    graphFleetName,
    unreachableFleetName,
    configFleetName,
    requiredFleetName,
    noSchemaFleetName,
    manualFleetName,
  ].filter(Boolean)

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
    await cleanupCatalogItems(
      catalogName,
      (catalogItemNames || [osItemName, appItemName]).filter(Boolean),
    )
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
