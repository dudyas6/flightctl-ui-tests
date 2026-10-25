import { common, systemImageInput } from './common'

/** Fleet name validation: red error icon color when invalid */
const VALIDATION_ERROR_ICON_COLOR = '#b1380b'
const CATALOG_MODAL = '[role="dialog"]:visible'

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const catalogModal = () => cy.get(CATALOG_MODAL).last()

const catalogConfiguration = () => cy.get('body').then(($body) => {
  const dialogs = $body.find(CATALOG_MODAL)
  return cy.wrap(dialogs.length ? dialogs.last() : $body)
})

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

const matchingCatalogItemAncestors = ($parents, itemName, requiredText) => $parents.filter((_, element) => {
    const candidate = Cypress.$(element)
    const text = candidate.text()
    return text.includes(itemName) && text.includes(requiredText) && candidate.find('button').length > 0 && text.length < 1500
  })

const catalogItemScope = (itemName, requiredText = '') => cy.contains(itemName, { timeout: 60000 })
  .parents()
  .should(($parents) => {
    expect(matchingCatalogItemAncestors($parents, itemName, requiredText).length)
      .to.be.greaterThan(0)
  })
  .then(($parents) => cy.wrap(matchingCatalogItemAncestors($parents, itemName, requiredText).first()))

const catalogItemActionScope = (itemName) => cy.contains(itemName, { timeout: 60000 })
  .parents()
  .should(($parents) => {
    const matches = $parents.filter((_, element) => {
      const candidate = Cypress.$(element)
      return candidate.text().includes(itemName) && candidate.text().length < 1500
        && candidate.find('button:visible').length > 1
    })
    expect(matches.length, `catalog item action scope for ${itemName}`).to.be.greaterThan(0)
  })
  .then(($parents) => cy.wrap($parents.filter((_, element) => {
    const candidate = Cypress.$(element)
    return candidate.text().includes(itemName) && candidate.text().length < 1500
      && candidate.find('button:visible').length > 1
  }).first()))

const catalogDialogButton = (pattern) =>
  catalogModal().contains('button', pattern, { timeout: 30000 }).should('be.visible')

const matchingApplicationPickerAncestors = ($parents) => $parents.filter((_, element) => {
  const candidate = Cypress.$(element)
  const buttons = candidate.find('button').toArray()
  const hasCatalogButton = buttons.some((button) => (button.textContent || '').trim() === 'Add from software catalog')
  const hasManualButton = buttons.some((button) => /^Add application( manually)?$/.test((button.textContent || '').trim()))
  return hasCatalogButton && hasManualButton
})

const openCatalogPicker = (application = false) => {
  if (!application) {
    cy.contains('button', 'Add from software catalog', { timeout: 30000 }).first().click()
    return
  }

  cy.contains('button', /^Add application( manually)?$/, { timeout: 30000 })
    .parents()
    .should(($parents) => {
      expect(matchingApplicationPickerAncestors($parents).length)
        .to.be.greaterThan(0)
    })
    .then(($parents) => {
      const section = matchingApplicationPickerAncestors($parents).first()
      const catalogButton = Cypress.$(section).find('button').filter((_, element) =>
        (element.textContent || '').trim() === 'Add from software catalog',
      ).first()
      expect(catalogButton.length, 'application catalog picker').to.equal(1)
      cy.wrap(catalogButton).click()
    })
}

