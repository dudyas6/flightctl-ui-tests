import { common, systemImageInput } from '../views/common'
import { devicesPage } from '../views/devicesPage'
import { fleetsPage } from '../views/fleetsPage'

describe('Device-reported selectors', () => {
  let fixture

  const addSelector = (label) => {
    cy.contains('.pf-v6-c-form__label-text', 'Device selector')
      .parents('.pf-v6-c-form__group')
      .contains('button', 'Add label')
      .click()
    cy.get('input[aria-label="New label"]').type(`${label}{enter}`)
  }

  const startFleet = (name) => {
    fleetsPage.openCreateFleetWizard()
    fleetsPage.fillFleetNameInCreateWizard(name)
  }

  before(() => {
    cy.ensureLoggedIn()
    cy.task('dynamicSelectorSetup').then((created) => {
      fixture = created
      cy.task('patchDeviceStatus', {
        deviceName: fixture.device,
        image: Cypress.env('image'),
        imageDigest: '',
        architecture: 'amd64',
      }).then(({ success, error }) => expect(success, error).to.be.true)
      cy.task('dynamicSelectorWaitForLabels', {
        name: fixture.device,
        expected: {
          [fixture.scalarKey]: 'amd64',
          [fixture.mapKey]: 'amd64',
          [fixture.operatorKey]: 'static',
        },
      }, { timeout: 190000 })
    })
  })

  after(() => {
    if (fixture) cy.task('dynamicSelectorCleanup', fixture)
  })

  it('filters a device by a promoted label and shows read-only provenance', () => {
    const label = `${fixture.mapKey}=amd64`
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
      .within(() => {
        cy.contains('Read-only').should('be.visible')
        cy.contains('.pf-v6-c-label', `${fixture.scalarKey}=amd64`).should('be.visible')
        cy.contains('.pf-v6-c-label', label).should('be.visible')
      })
    cy.get(`button[aria-label="Close ${fixture.scalarKey}=amd64"]`).should('not.exist')
    cy.get(`button[aria-label="Close ${fixture.operatorKey}=static"]`).should('exist')

    cy.task('dynamicSelectorDeleteScalar', fixture.scalar)
    cy.task('dynamicSelectorWaitForLabels', {
      name: fixture.device, absent: [fixture.scalarKey],
      expected: { [fixture.mapKey]: 'amd64', [fixture.operatorKey]: 'static' },
    }, { timeout: 190000 })
    cy.task('dynamicSelectorMatches', `${fixture.scalarKey}=amd64`).should('be.empty')
  })

  it('creates a fleet from a mapped label and keeps static selectors quiet', () => {
    const fleetName = `selector-mapped-${Date.now()}`
    fixture.fleet = fleetName
    const label = `${fixture.mapKey}=amd64`
    cy.task('dynamicSelectorMatches', label).should('deep.equal', [fixture.device])

    startFleet(fleetName)
    addSelector(label)
    cy.contains('1 device matching the labels was selected.').should('be.visible')
    cy.contains('Device-reported labels can change fleet membership')
      .scrollIntoView({ block: 'center' })
      .should('be.visible')
    cy.contains('Device-reported labels can change fleet membership')
      .closest('.pf-v6-c-alert').should('contain', fixture.mapKey)
    cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
    systemImageInput().should('be.visible').type(Cypress.env('image'))
    cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
    cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
    cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()

    cy.task('dynamicSelectorGetFleet', fleetName).then((createdFleet) => {
      expect(createdFleet.spec.selector.matchLabels).to.deep.equal({ [fixture.mapKey]: 'amd64' })
    })

    startFleet(`static-selector-${Date.now()}`)
    addSelector(`${fixture.operatorKey}=static`)
    cy.contains('1 device matching the labels was selected.').should('be.visible')
    cy.contains('Device-reported labels can change fleet membership').should('not.exist')
    fleetsPage.closeCreateFleetWizard()
  })
})
