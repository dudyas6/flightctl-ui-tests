import { fleetsPage } from '../views/fleetsPage'
import { repositoriesPage } from '../views/repositoriesPage'

const assertCatalogReference = (reference, { catalog, item, version, channel }) => {
  expect(reference, `catalogItemRef for ${item}`).to.exist
  expect(reference.catalog, `catalog for ${item}`).to.equal(catalog)
  expect(reference.item, `item for ${item}`).to.equal(item)
  expect(reference.version, `version for ${item}`).to.equal(version)
  expect(reference.channel, `channel for ${item}`).to.equal(channel)
}

const assertFleetCatalogRequest = (request, {
  catalog = 'default',
  osItemName,
  osVersion,
  appItemName,
  appVersion,
  channel,
  appEnvVars,
}) => {
  const templateSpec = request.body?.spec?.template?.spec
  expect(templateSpec, 'created fleet template spec').to.exist

  if (osItemName) {
    assertCatalogReference(templateSpec.os?.catalogItemRef, {
      catalog,
      item: osItemName,
      version: osVersion,
      channel,
    })
    expect(templateSpec.os?.image, 'catalog OS image field').to.be.undefined
  }

  const catalogApp = (templateSpec.applications || []).find(
    (application) => application.catalogItemRef?.item === appItemName,
  )
  expect(catalogApp, `catalog application ${appItemName}`).to.exist
  assertCatalogReference(catalogApp.catalogItemRef, {
    catalog,
    item: appItemName,
    version: appVersion,
    channel,
  })
  expect(catalogApp.image, `catalog application ${appItemName} image field`).to.be.undefined
  if (appEnvVars) expect(catalogApp.envVars).to.deep.include(appEnvVars)
}

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
      cy.task('catalogInheritanceSetup', { catalogName: 'default' }).then((created) => {
        Object.assign(fixture, created)
      })
    })

    after(() => {
      if (!fixture.fleetName) return
      cy.task('catalogInheritanceCleanup', fixture)
    })

    afterEach(() => {
      fleetsPage.dismissOpenWizard()
    })

    it('Should create a fleet with pinned catalog OS and application references', () => {
      cy.intercept('**/api/v1/fleets**').as('createFleetRequest')
      fleetsPage.openCreateFleetWizard()
      fleetsPage.proceedToDeviceTemplate(fixture.fleetName)
      fleetsPage.addCatalogOs(fixture.osItemName, channel, initialVersion)
      fleetsPage.addCatalogApplication(fixture.appItemName, channel, initialVersion)
      cy.contains('button', 'Update available').should('not.exist')
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      fleetsPage.expectCatalogInheritanceReview(
        fixture.osItemName,
        fixture.appItemName,
        channel,
        initialVersion,
      )
      cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
      cy.wait('@createFleetRequest', { timeout: 60000 }).then(({ request }) => {
        expect(request.url).not.to.contain('/catalog')
        assertFleetCatalogRequest(request, {
          osItemName: fixture.osItemName,
          osVersion: initialVersion,
          appItemName: fixture.appItemName,
          appVersion: initialVersion,
          channel,
        })
      })
      fleetsPage.openFleetCatalogTab()
      fleetsPage.expectCatalogItemState(fixture.osItemName, initialVersion, true)
      fleetsPage.expectCatalogItemState(fixture.appItemName, initialVersion, true)
    })

    it('Should show pinned catalog references when editing the fleet', () => {
      fleetsPage.openEditFleetWizard(fixture.fleetName)
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.contains('System image', { timeout: 30000 }).should('be.visible')
      fleetsPage.expectCatalogInheritanceTemplate(
        fixture.osItemName,
        fixture.appItemName,
        { updateAvailable: true },
      )
      fleetsPage.closeWizardWithoutChanges()
      fleetsPage.openFleetDetails(fixture.fleetName)
      fleetsPage.openFleetCatalogTab()
    })

    it('Should update catalog OS and application independently', () => {
      fleetsPage.expectCatalogItemState(fixture.osItemName, initialVersion, true)
      fleetsPage.expectCatalogItemState(fixture.appItemName, initialVersion, true)

      fleetsPage.updateCatalogItem(fixture.osItemName, updateVersion)
      fleetsPage.expectCatalogItemState(fixture.osItemName, updateVersion, false)
      fleetsPage.expectCatalogItemState(fixture.appItemName, initialVersion, true)

      fleetsPage.updateCatalogItem(fixture.appItemName, updateVersion)
      fleetsPage.expectCatalogItemState(fixture.osItemName, updateVersion, false)
      fleetsPage.expectCatalogItemState(fixture.appItemName, updateVersion, false)
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

    it('Should update to the latest reachable version and limit Catalog-tab Edit choices', () => {
      fleetsPage.openCreateFleetWizard()
      fleetsPage.proceedToDeviceTemplate(fixture.graphFleetName)
      fleetsPage.addCatalogApplication(
        fixture.graphAppItemName,
        channel,
        fixture.graphInitialVersion,
      )
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
      fleetsPage.openFleetCatalogTab()
      fleetsPage.expectCatalogItemState(fixture.graphAppItemName, fixture.graphInitialVersion, true)

      fleetsPage.openCatalogItemEdit(fixture.graphAppItemName)
      fleetsPage.expectCatalogVersionOptions(
        [fixture.graphInitialVersion, fixture.graphReachableVersion, fixture.graphLatestVersion],
        [fixture.graphUnreachableVersion],
      )
      fleetsPage.closeWizardWithoutChanges()

      fleetsPage.updateCatalogItem(fixture.graphAppItemName, fixture.graphLatestVersion, { locked: true })
      fleetsPage.expectCatalogItemState(fixture.graphAppItemName, fixture.graphLatestVersion, false)
    })

    it('Should not show Update available for an unreachable higher channel version', () => {
      fleetsPage.openCreateFleetWizard()
      fleetsPage.proceedToDeviceTemplate(fixture.unreachableFleetName)
      fleetsPage.addCatalogApplication(
        fixture.unreachableAppItemName,
        channel,
        fixture.graphInitialVersion,
      )
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
      fleetsPage.openFleetCatalogTab()
      fleetsPage.expectCatalogItemState(fixture.unreachableAppItemName, fixture.graphInitialVersion, false)
    })

    it('Should allow optional schema configuration and expose Form/YAML views with catalog defaults', () => {
      cy.intercept('**/api/v1/fleets**').as('createConfigFleetRequest')
      fleetsPage.openCreateFleetWizard()
      fleetsPage.proceedToDeviceTemplate(fixture.configFleetName)
      fleetsPage.openCatalogApplicationPicker()
      fleetsPage.openCatalogApplicationConfiguration(
        fixture.schemaAppItemName,
        channel,
        fixture.configVersion,
      )
      fleetsPage.expectCatalogConfigurationViews()
      fleetsPage.expectCatalogDefaultValue('info')
      fleetsPage.completeCatalogApplicationConfiguration()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
      cy.wait('@createConfigFleetRequest', { timeout: 60000 }).then(({ request }) => {
        expect(request.url).not.to.contain('/catalog')
        assertFleetCatalogRequest(request, {
          appItemName: fixture.schemaAppItemName,
          appVersion: fixture.configVersion,
          channel,
          appEnvVars: { LOG_LEVEL: 'info' },
        })
      })
      fleetsPage.openFleetCatalogTab()
      fleetsPage.openCatalogItemEdit(fixture.schemaAppItemName)
      cy.get('[data-testid="wizard-next-button"]', { timeout: 30000 }).should('not.be.disabled').click()
      fleetsPage.expectCatalogConfigurationViews()
      fleetsPage.expectCatalogDefaultValue('info')
      fleetsPage.fillCatalogRequiredConfiguration('debug')
      fleetsPage.saveCatalogItemEdit()
    })

    it('Should require schema fields that are not satisfied by catalog defaults', () => {
      cy.intercept('**/api/v1/fleets**').as('createRequiredFleetRequest')
      fleetsPage.openCreateFleetWizard()
      fleetsPage.proceedToDeviceTemplate(fixture.requiredFleetName)
      fleetsPage.openCatalogApplicationPicker()
      fleetsPage.openCatalogApplicationConfiguration(
        fixture.requiredAppItemName,
        channel,
        fixture.configVersion,
      )
      fleetsPage.expectCatalogConfigurationViews()
      fleetsPage.expectCatalogConfigurationRequired()
      fleetsPage.fillCatalogRequiredConfiguration('required-value')
      fleetsPage.completeCatalogApplicationConfiguration()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
      cy.wait('@createRequiredFleetRequest', { timeout: 60000 }).then(({ request }) => {
        expect(request.url).not.to.contain('/catalog')
        assertFleetCatalogRequest(request, {
          appItemName: fixture.requiredAppItemName,
          appVersion: fixture.configVersion,
          channel,
          appEnvVars: { REQUIRED_VALUE: 'required-value' },
        })
      })
    })

    it('Should expose YAML-only optional configuration for catalog items without a schema', () => {
      fleetsPage.openCreateFleetWizard()
      fleetsPage.proceedToDeviceTemplate(fixture.noSchemaFleetName)
      fleetsPage.openCatalogApplicationPicker()
      fleetsPage.openCatalogApplicationConfiguration(
        fixture.noSchemaAppItemName,
        channel,
        fixture.configVersion,
      )
      fleetsPage.expectCatalogYamlOnlyConfiguration()
      fleetsPage.completeCatalogApplicationConfiguration()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
    })

    it('Should keep VM catalog items out of inheritance browse and retain the manual path', () => {
      fleetsPage.openCreateFleetWizard()
      fleetsPage.proceedToDeviceTemplate(`${fixture.manualFleetName}-vm-filter`)
      fleetsPage.openCatalogApplicationPicker()
      fleetsPage.expectCatalogApplicationAvailability(fixture.vmCandidateItemName, false)
      fleetsPage.expectManualApplicationPath()
      fleetsPage.closeWizardWithoutChanges()
    })

    it('Should remove a catalog application before adding a manual replacement', () => {
      fleetsPage.openEditFleetWizard(fixture.editFleetName)
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      fleetsPage.removeCatalogApplication(fixture.appItemName)
      fleetsPage.expectManualApplicationPath()
      fleetsPage.addManualApplication('quay.io/sdelacru/flightctl-centos:manual')
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
      cy.contains('Update configuration successful', { timeout: 60000 }).should('be.visible')
    })

    it('Should preserve manual OS and application creation without catalog update awareness', () => {
      const manualImage = 'quay.io/sdelacru/flightctl-centos:manual'
      fleetsPage.createFleet(manualImage, fixture.manualFleetName)
      fleetsPage.openEditFleetWizard(fixture.manualFleetName)
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      fleetsPage.addManualApplication(manualImage)
      fleetsPage.expectManualApplicationPath()
      cy.contains('button', 'Update available').should('not.exist')
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
    })
  })
})
