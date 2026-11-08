import { common, systemImageInput } from '../views/common'
import { devicesPage } from '../views/devicesPage'
import { fleetsPage } from '../views/fleetsPage'

const ARCHITECTURE = 'amd64'
const OPERATOR_LABEL_VALUE = 'static'
const SELECTOR_FIELD_LABEL = 'Device selector'
const ADD_LABEL_BUTTON = 'Add label'
const NEW_LABEL_INPUT = 'New label'
const SELECTED_DEVICE_COUNT = '1 device matching the labels was selected.'
const DYNAMIC_LABEL_WARNING = 'Device-reported labels can change fleet membership'
const TASK_TIMEOUT = 190000

let fixture

describe('Device-reported selectors', () => {
  before(setupDynamicSelectorFixture)
  after(cleanupDynamicSelectorFixture)

  it('filters a device by a promoted label and shows read-only provenance', () => {
    const label = selectorFor(fixture.mapKey, ARCHITECTURE)
    cy.task('dynamicSelectorMatches', label).should('deep.equal', [fixture.device])

    common.navigateTo('Devices')
    devicesPage.ensureEnrolledDevicesView()
    cy.get('#devices-toolbar').scrollIntoView()
    cy.get('#typeahead-select-input input').type(label, { force: true })
    cy.contains('[role="menuitem"], [role="option"]', label, { timeout: 60000 })
      .filter(':visible').first().click({ force: true })
    cy.get('#typeahead-select-input input').type('{esc}', { force: true })
    cy.contains('[data-testid="enrolled-devices-table"] tbody tr', fixture.device, { timeout: 60000 })
      .find('[data-testid^="device-name-link-"]')
      .should('be.visible')
      .click()

    cy.get('[data-testid="device-details-title"]').should('be.visible')
    cy.get('nav[aria-label="Breadcrumb"]').should('contain', fixture.device)
    cy.contains('button', /View all device-reported labels/).click()
    cy.get('.pf-v6-c-drawer__panel')
      .filter(':visible')
      .should('have.length', 1)
      .within(assertProvenanceDrawer)
    cy.get(closeLabelButton(fixture.scalarKey, ARCHITECTURE)).should('not.exist')
    cy.get(closeLabelButton(fixture.operatorKey, OPERATOR_LABEL_VALUE)).should('exist')

    cy.task('dynamicSelectorDeleteScalar', fixture.scalar)
    cy.task('dynamicSelectorWaitForLabels', {
      name: fixture.device,
      absent: [fixture.scalarKey],
      expected: {
        [fixture.mapKey]: ARCHITECTURE,
        [fixture.operatorKey]: OPERATOR_LABEL_VALUE,
      },
    }, { timeout: TASK_TIMEOUT })
    cy.task('dynamicSelectorMatches', selectorFor(fixture.scalarKey, ARCHITECTURE))
      .should('be.empty')
  })

  it('creates a fleet from a mapped label and keeps static selectors quiet', () => {
    const fleetName = uniqueFleetName('selector-mapped')
    registerFleetForCleanup(fleetName)
    const label = selectorFor(fixture.mapKey, ARCHITECTURE)
    cy.task('dynamicSelectorMatches', label).should('deep.equal', [fixture.device])

    startFleet(fleetName)
    addSelector(label)
    cy.contains(SELECTED_DEVICE_COUNT).should('be.visible')
    cy.contains(DYNAMIC_LABEL_WARNING)
      .scrollIntoView({ block: 'center' })
      .should('be.visible')
    cy.contains(DYNAMIC_LABEL_WARNING)
      .closest('.pf-v6-c-alert').should('contain', fixture.mapKey)
    cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
    systemImageInput().should('be.visible').type(Cypress.env('image'))
    cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
    cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
    cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()

    cy.task('dynamicSelectorGetFleet', fleetName)
      .its('spec.selector.matchLabels')
      .should('deep.equal', { [fixture.mapKey]: ARCHITECTURE })

    const staticFleetName = uniqueFleetName('static-selector')
    registerFleetForCleanup(staticFleetName)
    startFleet(staticFleetName)
    addSelector(selectorFor(fixture.operatorKey, OPERATOR_LABEL_VALUE))
    cy.contains(SELECTED_DEVICE_COUNT).should('be.visible')
    cy.contains(DYNAMIC_LABEL_WARNING).should('not.exist')
    fleetsPage.closeCreateFleetWizard()
  })
})

