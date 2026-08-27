import { common } from './common'

/** Default table row index for flows that assume a single primary device row */
const ROW_0 = 0

/** Alias validation: red error icon color when invalid */
const VALIDATION_ERROR_ICON_COLOR = '#b1380b'

/** Event message substrings for deviceEvents(): Warning filter vs All types */
const DEVICE_EVENTS_WARNING_ONLY = ['Device update failed']
const DEVICE_EVENTS_NORMAL = [
  'Device returned to being up-to-date',
  'Device is updating',
  'Device was created successfully',
]

/** Events list body on device details — Events tab */
const EVENTS_CONTAINER = '[data-testid="device-events-list"]'

/** Device details → Applications table (standalone UI expandable VM/apps table) */
const DEVICE_APPLICATIONS_TABLE = '#fctl-applications-table'

/** Device details → Terminal tab → VM serial console (Open console) */
const APP_CONSOLE_TERMINAL = '[data-testid="app-console-terminal"]'
const APP_CONSOLE_ERROR = '[data-testid="app-console-connect-error"]'
const APP_CONSOLE_XTERM_ROWS = `${APP_CONSOLE_TERMINAL} .xterm-rows`
const APP_CONSOLE_XTERM_INPUT = `${APP_CONSOLE_TERMINAL} .xterm-helper-textarea`

/** RichValidationTextField validation button for approve modal alias */
const DEVICE_ALIAS_VALIDATION_BTN = '[data-testid="rich-validation-field-deviceAlias-validation-button"]'

/** Devices scale demo: label applied by devicesimulator (`--label fleet=scale-fleet-00`) */
export const SCALE_FLEET_LABEL_TEXT = 'fleet=scale-fleet-00'

/** Fleet resource name matched by the scale-demo label selector */
export const SCALE_FLEET_NAME = 'scale-fleet-00'

/** First simulator device when `--initial-device-index=0` (second device: device-00001) */
export const SCALE_DEMO_DEVICE_NAME = 'device-00001'

/**
 * Fleet device-selector labels (Fleet details → Device selector). Removing this label on a device
 * disconnects it from that fleet; re-adding re-attaches.
 */
export const SIMULATOR_DISK_MONITORING_SELECTOR_LABEL = 'created_by=device-simulator'

const FLEET_DEVICE_SELECTOR_LABELS = {
  [SCALE_FLEET_NAME]: SCALE_FLEET_LABEL_TEXT,
  'simulator-disk-monitoring': SIMULATOR_DISK_MONITORING_SELECTOR_LABEL,
}

/** Real `<input>` inside PatternFly TextInputGroup (`#typeahead-select-input` is the wrapper div). */
const FLEET_LABEL_TYPEAHEAD_INPUT = '#typeahead-select-input input'

/**
 * Syslog priority levels mapped to their UI dropdown labels.
 * Ordered by severity (highest first) — used for priority inclusivity tests:
 * filtering at index N should show markers for all priorities 0..N.
 */
export const LOG_PRIORITIES = [
  { key: 'emerg',   level: 'Only emergency' },
  { key: 'alert',   level: 'Alert and above' },
  { key: 'crit',    level: 'Critical and above' },
  { key: 'err',     level: 'Error and above' },
  { key: 'warning', level: 'Warning and above' },
  { key: 'notice',  level: 'Notice and above' },
  { key: 'info',    level: 'Info and above' },
  { key: 'debug',   level: 'Debug and above' },
]

const LOGS_TAB = '[data-testid="device-details-tab-logs"]'
const LOG_VIEWER = '.pf-v6-c-log-viewer'
const LOG_VIEWER_LINE = '.pf-v6-c-log-viewer__list-item'
const LOG_SEARCH_INPUT = 'input[placeholder="Search logs"]'
const LOG_FILE_PATH_INPUT = 'input[name="logFilePath"]'
const LOG_CATEGORY_TOGGLE = /^(Agent|System|File path)$/
const LOG_TIME_RANGE_TOGGLE = /^(All time|Last 1 hour|Last 24 hours|Last 7 days|Current boot|Previous boot|Custom range)$/
const LOG_LEVEL_TOGGLE = /All levels|and above|Only emergency/
const LOG_RETRIEVE_TIMEOUT = 60000

const VM_APP_DEFAULTS = {
  mode: 'form',
  name: 'test-vm',
  yaml: 'apps/kvm.yaml',
  diskImage: 'quay.io/containerdisks/fedora:40',
  memory: '1024M',
  password: 'fedora',
  hostPort: '2222',
  guestPort: '22',
}

const vmAppFieldId = (index, field) => `textfield-applications[${index}].${field}`
const vmAppSwitchId = (index, field) => `switchfield-applications[${index}].${field}`
const vmAppSelectMenuId = (index, field) => `selectfield-applications[${index}].${field}-menu`

