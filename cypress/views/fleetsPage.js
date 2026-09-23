import { common } from './common'

/** Fleet name validation: red error icon color when invalid */
const VALIDATION_ERROR_ICON_COLOR = '#b1380b'

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

  /**
   * Create a new fleet
   */
  createFleet: (img = Cypress.env('image'), fleetname = Cypress.env('fleetname')) => {
    common.navigateTo('Fleets')

    cy.get('[data-testid="toolbar-create-fleet"]', { timeout: 10000 }).first().should('be.visible')
    cy.get('[data-testid="toolbar-create-fleet"]').first().click()
    cy.get('[data-testid="rich-validation-field-name"]').should('be.visible')
    cy.get('[data-testid="rich-validation-field-name"]').type(fleetname)
    cy.get('[data-testid="rich-validation-field-name"]').should('have.value', 'test-fleet')
    // Blur the name field so Formik validates. OCP 4.20 clicked the LabelGroup list
    // (removed in newer PF / EditableLabelControl). Do not add a selector label here —
    // createFleet historically submitted with an empty device selector.
    cy.get('[data-testid="rich-validation-field-name"]').blur()
    cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
    cy.get('[data-testid="textfield-osSpec"]').should('be.visible')
    cy.get('[data-testid="textfield-osSpec"]').type(img)
    cy.get('[data-testid="textfield-osSpec"]').should('have.value', img)
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="wizard-save-button"]').click()
  },

  /**
   * Edit an existing fleet
   */
  editFleet: (fleetname = Cypress.env('fleetname'), img1 = Cypress.env('newimage')) => {
    common.navigateTo('Fleets')
    
    cy.get(`[data-testid="fleet-row-actions-${fleetname}"] .pf-v6-c-menu-toggle`).should('be.visible').click()
    cy.contains('.pf-v6-c-menu__item-text', 'Edit fleet configurations').should('be.visible').click()
    cy.get('.pf-v6-c-form__label-text').first().should('contain', 'Fleet name')
    cy.get('[data-testid="wizard-next-button"]').click()
    cy.get('[data-testid="textfield-osSpec"]').should('be.visible')
    cy.get('[data-testid="textfield-osSpec"]').clear()
    cy.get('[data-testid="textfield-osSpec"]').type(img1)
    cy.get('[data-testid="textfield-osSpec"]').should('have.value', img1)
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
