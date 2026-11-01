import { common, systemImageInput } from './common'

/** Fleet name validation: red error icon color when invalid */
const VALIDATION_ERROR_ICON_COLOR = '#b1380b'
const CATALOG_MODAL = '[role="dialog"]:visible'

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const catalogModal = () => cy.get(CATALOG_MODAL).last()

const selectCatalogValue = (fieldId, value) => {
  catalogModal().find(`#${fieldId}`).should('be.visible').click()
  cy.contains('[role="option"]:visible', new RegExp(`^${escapeRegExp(value)}$`))
    .should('be.visible')
    .click()
}

const selectCatalogItem = (itemName) => {
  catalogModal()
    .find('input[placeholder="Search by name"]')
    .should('be.visible')
    .clear()
    .type(itemName, { delay: 0 })
  catalogModal().find(`[aria-label="Select ${itemName}"]`).should('be.visible').click()
}

const chooseCatalogApplication = (itemName, channel, version) => {
  cy.contains('button', 'Add from software catalog', { timeout: 30000 }).first().click()
  catalogModal().should('contain', 'Add application from Software Catalog')
  selectCatalogItem(itemName)
  selectCatalogValue('selectfield-channel-menu', channel)
  selectCatalogValue('selectfield-version-menu', version)
}

const catalogItemScope = (itemName) => cy.contains('Deployed Software', { timeout: 60000 })
  .closest('.pf-v6-c-card')
  .contains(itemName)
  .parents('.pf-v6-l-stack__item')
  .filter((_, element) => Cypress.$(element).find('button').length > 0)
  .first()
  .should('be.visible')

/** Fleet wizard General info uses RichValidationTextField name="name" */
function assertFleetNameValidationIconErrorColor() {
  cy.get('[data-testid="rich-validation-field-name-validation-button"]').should('be.visible')
  cy.get('[data-testid="rich-validation-field-name-validation-button"]')
    .find('svg')
    .should('have.attr', 'color', VALIDATION_ERROR_ICON_COLOR)
}

/**
 * FleetsPage object for fleet management operations
 */