const cdp = (command, params = {}) =>
  Cypress.automation('remote:debugger:protocol', { command, params })

const cdpCtrl = (key, code, vk) => {
  const ctrl = 2
  return cdp('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Control',
    code: 'ControlLeft',
    windowsVirtualKeyCode: 17,
    modifiers: ctrl,
  })
    .then(() =>
      cdp('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        windowsVirtualKeyCode: vk,
        modifiers: ctrl,
      }),
    )
    .then(() =>
      cdp('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code,
        windowsVirtualKeyCode: vk,
        modifiers: ctrl,
      }),
    )
    .then(() =>
      cdp('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Control',
        code: 'ControlLeft',
        windowsVirtualKeyCode: 17,
      }),
    )
}

const pasteYamlIntoMonaco = (content) => {
  cy.get('.fctl-yaml-editor .monaco-editor', { timeout: 30000 }).scrollIntoView({ block: 'center' }).click({ force: true })
  cy.get('.fctl-yaml-editor textarea').click({ force: true })
  cy.window().then((win) => {
    win.focus()
    return cdp('Page.bringToFront')
      .catch(() => undefined)
      .then(() =>
        cdp('Browser.grantPermissions', {
          permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
          origin: win.location.origin,
        }),
      )
      .catch(() => undefined)
      .then(() => win.navigator.clipboard.writeText(content))
  })
  cy.then(() => cdpCtrl('a', 'KeyA', 65))
  cy.then(() => cdpCtrl('v', 'KeyV', 86))
  cy.get('.fctl-yaml-editor .view-lines').invoke('text').should('not.be.empty')
}

const addVmApplication = (index, app = {}) => {
  const vmApp = { ...VM_APP_DEFAULTS, ...app }
  const fieldId = (field) => vmAppFieldId(index, field)
  const typeMenu = `[id="${vmAppSelectMenuId(index, 'appType')}"]`

  cy.get('body').then(($body) => {
    if ($body.find(typeMenu).length === 0) {
      cy.contains('button', 'Add application').scrollIntoView().click({ force: true })
    }
  })
  cy.get(typeMenu, { timeout: 15000 }).scrollIntoView({ block: 'center' }).click({ force: true })
  cy.contains('[role="option"]', 'Virtual machine (KVM)').click()
  cy.get(`[id="${fieldId('name')}"]`).scrollIntoView({ block: 'center' }).clear({ force: true }).type(vmApp.name, { force: true })

  if (vmApp.mode === 'yaml') {
    cy.get(`[id="applications[${index}]-yaml-mode"]`).click({ force: true })
    cy.readFile(vmApp.yaml).then((yaml) => {
      const content = yaml.replace(/(metadata:\s*\n\s*name:\s*).+/, `$1${vmApp.name}`)
      pasteYamlIntoMonaco(content)
    })
  } else {
    cy.get(`[id="${fieldId('diskImage')}"]`).clear({ force: true }).type(vmApp.diskImage, { force: true })
    cy.get(`[id="${fieldId('memory')}"]`).clear({ force: true }).type(vmApp.memory, { force: true })
    cy.get(`[id="${vmAppSwitchId(index, 'enablePassword')}"]`).click({ force: true })
    cy.get(`[id="${fieldId('password')}"]`).clear({ force: true }).type(vmApp.password, { force: true, log: false })
  }

  if (vmApp.hostPort && vmApp.guestPort) {
    const appSectionAnchor =
      vmApp.mode === 'yaml'
        ? `[id="applications[${index}]-yaml-mode"]`
        : `[id="${fieldId('name')}"]`
    cy.get(appSectionAnchor)
      .closest('.pf-v6-c-expandable-section, .pf-c-expandable-section')
      .scrollIntoView({ block: 'center' })
      .within(() => {
        cy.contains('Map ports from inside the VM to the host device')
          .closest('.pf-v6-c-form__group, .pf-c-form__group')
          .within(() => {
            cy.get('input').eq(0).clear({ force: true }).type(vmApp.hostPort, { force: true })
            cy.get('input[aria-label="VM port"]').clear({ force: true }).type(vmApp.guestPort, { force: true })
            cy.contains('button', /^Add$/).should('not.be.disabled').click({ force: true })
          })
        cy.contains(`${vmApp.hostPort}:${vmApp.guestPort}/tcp`).should('exist')
      })
  }
}

const enrolledDeviceRows = () =>
  cy.get('[data-testid="enrolled-devices-table"] tbody tr[data-testid^="enrolled-device-row-"]')

/** Enrolled table can sit below "Devices pending approval"; scroll it into view before row/link queries. */
const scrollEnrolledDevicesTableIntoView = () => {
  cy.get('[data-testid="enrolled-devices-table"]', { timeout: 60000 }).should('exist')
  cy.get('[data-testid="enrolled-devices-table"]').scrollIntoView({ block: 'start' })
}

