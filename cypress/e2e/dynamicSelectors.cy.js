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
    cy.get(`[data-testid="device-internal-name-link-${fixture.device}"]`, { timeout: 60000 }).click()

    cy.get('[data-testid="device-details-title"]').should('contain', fixture.device)
    cy.contains('button', /View all device-reported labels/).click()
    cy.contains('Read-only').should('be.visible')
    cy.contains('.pf-v6-c-label', `${fixture.scalarKey}=amd64`).should('be.visible')
    cy.contains('.pf-v6-c-label', label).should('be.visible')
    cy.get(`button[aria-label="Close ${fixture.scalarKey}=amd64"]`).should('not.exist')
    cy.get(`button[aria-label="Close ${fixture.operatorKey}=static"]`).should('exist')

    cy.task('dynamicSelectorDeleteScalar', fixture.scalar)
    cy.task('dynamicSelectorWaitForLabels', {
      name: fixture.device, absent: [fixture.scalarKey],
      expected: { [fixture.mapKey]: 'amd64', [fixture.operatorKey]: 'static' },
    }, { timeout: 190000 })
    cy.task('dynamicSelectorMatches', `${fixture.scalarKey}=amd64`).should('be.empty')
  })

  it('warns for a mapped fleet and batch selector and requires acknowledgment', () => {
    startFleet(`selector-warning-${Date.now()}`)
    addSelector(`${fixture.mapKey}=amd64`)
    cy.contains('Device-reported labels can change fleet membership').should('be.visible')
    cy.contains('Device-reported labels can change fleet membership')
      .closest('.pf-v6-c-alert').should('contain', fixture.mapKey)

    cy.get('[data-testid="wizard-next-button"]').click()
    systemImageInput().type(Cypress.env('image'))
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.contains('label', 'Customize maintenance window and scheduling').click()
    cy.contains('label', 'Set rollout order').click()
    cy.contains('button', 'Add batch').click()
    cy.contains('.pf-v6-c-form__label-text', 'Select devices')
      .parents('.pf-v6-c-form__group')
      .contains('button', 'Add label').click()
    cy.get('input[aria-label="New label"]').last().type(`${fixture.mapKey}=amd64{enter}`)
    cy.contains('Device-reported labels can change batch membership').should('be.visible')

    cy.get('[data-testid="wizard-next-button"]').click()
    cy.contains('label', /acknowledge|I understand/i).should('be.visible')
    cy.get('[data-testid="wizard-save-button"]').should('be.disabled')
    cy.contains('label', /acknowledge|I understand/i).find('input[type="checkbox"]').check()
    cy.get('[data-testid="wizard-save-button"]').should('not.be.disabled')
  })

  it('warns for an unobserved key while an active map mapping exists', () => {
    startFleet(`selector-fallback-${Date.now()}`)
    addSelector(`${fixture.unobservedKey}=future`)
    cy.contains('Device-reported labels can change fleet membership').should('be.visible')
  })
})