export const fleetsPage = {
  /**
   * Open the Create fleet wizard on General info (fleet name field visible).
   */
  openCreateFleetWizard: () => {
    common.navigateTo('Fleets')
    cy.get('[data-testid="toolbar-create-fleet"]', { timeout: 10000 }).first().should('be.visible')
    cy.get('[data-testid="toolbar-create-fleet"]').first().click()
    cy.get('[data-testid="rich-validation-field-name"]').should('be.visible')
  },

  /**
   * Fill the Fleet name field on the open Create fleet wizard.
   */
  fillFleetNameInCreateWizard: (name) => {
    cy.get('[data-testid="rich-validation-field-name"]').clear()
    cy.get('[data-testid="rich-validation-field-name"]').type(name, { delay: 0 })
    cy.get('[data-testid="rich-validation-field-name"]').should('have.value', name)
  },

  /**
   * Assert the validation icon shows error state (SVG color="#b1380b").
   */
  expectValidationIconError: () => {
    assertFleetNameValidationIconErrorColor()
  },

  /**
   * After an invalid fleet name on General info:
   * 1) Validation icon SVG has color="#b1380b"
   * 2) Wizard footer primary Next button is disabled
   */
  expectInvalidFleetNameBlocksWizard: () => {
    assertFleetNameValidationIconErrorColor()
    cy.get('[data-testid="wizard-next-button"]').should('be.disabled')
  },

  /**
   * Close the Create fleet wizard without submitting (Cancel).
   */
  closeCreateFleetWizard: () => {
    cy.get('[data-testid="wizard-cancel-button"]').click()
    cy.get('body').then(($body) => {
      const discardBtn = $body.find('button').filter((_, el) =>
        (el.textContent || '').includes('Discard changes'),
      )
      if (discardBtn.length) {
        cy.wrap(discardBtn.first()).click()
      }
    })
    cy.get('[data-testid="rich-validation-field-name"]').should('not.exist')
  },

  /** Advance a newly opened fleet wizard to the Device template step. */
  proceedToDeviceTemplate: (fleetname) => {
    fleetsPage.fillFleetNameInCreateWizard(fleetname)
    cy.get('[data-testid="rich-validation-field-name"]').blur()
    cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
    cy.contains('System image', { timeout: 30000 }).should('be.visible')
  },

  /** Add a pinned OS catalog reference to the open fleet wizard. */
  addCatalogOs: (itemName, channel, version) => {
    cy.contains('button', 'Add from software catalog', { timeout: 30000 }).first().click()
    catalogModal().should('contain', 'Add system image from Software Catalog')
    selectCatalogItem(itemName)
    selectCatalogValue('selectfield-channel-menu', channel)
    selectCatalogValue('selectfield-version-menu', version)
    catalogModal().contains('button', 'Add to template').should('be.visible').click()
    cy.get('[role="dialog"]:visible').should('not.exist')
  },

  /** Add a pinned application catalog reference to the open fleet wizard. */
  addCatalogApplication: (itemName, channel, version) => {
    chooseCatalogApplication(itemName, channel, version)
    catalogModal().contains('button', 'Add to template').should('be.visible').click()
    cy.get('[role="dialog"]:visible').should('not.exist')
  },

  /** Complete the mandatory Form view for an app whose schema has no default for a required field. */
  addRequiredConfigCatalogApplication: (itemName, channel, version, requiredValue) => {
    chooseCatalogApplication(itemName, channel, version)
    catalogModal().contains('Additional information required').should('be.visible')
    catalogModal().contains('button', 'Next').should('not.be.disabled').click()
    catalogModal().contains('h3', 'Advanced configuration').should('be.visible')
    catalogModal().contains('Form view').should('be.visible')
    catalogModal().find('#root_envVars_REQUIRED_VALUE').should('have.value', '')
    catalogModal().contains('button', 'Add to template').should('be.disabled')
    catalogModal().find('#root_envVars_REQUIRED_VALUE').type(requiredValue)
    catalogModal().contains('button', 'Add to template').should('not.be.disabled').click()
    cy.get('[role="dialog"]:visible').should('not.exist')
  },

  /** Verify the catalog-backed OS and application are present in fleet review. */
  expectCatalogInheritanceReview: (osItemName, appItemName, channel, version) => {
    const reviewText = (text) => cy.contains(text, { timeout: 30000 }).scrollIntoView().should('be.visible')
    reviewText('System image')
    reviewText('Application workloads')
    reviewText(osItemName)
    reviewText(appItemName)
    reviewText(channel)
    reviewText(version)
  },

  /** Verify saved catalog references and informational status in the fleet edit wizard. */
  expectCatalogInheritanceTemplate: (osItemName, appItemName, channel, version) => {
    const catalogItems = [osItemName, appItemName]
    catalogItems.forEach((itemName) => {
      cy.contains('.fctl-catalog-ref-card', itemName, { timeout: 60000 })
        .scrollIntoView({ block: 'center' })
        .should('be.visible')
        .within(() => {
          cy.contains('Update available').should('be.visible')
          cy.get('button[aria-label="Expand"]').click()
          cy.contains('dt', 'Channel')
            .closest('.pf-v6-c-description-list__group')
            .find('dd')
            .should('contain.text', channel)
          cy.contains('dt', 'Version')
            .closest('.pf-v6-c-description-list__group')
            .find('dd')
            .should('contain.text', version)
        })
    })
    cy.get('#selectfield-version-menu:visible').should('not.exist')
  },

  /** Return to fleet details without changing the edit wizard. */
  closeWizardWithoutChanges: () => {
    cy.get('[data-testid="wizard-cancel-button"]').should('be.visible').click()
    cy.get('body').then(($body) => {
      const discard = $body.find('button').filter((_, button) =>
        (button.textContent || '').includes('Discard changes'))
      if (discard.length) cy.wrap(discard.first()).click()
    })
    cy.get('[data-testid="wizard-cancel-button"]').should('not.exist')
  },

  openFleetDetails: (fleetName) => {
    common.navigateTo('Fleets')
    cy.contains('td', fleetName, { timeout: 60000 }).should('be.visible').click()
    cy.contains(fleetName, { timeout: 60000 }).should('be.visible')
  },

  /** Open the fleet Catalog tab and wait for installed catalog-backed software. */
  openFleetCatalogTab: () => {
    cy.contains('button[role="tab"]', 'Catalog', { timeout: 60000 }).should('be.visible').click()
    cy.contains('Deployed Software', { timeout: 60000 }).should('be.visible')
  },

  /** Assert one installed catalog item version and its per-item update state. */
  expectCatalogItemState: (itemName, version, updateAvailable) => {
    catalogItemScope(itemName).should('contain.text', version).within(() => {
      const updateButton = cy.contains('button', 'Update available')
      if (updateAvailable) {
        updateButton.should('be.visible')
      } else {
        updateButton.should('not.exist')
      }
    })
  },

  /** Update one catalog-backed item and return to the fleet Catalog tab. */
  updateCatalogItem: (itemName, channel, currentVersion, targetVersion) => {
    catalogItemScope(itemName).contains('button', 'Update available', { timeout: 30000 }).click()
    cy.contains('h3', 'Version update', { timeout: 30000 }).should('be.visible')
    cy.contains('Target channel').parents('.pf-v6-l-grid').first().should('contain.text', channel)
    cy.contains('Current version').parents('.pf-v6-l-grid').first().should('contain.text', currentVersion)
    cy.contains('Target version').parents('.pf-v6-l-grid').first().should('contain.text', targetVersion)
    cy.get('#selectfield-channel-menu:visible, #selectfield-version-menu:visible').should('not.exist')
    cy.get('[data-testid="wizard-next-button"]', { timeout: 30000 }).should('not.be.disabled').click()
    cy.get('[data-testid="wizard-save-button"]', { timeout: 30000 }).should('be.visible').click()
    cy.contains('Update configuration successful', { timeout: 60000 }).should('be.visible')
    cy.contains('button', 'Return to fleet catalog', { timeout: 30000 }).should('be.visible').click()
    cy.contains('Deployed Software', { timeout: 60000 }).should('be.visible')
  },

  /**
   * Create a new fleet
   */
  createFleet: (img = Cypress.env('image'), fleetname = Cypress.env('fleetname')) => {
    common.navigateTo('Fleets')

    cy.get('[data-testid="toolbar-create-fleet"]', { timeout: 10000 }).first().should('be.visible')
    cy.get('[data-testid="toolbar-create-fleet"]').first().click()
    cy.get('[data-testid="rich-validation-field-name"]').should('be.visible')
    cy.get('[data-testid="rich-validation-field-name"]').type(fleetname)
    cy.get('[data-testid="rich-validation-field-name"]').should('have.value', fleetname)
    // Blur the name field so Formik validates. OCP 4.20 clicked the LabelGroup list
    // (removed in newer PF / EditableLabelControl). Do not add a selector label here —
    // createFleet historically submitted with an empty device selector.
    cy.get('[data-testid="rich-validation-field-name"]').blur()
    cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
    systemImageInput().should('be.visible').type(img)
    systemImageInput().should('have.value', img)
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="wizard-save-button"]').click()
  },

  /**
   * Open the Edit fleet configurations wizard on General info.
   */
  openEditFleetWizard: (fleetname) => {
    common.navigateTo('Fleets')

    cy.get(`[data-testid="fleet-row-actions-${fleetname}"] .pf-v6-c-menu-toggle`, { timeout: 60000 })
      .should('be.visible')
      .click()
    cy.contains('.pf-v6-c-menu__item-text', 'Edit fleet configurations', { timeout: 30000 })
      .should('be.visible')
      .click()
    cy.contains('h1', 'Edit fleet', { timeout: 30000 }).should('be.visible')
  },

  /**
   * Edit an existing fleet
   */
  editFleet: (fleetname = Cypress.env('fleetname'), img1 = Cypress.env('newimage')) => {
    fleetsPage.openEditFleetWizard(fleetname)
    cy.get('.pf-v6-c-form__label-text').first().should('contain', 'Fleet name')
    cy.get('[data-testid="wizard-next-button"]').click()
    systemImageInput().should('be.visible').clear().type(img1)
    systemImageInput().should('have.value', img1)
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="wizard-save-button"]').click()
    cy.get('.pf-v6-c-title').should('contain', fleetname)
  },

  /**
   * Delete a fleet
   */
  deleteFleet: (fleetname = Cypress.env('fleetname')) => {
    common.navigateTo('Fleets')
    
    cy.contains('td', fleetname, { timeout: 10000 }).should('be.visible')
    cy.contains('td', fleetname).closest('tr').find('input[type="checkbox"]').click()
    cy.get('[data-testid="toolbar-delete-fleets"]').should('be.visible')
    cy.get('[data-testid="toolbar-delete-fleets"]').click()
    cy.get('[data-testid="modal-delete-fleets-confirm"]').should('be.visible')
    cy.get('[data-testid="modal-delete-fleets-confirm"]').click()
  },

  /**
   * Import a fleet from repository
   */
  importFleet: (repo = Cypress.env('repository'), fleetname = Cypress.env('fleetname'), resource = Cypress.env('resource'), resourcename = Cypress.env('resourcename'), revision = Cypress.env('revision')) => {
    common.navigateTo('Fleets')
    
    cy.get('[data-testid="toolbar-import-fleets"]', { timeout: 10000 }).first().should('be.visible')
    cy.get('[data-testid="toolbar-import-fleets"]').first().click()
    cy.get('[data-testid="rich-validation-field-name"]').type(fleetname)
    cy.get('[data-testid="textfield-url"]').type(repo)
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="rich-validation-field-resourceSyncs[0].name"]').clear()
    cy.get('[data-testid="rich-validation-field-resourceSyncs[0].name"]').type('test-resource')
    cy.get('[data-testid="textfield-resourceSyncs[0].targetRevision"]').clear()
    cy.get('[data-testid="textfield-resourceSyncs[0].targetRevision"]').type(revision)
    cy.get('[data-testid="textfield-resourceSyncs[0].path"]').clear()
    cy.get('[data-testid="textfield-resourceSyncs[0].path"]').type(resourcename)
    cy.get('[data-testid="wizard-next-button"]').should('be.visible')
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="wizard-save-button"]').click()
    cy.get('td[data-label="Status"]', { timeout: 1000000 }).should('contain', 'Valid')
  },
}
