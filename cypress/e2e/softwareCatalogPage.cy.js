import {
  softwareCatalogPage,
  getCatalogItemName,
  CATALOG_FLEET_NAME,
  CATALOG_FLEET_LABEL_TEXT,
} from '../views/softwareCatalogPage'

describe('Software Catalog – Deploy to fleet', () => {
  before(() => {
    Cypress.on('uncaught:exception', () => false)
    cy.ensureLoggedIn()
  })

  afterEach(function () {
    if (this.currentTest.state === 'failed') {
      Cypress.runner.stop()
    }
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Pre-requisite: spin up 5 simulated devices belonging to simulator-disk-monitoring
  //
  // Set CYPRESS_SKIP_SIMULATOR=true (or skipSimulator: true in cypress.config.js)
  // to skip all simulator lifecycle tasks when running the simulator manually.
  // ════════════════════════════════════════════════════════════════════════════
  describe(`Device simulator – ${CATALOG_FLEET_NAME} (5 devices)`, () => {
    before(() => {
      if (Cypress.env('skipSimulator')) {
        cy.log('skipSimulator=true — skipping simulator start and fleet setup')
        return
      }
      cy.task('scaleFleetEnsureExists', {
        fleetName: CATALOG_FLEET_NAME,
        selectorKey: 'fleet',
        selectorValue: CATALOG_FLEET_NAME,
      })
      cy.task('scaleFleetSimulatorStart', {
        count: 5,
        label: CATALOG_FLEET_LABEL_TEXT,
      })
      cy.task(
        'scaleFleetSimulatorWaitForDevices',
        {
          expected: 5,
          labelSelector: CATALOG_FLEET_LABEL_TEXT,
          timeoutMs: 300000,
          pollMs: 5000,
          settleMs: 10000,
        },
        { timeout: 330000 },
      )
    })

    after(() => {
      if (Cypress.env('skipSimulator')) {
        cy.log('skipSimulator=true — skipping simulator stop and fleet cleanup')
        return
      }
      cy.task('scaleFleetSimulatorStop')
      cy.task('scaleFleetCleanup', {
        fleetName: CATALOG_FLEET_NAME,
        labelSelector: CATALOG_FLEET_LABEL_TEXT,
      })
    })

    // ──────────────────────────────────────────────────────────────────────────
    // Deploy catalog item to the fleet
    // ──────────────────────────────────────────────────────────────────────────
    describe('Open Software Catalog and select the published catalog item', () => {
      it('Should navigate to Software Catalog', () => {
        softwareCatalogPage.navigateTo()
      })

      it('Should select the catalog item published by the build image', () => {
        softwareCatalogPage.selectCatalogItem(getCatalogItemName())
      })

      it('Should click Deploy in the catalog item details drawer', () => {
        softwareCatalogPage.clickDeploy()
      })

      it('Should open the deployment specifications step in the deploy wizard', () => {
        softwareCatalogPage.expectDeploymentSpecificationsStep()
      })
    })

    describe('Deploy wizard – Step 1: Specifications', () => {
      it('Should select "Existing Fleet" as the target type', () => {
        softwareCatalogPage.selectExistingFleetTarget()
      })

      it('Should click Next to proceed to fleet selection', () => {
        softwareCatalogPage.clickWizardNext()
      })
    })

    describe('Deploy wizard – Step 2: Select fleet', () => {
      it('Should select the fleet created by the device simulator', () => {
        softwareCatalogPage.selectFleetByName(CATALOG_FLEET_NAME)
      })

      it('Should click Next to proceed to review', () => {
        softwareCatalogPage.clickWizardNext()
      })
    })

    describe('Deploy wizard – Step 3: Review and deploy', () => {
      it('Should click Deploy to apply the catalog item to the fleet', () => {
        softwareCatalogPage.clickWizardDeploy()
      })
    })

    describe('Post-deploy verification', () => {
      it('Should show "Update configuration successful"', () => {
        softwareCatalogPage.verifyUpdateSuccessful()
      })

      it('Should navigate to fleet details via "View fleet"', () => {
        softwareCatalogPage.clickViewFleet()
      })

      it('Should open the Catalog tab on fleet details', () => {
        softwareCatalogPage.clickFleetCatalogTab()
      })

      it('Should show the deployed catalog item under "Deployed Software"', () => {
        softwareCatalogPage.verifyDeployedSoftware(getCatalogItemName())
      })
    })
  })
})
