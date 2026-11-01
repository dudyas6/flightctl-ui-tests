import { fleetsPage } from '../views/fleetsPage'
import { repositoriesPage } from '../views/repositoriesPage'

// Skipped temporarily to shorten CI runs — remove .skip to re-enable.
describe('Fleet Management', () => {
  before(() => {
    cy.ensureLoggedIn()
  })

  describe('Create fleet – Fleet name validation (negative)', () => {
    it('Should show validation error when fleet name starts with a dash', () => {
      fleetsPage.openCreateFleetWizard()
      fleetsPage.fillFleetNameInCreateWizard('-test')
      fleetsPage.expectInvalidFleetNameBlocksWizard()
      fleetsPage.closeCreateFleetWizard()
    })

    it('Should show validation error when fleet name ends with a dash', () => {
      fleetsPage.openCreateFleetWizard()
      fleetsPage.fillFleetNameInCreateWizard('test-')
      fleetsPage.expectInvalidFleetNameBlocksWizard()
      fleetsPage.closeCreateFleetWizard()
    })

    it('Should show validation error when fleet name contains uppercase letters', () => {
      fleetsPage.openCreateFleetWizard()
      fleetsPage.fillFleetNameInCreateWizard('InvalidFleet')
      fleetsPage.expectInvalidFleetNameBlocksWizard()
      fleetsPage.closeCreateFleetWizard()
    })

    it('Should show validation error when fleet name contains spaces', () => {
      fleetsPage.openCreateFleetWizard()
      fleetsPage.fillFleetNameInCreateWizard('invalid fleet name')
      fleetsPage.expectInvalidFleetNameBlocksWizard()
      fleetsPage.closeCreateFleetWizard()
    })

    it('Should show validation error when fleet name exceeds 253 characters', () => {
      const longName = 'a'.repeat(254)
      fleetsPage.openCreateFleetWizard()
      fleetsPage.fillFleetNameInCreateWizard(longName)
      fleetsPage.expectInvalidFleetNameBlocksWizard()
      fleetsPage.closeCreateFleetWizard()
    })
  })

  describe('Create fleet, delete fleet, import fleet', () => {
    it('Should create a fleet', () => {
      fleetsPage.createFleet(`${Cypress.env('image')}`)
    })

    /* it('Should edit a fleet', () => {
      fleetsPage.editFleet(`${Cypress.env('image')}`)
    }) */

    it('Should delete a fleet', () => {
      fleetsPage.deleteFleet('test-fleet')
    })

    it('Should import a fleet', () => {
      fleetsPage.importFleet()
    })

    /* it('Should delete an imported fleet', () => {
      repositoriesPage.deleteRepository('test-fleet')
      cy.wait(5000)
      fleetsPage.deleteFleet('basic-nginx-fleet')
    }) */
  })

  describe('Catalog inheritance for fleets', () => {
    const fixture = {}
    const channel = 'stable'
    const initialVersion = '1.0.0'
    const updateVersion = '1.1.0'

    before(() => {
      cy.task('catalogInheritanceSetup', { catalogName: 'default', includeRequiredConfigApp: true }).then((created) => {
        Object.assign(fixture, created)
      })
    })

    after(() => {
      if (!fixture.fleetName) return
      cy.task('catalogInheritanceCleanup', fixture)
    })

    it('Should create a fleet with pinned catalog OS and application references', () => {
      fleetsPage.openCreateFleetWizard()
      fleetsPage.proceedToDeviceTemplate(fixture.fleetName)
      fleetsPage.addCatalogOs(fixture.osItemName, channel, initialVersion)
      fleetsPage.addCatalogApplication(fixture.appItemName, channel, initialVersion)
      cy.get('.fctl-catalog-ref-card').should('not.contain.text', 'Update available')
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      fleetsPage.expectCatalogInheritanceReview(
        fixture.osItemName,
        fixture.appItemName,
        channel,
        initialVersion,
      )
      cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
      fleetsPage.openFleetCatalogTab()
      fleetsPage.expectCatalogItemState(fixture.osItemName, initialVersion, true)
      fleetsPage.expectCatalogItemState(fixture.appItemName, initialVersion, true)

      fleetsPage.openEditFleetWizard(fixture.fleetName)
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      fleetsPage.expectCatalogInheritanceTemplate(
        fixture.osItemName,
        fixture.appItemName,
        channel,
        initialVersion,
      )
      fleetsPage.closeWizardWithoutChanges()
      fleetsPage.openFleetDetails(fixture.fleetName)
      fleetsPage.openFleetCatalogTab()
    })

    it('Should update catalog OS and application independently', () => {
      fleetsPage.expectCatalogItemState(fixture.osItemName, initialVersion, true)
      fleetsPage.expectCatalogItemState(fixture.appItemName, initialVersion, true)

      fleetsPage.updateCatalogItem(fixture.osItemName, channel, initialVersion, updateVersion)
      fleetsPage.expectCatalogItemState(fixture.osItemName, updateVersion, false)
      fleetsPage.expectCatalogItemState(fixture.appItemName, initialVersion, true)

      fleetsPage.updateCatalogItem(fixture.appItemName, channel, initialVersion, updateVersion)
      fleetsPage.expectCatalogItemState(fixture.osItemName, updateVersion, false)
      fleetsPage.expectCatalogItemState(fixture.appItemName, updateVersion, false)
    })

    it('When catalog configuration is required it should block adding the app until the field is filled', () => {
      const requiredValue = 'configured-by-fleet'
      fleetsPage.openCreateFleetWizard()
      fleetsPage.proceedToDeviceTemplate(fixture.configFleetName)
      fleetsPage.addCatalogOs(fixture.osItemName, channel, initialVersion)
      fleetsPage.addRequiredConfigCatalogApplication(
        fixture.requiredAppItemName,
        channel,
        initialVersion,
        requiredValue,
      )
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
      fleetsPage.openFleetCatalogTab()
      fleetsPage.expectCatalogItemState(fixture.requiredAppItemName, initialVersion, false)

      cy.task('getFleetCatalogApplication', {
        fleetName: fixture.configFleetName,
        itemName: fixture.requiredAppItemName,
      }).then((app) => {
        expect(app.catalogItemRef).to.deep.include({
          catalog: fixture.catalogName,
          item: fixture.requiredAppItemName,
          channel,
          version: initialVersion,
        })
        expect(app.envVars?.REQUIRED_VALUE).to.equal(requiredValue)
      })
    })

    it('Should edit another fleet to use catalog OS and application references', () => {
      fleetsPage.createFleet(`${Cypress.env('image')}`, fixture.editFleetName)
      fleetsPage.openEditFleetWizard(fixture.editFleetName)
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.contains('System image', { timeout: 30000 }).should('be.visible')
      fleetsPage.addCatalogOs(fixture.osItemName, channel, initialVersion)
      fleetsPage.addCatalogApplication(fixture.appItemName, channel, initialVersion)
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      fleetsPage.expectCatalogInheritanceReview(
        fixture.osItemName,
        fixture.appItemName,
        channel,
        initialVersion,
      )
      cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
      fleetsPage.openFleetCatalogTab()
      fleetsPage.expectCatalogItemState(fixture.osItemName, initialVersion, true)
      fleetsPage.expectCatalogItemState(fixture.appItemName, initialVersion, true)
    })
  })
})
