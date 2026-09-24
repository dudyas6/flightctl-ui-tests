import { common } from './common'

// ─── Internal helpers (not exported) ─────────────────────────────────────────

/** Click a PatternFly radio or checkbox by its visible label text. */
const clickLabel = (labelText) =>
  cy.contains('label', labelText).should('be.visible').click()

/**
 * Return the first <input> or <textarea> inside the PatternFly form group
 * whose heading contains the given text.
 */
const inputInGroup = (labelText) =>
  cy
    .contains('.pf-v6-c-form__group-label', labelText)
    .closest('.pf-v6-c-form__group')
    .find('input, textarea')
    .first()

/**
 * Open a PatternFly Select/MenuToggle inside the form group whose heading
 * contains labelText, then click the matching option.
 */
const selectInGroup = (labelText, optionText) => {
  cy.contains('.pf-v6-c-form__group-label', labelText)
    .closest('.pf-v6-c-form__group')
    .find('button[aria-haspopup="listbox"], button.pf-v6-c-menu-toggle')
    .should('be.visible')
    .click()
  cy.contains('.pf-v6-c-menu__item-text, li', optionText).should('be.visible').click()
}

// ─── Page object ─────────────────────────────────────────────────────────────

export const buildImagePage = {

  // ── OCI Repository creation ────────────────────────────────────────────────

  navigateToRepositories: () => {
    common.navigateTo('Repositories')
  },

  openCreateRepositoryForm: () => {
    // The toolbar may render separate Git and OCI create buttons under the same testid.
    // Use first() to always target the primary (first) button; revisit if a dedicated
    // OCI testid (e.g. toolbar-create-oci-repository) is added to the UI.
    cy.get('[data-testid="toolbar-create-repository"]').first().should('be.visible').click()
    cy.get('[data-testid="rich-validation-field-name"]').should('be.visible')
  },

  typeRepositoryName: (name) => {
    cy.wait(100)
    cy.get('[data-testid="rich-validation-field-name"]').should('be.visible').type(name)
    cy.get('[data-testid="rich-validation-field-name"]').should('have.value', name)
  },

  selectOciRegistryType: () => {
    clickLabel('Use OCI registry')
  },

  selectReadAndWriteAccessMode: () => {
    cy.get('#radiofield-oci-access-readwrite').check({ force: true })
  },

  typeRegistryHostname: (hostname) => {
    // The hostname field is reset when the type is switched to OCI — always type after switching.
    // The field is labelled "Registry hostname"; fall back to data-testid variants if the label
    // selector ever changes.
    cy.get('body').then(($body) => {
      const byTestId = $body.find('[data-testid="textfield-url"], [data-testid="textfield-hostname"]')
      if (byTestId.length) {
        cy.wrap(byTestId.first()).should('be.visible').clear().type(hostname)
        cy.wrap(byTestId.first()).should('have.value', hostname)
      } else {
        inputInGroup('Registry hostname').should('be.visible').clear().type(hostname)
        inputInGroup('Registry hostname').should('have.value', hostname)
      }
    })
  },

  enableAdvancedConfigurations: () => {
    cy.get('body').then(($body) => {
      const checkbox = $body.find('#use-advanced-configurations')
      if (checkbox.length) {
        cy.wrap(checkbox).check({ force: true })
      } else {
        clickLabel('Use advanced configurations')
      }
    })
  },

  enableBasicAuthentication: () => {
    cy.get('body').then(($body) => {
      const checkbox = $body.find('input[id*="basic-auth"], input[id*="basicAuth"]')
      if (checkbox.length) {
        cy.wrap(checkbox.first()).check({ force: true })
      } else {
        clickLabel('Basic authentication')
      }
    })
  },

  typeUsername: (username) => {
    cy.get('[data-testid="textfield-ociConfig.ociAuth.username"]').scrollIntoView().should('be.visible').type(username)
    cy.get('[data-testid="textfield-ociConfig.ociAuth.username"]').should('have.value', username)
  },

  typePassword: (password) => {
    cy.get('[data-testid="textfield-ociConfig.ociAuth.password"]').should('be.visible').type(password)
  },

  submitRepositoryAndWaitForAccessible: () => {
    cy.get('[data-testid="repository-form-submit"]').should('be.visible').click()
    //cy.get('[data-testid="repository-details-sync-status"]', { timeout: 30000 })
    //  .should('contain', 'Available')
  },

  // ── Wizard entry ───────────────────────────────────────────────────────────

  navigateToImageBuilds: () => {
    common.navigateTo('Image builds')
  },

  clickBuildNewImage: () => {
    cy.contains('button', 'Build new image').should('be.visible').click()
    cy.contains('Build new image').should('be.visible')
  },

  // ── Step 1: Base image ─────────────────────────────────────────────────────

  typeBuildName: (buildName) => {
    inputInGroup('Build name').should('be.visible').type(buildName)
    inputInGroup('Build name').should('have.value', buildName)
  },

  selectSourceRepository: (repoName) => {
    selectInGroup('Source repository', repoName)
  },

  typeSourceImageName: (imageName) => {
    inputInGroup('Image name').should('be.visible').clear().type(imageName)
    inputInGroup('Image name').should('have.value', imageName)
  },

  typeSourceImageTag: (tag) => {
    inputInGroup('Image tag').should('be.visible').clear().type(tag)
    inputInGroup('Image tag').should('have.value', tag)
  },

  waitForImageAccessible: () => {
    cy.contains('Available', { timeout: 30000 }).should('be.visible')
  },

  clickNext: () => {
    cy.contains('button', 'Next').should('be.visible').click()
  },

  // ── Step 2: Image output ───────────────────────────────────────────────────

  selectTargetRepository: (repoName) => {
    selectInGroup('Target repository', repoName)
  },

  typeOutputImageName: (imageName) => {
    inputInGroup('Image name').should('be.visible').clear().type(imageName)
    inputInGroup('Image name').should('have.value', imageName)
  },

  typeOutputImageTag: (tag) => {
    inputInGroup('Image tag').should('be.visible').clear().type(tag)
    inputInGroup('Image tag').should('have.value', tag)
  },

  // ── Step 4: Software Catalog ───────────────────────────────────────────────

  verifySoftwareCatalogCheckboxChecked: () => {
    cy.get('#checkboxfield-promoteToCatalog').should('be.checked')
  },

  typeImagePromotionName: (name) => {
    inputInGroup('Image Promotion name').should('be.visible').type(name)
    inputInGroup('Image Promotion name').should('have.value', name)
  },

  selectDefaultCatalog: () => {
    cy.get('#selectfield-catalog-menu').should('be.visible').click()
    cy.contains('.pf-v6-c-menu__item-text', 'Default').should('be.visible').click()
  },

  selectNewCatalogItem: () => {
    clickLabel('New catalog item')
  },

  typeCatalogItemName: (name) => {
    inputInGroup('Catalog item name').should('be.visible').type(name)
    inputInGroup('Catalog item name').should('have.value', name)
  },

  typeVersion: (version) => {
    inputInGroup('Version').should('be.visible').type(version)
    inputInGroup('Version').should('have.value', version)
  },

  typeReadme: (text) => {
    inputInGroup('Readme').should('be.visible').type(text)
  },

  // ── Step 5: Review ────────────────────────────────────────────────────────

  clickBuildImage: () => {
    cy.get('[data-testid="wizard-save-button"]').should('be.visible').click()
  },

  // ── Post-build: status polling on the Image builds list ───────────────────

  waitForBuildStatusComplete: (buildName, timeout = 600000) => {
    cy.contains('a', buildName, { timeout })
      .closest('tr')
      .find('[data-label="Build status"]', { timeout })
      .should('contain', 'Complete')
  },

  waitForPromotionStatusCompleted: (buildName, timeout = 300000) => {
    cy.contains('a', buildName, { timeout })
      .closest('tr')
      .find('[data-label="Promotion status"]', { timeout })
      .should('contain', 'Completed')
  },
}