/** Creates the mapped-label fixture and waits for its device labels to reconcile. */
function setupDynamicSelectorFixture() {
  cy.ensureLoggedIn()
  cy.task('dynamicSelectorSetup').then(saveFixture)
  cy.then(patchFixtureArchitecture)
}

/** Stores the fixture returned by the Cypress task for hooks and specs. */
function saveFixture(created) {
  if (!created || !created.device || !created.scalarKey || !created.mapKey || !created.operatorKey ||
    !Array.isArray(created.fleets)) {
    throw new Error('dynamicSelectorSetup returned an incomplete fixture')
  }
  fixture = created
}

/** Sets the test device architecture and waits for both mapped labels to appear. */
function patchFixtureArchitecture() {
  return cy.task('patchDeviceStatus', {
    deviceName: fixture.device,
    image: Cypress.env('image'),
    imageDigest: '',
    architecture: ARCHITECTURE,
  }).its('success').should('be.true').then(waitForFixtureLabels)
}

/** Waits until the synthetic device exposes the expected mapped and operator labels. */
function waitForFixtureLabels() {
  return cy.task('dynamicSelectorWaitForLabels', {
    name: fixture.device,
    expected: {
      [fixture.scalarKey]: ARCHITECTURE,
      [fixture.mapKey]: ARCHITECTURE,
      [fixture.operatorKey]: OPERATOR_LABEL_VALUE,
    },
  }, { timeout: TASK_TIMEOUT })
}

/** Removes all resources created by this spec after its last test. */
function cleanupDynamicSelectorFixture() {
  if (fixture) return cy.task('dynamicSelectorCleanup', fixture)
  return undefined
}

/** Adds a selector row in the Fleet wizard using the existing Fleet page controls. */
function addSelector(label) {
  cy.contains('.pf-v6-c-form__label-text', SELECTOR_FIELD_LABEL)
    .parents('.pf-v6-c-form__group')
    .contains('button', ADD_LABEL_BUTTON)
    .click()
  cy.get(`input[aria-label="${NEW_LABEL_INPUT}"]`).type(`${label}{enter}`)
}

/** Opens the Fleet wizard and fills its name. */
function startFleet(name) {
  fleetsPage.openCreateFleetWizard()
  fleetsPage.fillFleetNameInCreateWizard(name)
}

/** Records a created Fleet so fixture cleanup removes every Fleet from this spec. */
function registerFleetForCleanup(name) {
  if (!fixture || !Array.isArray(fixture.fleets)) {
    throw new Error('dynamic selector fixture is not ready for Fleet cleanup tracking')
  }
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('Fleet name must be a non-empty string')
  }
  fixture.fleets.push(name)
}

/** Checks the visible device-reported label drawer content. */
function assertProvenanceDrawer() {
  cy.contains('Read-only').should('be.visible')
  cy.contains('.pf-v6-c-label', selectorFor(fixture.scalarKey, ARCHITECTURE)).should('be.visible')
  cy.contains('.pf-v6-c-label', selectorFor(fixture.mapKey, ARCHITECTURE)).should('be.visible')
}

/** Formats a label selector from its key and value. */
function selectorFor(key, value) {
  return `${key}=${value}`
}

/** Builds a unique Fleet name for a UI wizard run. */
function uniqueFleetName(prefix) {
  return `${prefix}-${Date.now()}`
}

/** Builds the accessible close-button selector for a device label. */
function closeLabelButton(key, value) {
  return `button[aria-label="Close ${selectorFor(key, value)}"]`
}