/**
 * Closest ancestor of the enrolled table that also contains this list’s pagination (sibling of the
 * table in the DOM). Safer than `#devices-toolbar`.parent() when the console wraps the toolbar.
 */
const enrolledDevicesListSection = () =>
  cy.get('[data-testid="enrolled-devices-table"]', { timeout: 60000 }).parents().filter((_, el) => {
    return Cypress.$(el).find('button[aria-label="Go to next page"]').length > 0
  }).first()

/** PatternFly disables pagination while `isUpdating`; wait for spinner to leave the devices paginator. */
const waitEnrolledPaginationIdle = () => {
  enrolledDevicesListSection()
    .find('.pf-v6-c-pagination')
    .first()
    .should(($p) => {
      expect($p.find('.pf-v6-c-spinner').length).to.eq(0)
    }, { timeout: 120000 })
}

const enrolledDeviceNameLinkSelector = (deviceRef) =>
  `[data-testid="device-name-link-${deviceRef}"], [data-testid="device-internal-name-link-${deviceRef}"]`

/**
 * Open device details from the enrolled table; paginate when sort order leaves the device off page 1.
 */
const clickEnrolledDeviceNameLinkAcrossPages = (deviceRef, pagesLeft = 8) => {
  const linkSel = enrolledDeviceNameLinkSelector(deviceRef)
  cy.get('[data-testid="enrolled-devices-table"]', { timeout: 120000 }).should('exist')
  cy.get('[data-testid="enrolled-devices-table"]').then(($table) => {
    const $link = $table.find(linkSel).filter(':visible').first()
    if ($link.length) {
      cy.wrap($link).scrollIntoView().click({ force: true })
      return
    }
    if (pagesLeft <= 0) {
      throw new Error(
        `Device "${deviceRef}" not found in enrolled devices table (checked all pages).`,
      )
    }
    enrolledDevicesListSection().within(() => {
      cy.get('button[aria-label="Go to next page"]')
        .first()
        .then(($next) => {
          if ($next.is(':disabled')) {
            throw new Error(
              `Device "${deviceRef}" not found in enrolled devices table (no more pages).`,
            )
          }
          cy.wrap($next).scrollIntoView().click({ force: true })
        })
    })
    waitEnrolledPaginationIdle()
    clickEnrolledDeviceNameLinkAcrossPages(deviceRef, pagesLeft - 1)
  })
}

/** Enrolled-table row by alias. Pure query — keeps Cypress retry chain for long waits/polling. */
const enrolledDeviceRowByAlias = (deviceName, timeout = 60000) =>
  cy.contains('[data-testid="enrolled-devices-table"] tr', deviceName, { timeout })

const enrolledDeviceLinkByAlias = (deviceName, timeout = 60000) => {
  scrollEnrolledDevicesTableIntoView()
  return enrolledDeviceRowByAlias(deviceName, timeout)
    .scrollIntoView({ block: 'center' })
    .find(`[data-testid^="device-name-link-"]`)
}

/**
 * DevicesPage object for device management operations.
 * Prefer data-testid selectors from flightctl-ui for stability.
 */