const applicationFieldSelector = (index, field) =>
  [
    `[id="textfield-applications[${index}].app.${field}"]`,
    `[id="textfield-applications[${index}].${field}"]`,
  ].join(', ')

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
    openCatalogPicker()
    catalogModal().should('contain', 'Add system image from Software Catalog')
    selectCatalogItem(itemName)
    selectCatalogValue('selectfield-channel-menu', channel)
    selectCatalogValue('selectfield-version-menu', version)
    catalogModal().contains('button', 'Add to template').should('be.visible').click()
    cy.get('[role="dialog"]:visible').should('not.exist')
  },

  /** Add a pinned application catalog reference to the open fleet wizard. */
  addCatalogApplication: (itemName, channel, version) => {
    openCatalogPicker(true)
    catalogModal().should('contain', 'Add application from Software Catalog')
    selectCatalogItem(itemName)
    selectCatalogValue('selectfield-channel-menu', channel)
    selectCatalogValue('selectfield-version-menu', version)
    catalogModal().contains('button', 'Add to template').should('be.visible').click()
    cy.get('[role="dialog"]:visible').should('not.exist')
  },

  /** Open the catalog application picker without selecting an item. */
  openCatalogApplicationPicker: () => {
    openCatalogPicker(true)
    catalogModal().should('contain', 'Add application from Software Catalog')
  },

  /** Verify that an application catalog item is or is not offered by the picker. */
  expectCatalogApplicationAvailability: (itemName, available) => {
    catalogModal().find('input[placeholder="Search by name"]').clear().type(itemName, { delay: 0 })
    if (available) {
      catalogModal().find(`[aria-label="Select ${itemName}"]`).should('be.visible')
    } else {
      catalogModal().find(`[aria-label="Select ${itemName}"]`).should('not.exist')
    }
  },

  /** Complete a catalog application selection and open its advanced configuration step. */
  openCatalogApplicationConfiguration: (itemName, channel, version) => {
    selectCatalogItem(itemName)
    selectCatalogValue('selectfield-channel-menu', channel)
    selectCatalogValue('selectfield-version-menu', version)
    catalogModal().find('input[type="checkbox"]:visible').then(($checkboxes) => {
      if ($checkboxes.length && !$checkboxes.first().is(':checked')) {
        cy.wrap($checkboxes.first()).check({ force: true })
      }
    })
    catalogModal().contains('button', /^Next$/).should('be.visible').click()
    catalogModal().should('be.visible')
  },

  /** Verify schema-backed configuration exposes both Form and YAML views. */
  expectCatalogConfigurationViews: () => {
    catalogConfiguration().contains(/^(Form|Form view)$/).should('be.visible')
    catalogConfiguration().contains(/^(YAML|YAML view)$/).should('be.visible')
  },

  /** Verify a no-schema configuration exposes YAML but not a Form view. */
  expectCatalogYamlOnlyConfiguration: () => {
    catalogConfiguration().contains(/^(YAML|YAML view)$/).should('be.visible')
    catalogConfiguration().contains(/^(Form|Form view)$/).should('have.class', 'pf-m-disabled')
  },

  /** Verify advanced configuration cannot be submitted while a required field is empty. */
  expectCatalogConfigurationRequired: () => {
    catalogConfiguration().contains('Provide any required values', { timeout: 30000 }).should('be.visible')
    catalogConfiguration().find('input:visible, textarea:visible').should(($fields) => {
      expect($fields.toArray().some((field) => field.value === ''), 'an unsatisfied required field').to.be.true
    })
  },

  /** Verify a catalog default appears in the Form view. */
  expectCatalogDefaultValue: (value) => {
    catalogConfiguration().find('input, textarea').should(($fields) => {
      const hasDefault = $fields.toArray().some((field) => field.value === value || field.getAttribute('value') === value)
      expect(hasDefault, `catalog default value ${value}`).to.be.true
    })
  },

  /** Fill the first visible non-search configuration input in a catalog dialog. */
  fillCatalogRequiredConfiguration: (value) => {
    catalogConfiguration()
      .find('input, textarea')
      .then(($fields) => {
        const field = $fields.filter((_, element) => {
          const type = (element.getAttribute('type') || '').toLowerCase()
          return !element.disabled && type !== 'hidden' && type !== 'radio'
            && element.getAttribute('placeholder') !== 'Search by name'
        }).last()
        expect(field.length, 'catalog configuration input').to.equal(1)
        cy.wrap(field).scrollIntoView().clear().type(value, { delay: 0 })
      })
  },

  /** Complete an advanced catalog application dialog. */
  completeCatalogApplicationConfiguration: () => {
    catalogModal()
      .contains('button', /^(Add to template|Save|Save changes|Add)$/, { timeout: 30000 })
      .should('exist')
      .click({ force: true })
    cy.get('[role="dialog"]:visible').should('not.exist')
  },

  /** Open Edit for an installed catalog item from the resource Catalog tab. */
  openCatalogItemEdit: (itemName) => {
    catalogItemActionScope(itemName)
      .find('button:visible')
      .then(($buttons) => {
        expect($buttons.length, `catalog actions for ${itemName}`).to.be.greaterThan(1)
        cy.wrap($buttons.last()).should('be.visible').click()
      })
    cy.get('[role="menu"]:visible').contains(/Edit/).should('be.visible').click()
    cy.contains('Version update', { timeout: 30000 }).should('be.visible')
  },

  /** Save a Catalog-tab Edit dialog and return to the resource Catalog tab. */
  saveCatalogItemEdit: () => {
    cy.get('[data-testid="wizard-next-button"]', { timeout: 30000 }).then(($next) => {
      if (!$next.is(':disabled')) cy.wrap($next).click()
    })
    cy.get('[data-testid="wizard-save-button"]', { timeout: 30000 }).should('be.visible').click()
    cy.contains('Update configuration successful', { timeout: 60000 }).should('be.visible')
    cy.contains('button', 'Return to fleet catalog', { timeout: 30000 }).click()
    cy.contains('Deployed Software', { timeout: 60000 }).should('be.visible')
  },

  /** Assert the current and reachable versions in the Catalog-tab Edit picker. */
  expectCatalogVersionOptions: (versions, excludedVersions = []) => {
    cy.get('#selectfield-version-menu:visible', { timeout: 30000 }).should('be.visible').click()
    versions.forEach((version) => {
      cy.get('[role="option"]:visible').contains(version).should('be.visible')
    })
    excludedVersions.forEach((version) => {
      cy.get('[role="option"]:visible').should('not.contain', version)
    })
    cy.get('body').type('{esc}')
  },

  /** Assert Catalog-tab Update locks the channel and version controls. */
  expectCatalogUpdateControlsLocked: () => {
    cy.get('#selectfield-channel-menu:visible, #selectfield-version-menu:visible', { timeout: 30000 })
      .should(($controls) => {
        expect($controls.length).to.be.greaterThan(0)
        $controls.each((_, control) => {
          expect(
            control.disabled || control.getAttribute('aria-disabled') === 'true',
            `catalog update control ${control.id} is locked`,
          ).to.be.true
        })
      })
  },

  /** Confirm a manual application entry can still be created separately. */
  addManualApplication: (image, index = 0) => {
    cy.contains('button', /^Add application( manually)?$/, { timeout: 30000 }).click()
    const appTypeMenu = `[id="selectfield-applications[${index}].appType-menu"], [id="selectfield-applications[${index}].appType"]`
    cy.get(appTypeMenu).first().click()
    cy.contains('[role="option"]:visible', 'Container').click()
    cy.get(applicationFieldSelector(index, 'image')).first().clear().type(image, { delay: 0 })
    cy.get(applicationFieldSelector(index, 'image')).first().should('have.value', image)
  },

  /** Remove a catalog application from the open fleet wizard. */
  removeCatalogApplication: (itemName) => {
    catalogItemScope(itemName)
      .find('button[aria-label="Delete application"], button[aria-label="Remove application"]')
      .first()
      .click()
  },

  /** Verify the manual application path is still available. */
  expectManualApplicationPath: () => {
    cy.contains('button', /^Add application( manually)?$/, { timeout: 30000 }).should('be.visible')
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
    cy.contains('button', 'Update available').should('not.exist')
  },

  /** Verify catalog references already present in the fleet edit wizard template. */
  expectCatalogInheritanceTemplate: (osItemName, appItemName, options = {}) => {
    cy.contains('System image', { timeout: 30000 }).scrollIntoView().should('be.visible')
    cy.contains('Application workloads', { timeout: 30000 }).scrollIntoView().should('be.visible')
    const catalogItems = [osItemName, appItemName].filter(Boolean)
    catalogItems.forEach((itemName) => {
      catalogItemScope(itemName, 'Software Catalog')
        .scrollIntoView()
        .should('contain.text', 'Software Catalog')
    })
    if (options.updateAvailable) {
      cy.get('body', { timeout: 30000 }).should(($body) => {
        const updateTextCount = ($body.text().match(/Update available/g) || []).length
        expect(updateTextCount).to.be.at.least(catalogItems.length)
      })
    } else if (options.updateAvailable === false) {
      cy.contains('button', 'Update available').should('not.exist')
    }
    cy.get('#selectfield-version-menu:visible').should('not.exist')
  },

  /** Open the fleet Catalog tab and wait for installed catalog-backed software. */
  openFleetDetails: (fleetName) => {
    common.navigateTo('Fleets')
    cy.contains('td', fleetName, { timeout: 60000 }).should('be.visible').click()
    cy.contains(fleetName, { timeout: 60000 }).should('be.visible')
  },

  openFleetCatalogTab: () => {
    cy.contains('button[role="tab"]', 'Catalog', { timeout: 60000 }).should('be.visible').click()
    cy.contains('Deployed Software', { timeout: 60000 }).should('be.visible')
  },

  /** Assert one installed catalog item version and its per-item update state. */
  expectCatalogItemState: (itemName, version, updateAvailable) => {
    catalogItemScope(itemName, version).should('contain.text', version, { timeout: 60000 })
    if (updateAvailable) {
      catalogItemScope(itemName, 'Update available').contains('Update available').should('be.visible')
    } else {
      catalogItemScope(itemName).contains('Update available').should('not.exist')
    }
  },

  /** Update one catalog-backed item and return to the fleet Catalog tab. */
  updateCatalogItem: (itemName, targetVersion, options = {}) => {
    catalogItemScope(itemName, 'Update available').contains('Update available', { timeout: 30000 }).click()
    if (options.locked) fleetsPage.expectCatalogUpdateControlsLocked()
    cy.contains(targetVersion, { timeout: 60000 }).should('be.visible')
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

  /** Close an edit wizard without saving changes. */
  closeWizardWithoutChanges: () => {
    cy.get('[data-testid="wizard-cancel-button"]').should('be.visible').click()
    cy.get('body').then(($body) => {
      const discardButton = $body.find('button').filter((_, element) =>
        (element.textContent || '').includes('Discard changes'),
      )
      if (discardButton.length) cy.wrap(discardButton.first()).click()
    })
    cy.get('[data-testid="wizard-cancel-button"]').should('not.exist')
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