export const devicesPage = {
  openApproveDeviceModal: () => {
    common.navigateTo('Devices')
    cy.get('[data-testid="list-page-title"]').should('contain', 'Devices pending approval')
    cy.get(`[data-testid="enrollment-request-approve-button-${ROW_0}"]`).should('exist')
    cy.get(`[data-testid="enrollment-request-approve-button-${ROW_0}"]`).should('be.visible')
    cy.get(`[data-testid="enrollment-request-approve-button-${ROW_0}"]`).click()
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').should('be.visible')
  },

  fillAliasInApproveModal: (alias) => {
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').clear()
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').type(alias)
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').should('have.value', alias)
  },

  expectValidationIconError: () => {
    cy.get(DEVICE_ALIAS_VALIDATION_BTN).should('be.visible')
    cy.get(DEVICE_ALIAS_VALIDATION_BTN).find('svg').should('have.attr', 'color', VALIDATION_ERROR_ICON_COLOR)
  },

  closeApproveDeviceModal: () => {
    cy.get('[data-testid="approve-device-form-cancel"]').click()
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').should('not.exist')
  },

  approveDevice: (deviceName = 'test-device') => {
    common.navigateTo('Devices')
    cy.get('[data-testid="list-page-title"]', { timeout: 500000 }).should('contain', 'Devices pending approval')
    cy.contains('.fctl-resource-link__text', new RegExp(`^${deviceName}$`), { timeout: 500000 })
      .scrollIntoView({ block: 'center' })
      .closest('tr')
      .find('[data-testid^="enrollment-request-approve-button-"]')
      .click()
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').should('be.visible')
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').clear()
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').type(deviceName)
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').should('have.value', deviceName)
    cy.get('[data-testid="approve-device-form-submit"]').should('be.visible')
    cy.get('[data-testid="approve-device-form-submit"]').click()
    scrollEnrolledDevicesTableIntoView()
    enrolledDeviceRowByAlias(deviceName, 500000).should('contain', 'Online')
  },

  deviceEvents: (deviceName = 'test-device') => {
    common.navigateTo('Devices')
    cy.wait(1000)
    enrolledDeviceLinkByAlias(deviceName).click()
    cy.wait(1000)
    cy.get('[data-testid="device-details-tab-events"]').should('be.visible').click()
    cy.wait(1000)
    cy.get('[data-testid="events-type-filter-toggle"]').contains('Warning')
    DEVICE_EVENTS_NORMAL.forEach((msg) => {
      cy.get(EVENTS_CONTAINER).should('not.contain', msg)
    })
    DEVICE_EVENTS_WARNING_ONLY.forEach((msg) => {
      cy.get(EVENTS_CONTAINER).should('contain', msg)
    })
    cy.get('[data-testid="events-type-filter-toggle"]').click()
    cy.wait(500)
    cy.get('[data-testid="events-filter-option-normal"]').click()
    DEVICE_EVENTS_NORMAL.forEach((msg) => {
      cy.get(EVENTS_CONTAINER).should('contain', msg)
    })
    DEVICE_EVENTS_WARNING_ONLY.forEach((msg) => {
      cy.get(EVENTS_CONTAINER).should('not.contain', msg)
    })
    cy.get('[data-testid="events-type-filter-toggle"]').click()
    cy.wait(500)
    cy.get('[data-testid="events-filter-option-all-types"]').click()
    const allTypesExpected = [...DEVICE_EVENTS_NORMAL, ...DEVICE_EVENTS_WARNING_ONLY]
    allTypesExpected.forEach((msg) => {
      cy.get(EVENTS_CONTAINER).should('contain', msg)
    })
  },

  editDevice: (image, currentName = 'test-device', newName = 'test-device-edited') => {
    common.navigateTo('Devices')
    scrollEnrolledDevicesTableIntoView()

    enrolledDeviceRowByAlias(currentName)
      .scrollIntoView({ block: 'center' })
      .find(`[data-testid^="device-row-actions-"] .pf-v6-c-menu-toggle`)
      .click()
    cy.wait(1000)
    cy.contains('Edit device configurations').click()
    cy.wait(1000)
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').should('be.visible')
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').should('have.value', currentName)
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').clear()
    cy.get('[data-testid="rich-validation-field-deviceAlias"]').type(newName)
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="textfield-osSpec"]').should('be.visible')
    cy.get('[data-testid="textfield-osSpec"]').clear()
    cy.get('[data-testid="textfield-osSpec"]').type(image)
    cy.get('[data-testid="textfield-osSpec"]').should('have.value', image)
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="wizard-save-button"]').click()
    cy.get('[data-testid="device-details-title"]', { timeout: 50000 }).should('contain', newName)
  },

  checkDeviceOutOfDate: (deviceName = 'test-device-edited2') => {
    common.navigateTo('Devices')
    scrollEnrolledDevicesTableIntoView()

    const intervalMs = 5000
    const totalMs = 120000
    const maxAttempts = Math.floor(totalMs / intervalMs) + 1

    const pollForOutOfDate = (attempt) => {
      if (attempt > 0) {
        cy.wait(intervalMs)
      }
      enrolledDeviceRowByAlias(deviceName)
        .then(($tr) => {
          const found = $tr.find('[data-testid^="device-update-status-"]').text().includes('Out-of-date')
          if (found) {
            cy.wrap($tr)
              .find('[data-testid^="device-update-status-"]')
              .contains('Out-of-date')
              .should('be.visible')
          } else if (attempt + 1 < maxAttempts) {
            pollForOutOfDate(attempt + 1)
          } else {
            throw new Error(
              `Update status did not contain "Out-of-date" within ${totalMs / 1000}s (checked every ${intervalMs / 1000}s)`,
            )
          }
        })
    }
    pollForOutOfDate(0)
  },

  decommissionDevice: (deviceName = 'test-device-edited2') => {
    common.navigateTo('Devices')
    scrollEnrolledDevicesTableIntoView()

    enrolledDeviceRowByAlias(deviceName)
      .scrollIntoView({ block: 'center' })
      .find('input[type="checkbox"]')
      .should('be.visible')
      .click()
    cy.get('[data-testid="toolbar-decommission-devices"]').should('be.visible')
    cy.get('[data-testid="toolbar-decommission-devices"]').click()
    cy.get('[data-testid="modal-decommission-confirm"]').should('be.visible')
    cy.get('[data-testid="modal-decommission-confirm"]').click()
    cy.get('[data-testid="decommissioned-devices-table"]').should('exist')
    cy.get('[data-testid="decommissioned-devices-table"] thead input[type="checkbox"]')
      .scrollIntoView({ block: 'center' })
      .should('be.visible')
      .click()
    cy.get('[data-testid="toolbar-delete-forever"]').should('be.visible')
    cy.get('[data-testid="toolbar-delete-forever"]').click()
    cy.get('[data-testid="modal-delete-devices-confirm"]').should('be.visible')
    cy.get('[data-testid="modal-delete-devices-confirm"]').click()
    cy.get('[data-testid="show-decommissioned-devices-switch"]').closest('label').should('be.visible')
    cy.get('[data-testid="show-decommissioned-devices-switch"]').closest('label').click()
  },

  openTerminal: (deviceName = 'test-device') => {
    common.navigateTo('Devices')

    enrolledDeviceLinkByAlias(deviceName).click()
    cy.get('[data-testid="device-details-tab-terminal"]', { timeout: 30000 }).should('be.visible').click()
    cy.get('[data-testid="device-terminal-panel"]', { timeout: 50000 }).should('be.visible')
    cy.get('[data-testid="device-terminal-panel"]').click()
  },

  openDeviceLogs: (deviceName) => {
    common.navigateTo('Devices')
    if (deviceName) {
      enrolledDeviceLinkByAlias(deviceName, 15000).click()
    } else {
      cy.get(`[data-testid^="device-name-link-"]`, { timeout: 15000 })
        .first()
        .scrollIntoView({ block: 'center' })
        .should('be.visible')
        .click()
    }
    cy.get(LOGS_TAB, { timeout: 15000 }).should('be.visible').click()
    cy.contains('button', 'Retrieve logs', { timeout: 15000 }).should('be.visible')
  },

  retrieveLogsAndVerify: () => {
    cy.contains('button', 'Retrieve logs', { timeout: 15000 })
      .should('be.visible')
      .should('not.be.disabled')
      .click()
    cy.get(LOG_VIEWER, { timeout: LOG_RETRIEVE_TIMEOUT }).should('be.visible')
    cy.get(LOG_VIEWER_LINE, { timeout: LOG_RETRIEVE_TIMEOUT })
      .should('have.length.greaterThan', 0)
  },

  selectLogCategory: (category) => {
    cy.contains('button', LOG_CATEGORY_TOGGLE, { timeout: 15000 })
      .should('be.visible').click()
    cy.get('[role="option"]').contains(category).click()
  },

  selectLogTimeRange: (label) => {
    cy.contains('button', LOG_TIME_RANGE_TOGGLE, { timeout: 15000 })
      .should('be.visible').click()
    cy.get('[role="option"]').contains(label).click()
  },

  selectLogLevel: (label) => {
    cy.contains('button', LOG_LEVEL_TOGGLE, { timeout: 15000 })
      .should('be.visible').click()
    cy.get('[role="option"]').contains(label).click()
  },

  searchLogsFor: (text) => {
    cy.get(LOG_SEARCH_INPUT, { timeout: 10000 }).clear().type(text)
    cy.contains(/[1-9]\d*\s*\/\s*[1-9]\d*/, { timeout: 10000 }).should('be.visible')
  },

  /** Leave decommissioned list and show enrolled devices (same switch data-testid on both tables). */
  ensureEnrolledDevicesView: () => {
    cy.get('body').then(($body) => {
      const onDecommissioned = $body.find('[data-testid="show-decommissioned-devices-switch"][aria-checked="true"]')
        .length
      if (onDecommissioned) {
        cy.get('[data-testid="show-decommissioned-devices-switch"]')
          .filter('[aria-checked="true"]')
          .closest('label')
          .click()
      }
    })
    cy.get('[data-testid="enrolled-devices-table"]', { timeout: 60000 }).should('exist')
    scrollEnrolledDevicesTableIntoView()
  },

  /**
   * Filter enrolled devices by label using the “Labels and fleets” typeahead (must match CLI selector).
   */
  filterByFleetScaleLabel: () => {
    common.navigateTo('Devices')
    devicesPage.ensureEnrolledDevicesView()
    // Toolbar can sit in overflow:auto regions in ACM/console — avoid visibility flake; interact with force after scroll.
    cy.get('#devices-toolbar', { timeout: 30000 }).scrollIntoView()
    cy.get(FLEET_LABEL_TYPEAHEAD_INPUT, { timeout: 30000 }).should('exist').scrollIntoView({ block: 'center' })
    cy.get(FLEET_LABEL_TYPEAHEAD_INPUT).clear({ force: true })
    cy.get(FLEET_LABEL_TYPEAHEAD_INPUT).type(SCALE_FLEET_LABEL_TEXT, { force: true })
    // Label options use `hasCheckbox` in the UI → PatternFly uses role="menuitem", not role="option".
    cy.wait(1200)
    // Match can resolve to more than one node (e.g. hidden + visible popper, or label + row). Click one.
    cy.contains('[role="menuitem"], [role="option"]', SCALE_FLEET_LABEL_TEXT, { timeout: 120000 })
      .filter(':visible')
      .first()
      .click({ force: true })
    // Close the typeahead panel with Escape — more reliable than clicking the page title which can
    // be clipped by an overflow:hidden ancestor in PF6 layouts.
    cy.get(FLEET_LABEL_TYPEAHEAD_INPUT).type('{esc}', { force: true })
    cy.get('[data-testid="enrolled-devices-table"]', { timeout: 120000 }).should('exist')
    enrolledDeviceRows().should('have.length.at.least', 1)
  },

  expectEnrolledDeviceRowsCount: (expected) => {
    enrolledDeviceRows().should('have.length', expected)
  },

  /** “Devices” table pagination only (scoped to enrolled list; waits out API refresh disabling controls). */
  clickEnrolledDevicesNextPage: () => {
    cy.get('[data-testid="enrolled-devices-table"]', { timeout: 60000 }).should('exist')
    cy.get('[data-testid="enrolled-devices-table"]').scrollIntoView({ block: 'start' })
    enrolledDeviceRows().should('have.length.at.least', 1)
    enrolledDeviceRows().last().scrollIntoView({ block: 'end' })
    waitEnrolledPaginationIdle()
    enrolledDevicesListSection().within(() => {
      cy.get('button[aria-label="Go to next page"]', { timeout: 120000 })
        .first()
        .scrollIntoView({ block: 'center', inline: 'center' })
        .should('not.be.disabled')
        .click({ force: true })
    })
  },

  /**
   * Return to page 1 of the enrolled-devices paginator. Compact PatternFly often omits “Go to first page”,
   * so we click “Go to previous page” until it is disabled (same device-table paginator index as next/previous).
   */
  goToFirstEnrolledDevicesPage: () => {
    cy.get('[data-testid="enrolled-devices-table"]', { timeout: 60000 }).should('exist')
    cy.get('[data-testid="enrolled-devices-table"]').scrollIntoView({ block: 'start' })
    enrolledDeviceRows().last().scrollIntoView({ block: 'end' })
    waitEnrolledPaginationIdle()
    cy.wrap(Array.from({ length: 12 })).each(() => {
      waitEnrolledPaginationIdle()
      enrolledDevicesListSection().within(() => {
        cy.get('button[aria-label="Go to previous page"]', { timeout: 120000 })
          .first()
          .then(($prev) => {
            if (!$prev.is(':disabled')) {
              cy.wrap($prev).scrollIntoView({ block: 'center' }).click({ force: true })
            }
          })
      })
    })
    waitEnrolledPaginationIdle()
    enrolledDevicesListSection().within(() => {
      cy.get('button[aria-label="Go to previous page"]', { timeout: 120000 })
        .first()
        .should('be.disabled')
    })
  },

  goToEnrolledDevicesPageFromFirst: (pageNum) => {
    devicesPage.goToFirstEnrolledDevicesPage()
    for (let p = 1; p < pageNum; p++) {
      devicesPage.clickEnrolledDevicesNextPage()
    }
  },

  decommissionDeviceAtEnrolledRow: (rowIndex = 0) => {
    cy.get(`[data-testid="enrolled-device-row-${rowIndex}"]`)
      .find(`[data-testid^="device-row-actions-"] .pf-v6-c-menu-toggle`)
      .click()
    cy.contains('[role="menuitem"]', 'Decommission device').click()
    cy.get('.pf-v6-c-modal-box').within(() => {
      cy.contains('button.pf-m-danger', 'Decommission device').click()
    })
    cy.get('[data-testid="decommissioned-devices-table"]', { timeout: 120000 }).should('exist')
  },

  /**
   * Open scale-demo device details from the enrolled list (Devices page only).
   * Filters by scale fleet label, resets to page 1, then paginates until the Name link is found.
   */
  openDeviceDetailsFromList: (deviceRef = SCALE_DEMO_DEVICE_NAME) => {
    common.navigateTo('Devices')
    devicesPage.ensureEnrolledDevicesView()
    devicesPage.filterByFleetScaleLabel()
    devicesPage.goToFirstEnrolledDevicesPage()
    clickEnrolledDeviceNameLinkAcrossPages(deviceRef)
    cy.get('[data-testid="device-details-title"]', { timeout: 120000 }).should('be.visible')
    cy.get('[data-testid="device-details-tab-details"]').should('be.visible')
  },

  /**
   * Remove the fleet’s device-selector label (see FLEET_DEVICE_SELECTOR_LABELS), verify disconnect,
   * re-add the same label, verify the device is on the same fleet again.
   * Opens the first enrolled device on page 1 of the scale-fleet filtered list rather than a
   * hardcoded alias — avoids failures when the target device was decommissioned by a prior test.
   */
  runFleetLabelDetachReattachTest: () => {
    common.navigateTo('Devices')
    devicesPage.ensureEnrolledDevicesView()
    devicesPage.filterByFleetScaleLabel()
    devicesPage.goToFirstEnrolledDevicesPage()
    cy.get('[data-testid="enrolled-devices-table"] [data-testid^="device-name-link-"]', {
      timeout: 30000,
    })
      .first()
      .scrollIntoView()
      .click({ force: true })
    cy.get('[data-testid="device-details-title"]', { timeout: 120000 }).should('be.visible')
    cy.get('[data-testid="device-details-tab-details"]').should('be.visible')
    cy.contains('.fctl-device-details-tab__label', 'Fleet name', { timeout: 60000 })
      .closest('.pf-v6-l-stack')
      .find('.fctl-resource-link__text', { timeout: 60000 })
      .invoke('text')
      .as('expectedFleetName')
    cy.contains('.fctl-device-details-tab__label', 'Fleet name')
      .closest('.pf-v6-l-stack')
      .should('not.contain', 'None')

    cy.get('@expectedFleetName').then((fleetName) => {
      const fleet = String(fleetName).trim()
      const bindingLabel =
        FLEET_DEVICE_SELECTOR_LABELS[fleet] || `fleet=${fleet}`
      cy.get('body').then(($body) => {
        const hasBindingLabel = [...$body.find('.pf-v6-c-label')].some((el) => {
          const text = (el.textContent || '').trim().replace(/:/g, '=')
          return text.includes(bindingLabel)
        })
        if (!hasBindingLabel) {
          throw new Error(
            `Device selector label "${bindingLabel}" not found on device (fleet: ${fleet}). ` +
              'Check Fleet details → Device selector matches a label on this device.',
          )
        }
        cy.wrap({ bindingLabel, fleet }).as('fleetLabelTest')
      })
    })

    cy.get('@fleetLabelTest').then(({ bindingLabel, fleet }) => {
      cy.contains('.pf-v6-c-label', bindingLabel).should('exist')
      devicesPage.removeFleetLabelOnDeviceDetails(bindingLabel)
      devicesPage.expectDeviceDetailsFleetDisconnected()
      devicesPage.addFleetLabelOnDeviceDetails(bindingLabel)
      devicesPage.expectDeviceDetailsFleetConnected(fleet)
    })
  },

  expectDeviceDetailsFleetConnected: (fleetName = SCALE_FLEET_NAME) => {
    cy.contains('.fctl-device-details-tab__label', 'Fleet name', { timeout: 120000 })
      .closest('.pf-v6-l-stack')
      .should('contain', fleetName)
  },

  expectDeviceDetailsFleetDisconnected: () => {
    cy.contains('.fctl-device-details-tab__label', 'Fleet name', { timeout: 120000 })
      .closest('.pf-v6-l-stack')
      .should('contain', 'None')
  },

  removeFleetLabelOnDeviceDetails: (labelText = SCALE_FLEET_LABEL_TEXT) => {
    cy.contains('.pf-v6-c-label', labelText)
      .find(`button[aria-label="Close ${labelText}"]`)
      .click()
  },

  addFleetLabelOnDeviceDetails: (labelText = SCALE_FLEET_LABEL_TEXT) => {
    cy.contains('button', 'Add label').click()
    cy.get('input[aria-label="New label"]').clear().type(`${labelText}{enter}`)
  },

  openEditDeviceConfigurations: (deviceName) => {
    common.navigateTo('Devices')
    scrollEnrolledDevicesTableIntoView()
    enrolledDeviceRowByAlias(deviceName)
      .scrollIntoView({ block: 'center' })
      .find(`[data-testid^="device-row-actions-"] .pf-v6-c-menu-toggle`)
      .click()
    cy.contains('Edit device configurations').click()
    cy.contains('h1', 'Edit device').should('be.visible')
    cy.get('[data-testid="wizard-next-button"]').should('be.visible')
  },

  addApplications: (deviceName, apps) => {
    devicesPage.openEditDeviceConfigurations(deviceName)
    cy.get('[data-testid="wizard-next-button"]').click()
    apps.forEach((app, index) => {
      addVmApplication(index, app)
    })
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="wizard-save-button"]').click()
    cy.get('[data-testid="device-details-title"]', { timeout: 120000 }).should('contain', deviceName)
  },

  waitForVmAppRunning: (deviceName = 'test-device', appName = 'test-vm', timeoutMs = 600000) => {
    cy.get('[data-testid="device-details-title"]', { timeout: 30000 }).should('contain', deviceName)
    cy.get(DEVICE_APPLICATIONS_TABLE, { timeout: timeoutMs }).scrollIntoView({ block: 'center' })
    cy.get(DEVICE_APPLICATIONS_TABLE)
      .find('td[data-label="Name"]')
      .contains(new RegExp(`^${appName}$`), { timeout: timeoutMs })
      .parents('tr')
      .find('td[data-label="Status"]', { timeout: timeoutMs })
      .should('contain', 'Running')
  },

  openVmAppConsole: (deviceName = 'test-device', appName = 'test-vm') => {
    common.navigateTo('Devices')
    enrolledDeviceLinkByAlias(deviceName).click()
    cy.get('[data-testid="device-details-title"]').should('contain', deviceName)
    cy.get(DEVICE_APPLICATIONS_TABLE).scrollIntoView({ block: 'center' })
    cy.get(DEVICE_APPLICATIONS_TABLE)
      .find('td[data-label="Name"]')
      .contains(new RegExp(`^${appName}$`))
      .parents('tr')
      .as('vmAppRow')
    cy.get('@vmAppRow').find('button[aria-label="Details"]').then(($btn) => {
      if ($btn.attr('aria-expanded') !== 'true') {
        cy.wrap($btn).click()
      }
    })
    cy.get('@vmAppRow').next('tr').contains('button', 'Open console').should('not.be.disabled').click()
    cy.get('[data-testid="device-terminal-panel"]', { timeout: 30000 }).should('be.visible')
    cy.get(`${APP_CONSOLE_TERMINAL}, ${APP_CONSOLE_ERROR}`, { timeout: 90000 }).should('be.visible')
    cy.get('body').then(($body) => {
      if ($body.find(APP_CONSOLE_ERROR).length) {
        cy.contains('End active session').click()
        cy.contains('End session and connect').click()
      }
    })
    cy.get(APP_CONSOLE_TERMINAL, { timeout: 60000 }).should('be.visible')
    cy.get(APP_CONSOLE_XTERM_ROWS, { timeout: 30000 }).invoke('text').should('include', 'Connected to serial console')
  },

  selectVmConsole: (appName) => {
    cy.get('[data-testid="device-terminal-panel"] .pf-v6-c-menu-toggle').click()
    cy.contains('[role="option"]', appName).click()
    cy.get(`${APP_CONSOLE_TERMINAL}, ${APP_CONSOLE_ERROR}`, { timeout: 90000 }).should('be.visible')
    cy.get('body').then(($body) => {
      if ($body.find(APP_CONSOLE_ERROR).length) {
        cy.contains('End active session').click()
        cy.contains('End session and connect').click()
      }
    })
    cy.get(APP_CONSOLE_TERMINAL, { timeout: 60000 }).should('be.visible')
    cy.get(APP_CONSOLE_XTERM_ROWS, { timeout: 30000 })
      .invoke('text')
      .should('include', `Connected to serial console: ${appName}`)
  },

  loginVmSerialConsole: (user = 'fedora', password = 'fedora') => {
    cy.get(APP_CONSOLE_XTERM_INPUT, { timeout: 30000 }).should('exist').click({ force: true }).type('{enter}', { force: true })
    cy.get(APP_CONSOLE_XTERM_ROWS, { timeout: 120000 }).should(($el) => {
      expect($el.text()).to.match(/login:/i)
    })
    cy.get(APP_CONSOLE_XTERM_INPUT).click({ force: true }).type(`${user}{enter}`, { force: true, delay: 50 })
    cy.get(APP_CONSOLE_XTERM_ROWS, { timeout: 30000 }).should(($el) => {
      expect($el.text()).to.match(/Password:/i)
    })
    cy.get(APP_CONSOLE_XTERM_INPUT).type(`${password}{enter}`, { force: true, delay: 50, log: false })
    cy.get(APP_CONSOLE_XTERM_INPUT).type('{enter}', { force: true })
    cy.get(APP_CONSOLE_XTERM_ROWS, { timeout: 60000 }).should(($el) => {
      expect($el.text()).to.match(new RegExp(`${user}@`))
    })
    cy.get(APP_CONSOLE_XTERM_INPUT).type('whoami{enter}', { force: true, delay: 50 })
    cy.get(APP_CONSOLE_XTERM_ROWS, { timeout: 30000 }).should(($el) => {
      expect($el.text()).to.match(new RegExp(`whoami[\\s\\S]*${user}`))
    })
  },
}
