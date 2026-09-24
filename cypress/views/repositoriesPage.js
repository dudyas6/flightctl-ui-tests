import { common } from './common'

/** Validation error icon on invalid fields (matches devicesPage) */
const VALIDATION_ERROR_ICON_COLOR = '#b1380b'

/**
 * Illegal repository name samples (popover rules: charset, start/end alphanumeric, length).
 */
const INVALID_REPOSITORY_NAMES = [
  'INVALID_NAME', // uppercase + underscore
  '-badprefix', // must not start with dash
  'badsuffix-', // must not end with dash
  'my repo', // spaces not allowed
  'repo$money', // only lowercase, digits, - and .
]

/** URL must start with http:// or https:// — these do not */
const INVALID_REPOSITORY_URLS = [
  '123',
  'ftp://example.com/repo',
  'www.example.com/repo',
  '//example.com',
  'http', // not http://
]

const REPOSITORY_URL_ERROR_HELPER_TEXT = 'Enter a valid repository URL'

/** Name field validation popover trigger (RichValidationTextField) */
const REPOSITORY_NAME_VALIDATION_BTN = '[data-testid="rich-validation-field-name-validation-button"]'

/** Resource sync [0] name field validation button */
const RESOURCE_SYNC_0_NAME_VALIDATION_BTN =
  '[data-testid="rich-validation-field-resourceSyncs[0].name-validation-button"]'

/**
 * RepositoriesPage object for repository management operations
 */
export const repositoriesPage = {
  /**
   * Open create form and assert each invalid name triggers the first field validation icon.
   */
  assertIllegalRepositoryNameValuesShowValidation: () => {
    repositoriesPage.openCreateRepositoryForm()
    cy.wrap(INVALID_REPOSITORY_NAMES).each((invalidName) => {
      cy.get('[data-testid="rich-validation-field-name"]').clear()
      cy.get('[data-testid="rich-validation-field-name"]').type(invalidName)
      cy.get('[data-testid="rich-validation-field-name"]').should('have.value', invalidName)
      repositoriesPage.expectFirstValidationIconError()
    })
    repositoriesPage.cancelCreateRepositoryForm()
  },

  /**
   * Open create form, set a valid repository name, then assert invalid URLs show URL helper error text.
   */
  assertIllegalRepositoryUrlValuesShowValidation: () => {
    repositoriesPage.openCreateRepositoryForm()
    cy.get('[data-testid="rich-validation-field-name"]').clear().type('valid-repo-name')
    cy.get('[data-testid="rich-validation-field-name"]').should('have.value', 'valid-repo-name')
    cy.get('[data-testid="textfield-url"]').should('be.visible')
    cy.wrap(INVALID_REPOSITORY_URLS).each((invalidUrl) => {
      cy.get('[data-testid="textfield-url"]').clear()
      cy.get('[data-testid="textfield-url"]').type(invalidUrl)
      cy.get('[data-testid="textfield-url"]').should('have.value', invalidUrl)
      cy.get('[data-testid="textfield-url"]')
        .closest('.pf-v6-c-form__group')
        .find('.pf-v6-c-helper-text__item-text')
        .should('be.visible')
        .and('contain', REPOSITORY_URL_ERROR_HELPER_TEXT)
    })
    repositoriesPage.cancelCreateRepositoryForm()
  },

  /**
   * Open Create repository from the Repositories list (primary toolbar button).
   */
  openCreateRepositoryForm: () => {
    common.navigateTo('Repositories')
    cy.get('[data-testid="toolbar-create-repository"]').should('be.visible').click()
    cy.get('[data-testid="rich-validation-field-name"]').should('be.visible')
  },

  /**
   * Assert the first validation icon on the page shows error state (#b1380b on nested SVG).
   */
  expectFirstValidationIconError: () => {
    cy.get(REPOSITORY_NAME_VALIDATION_BTN).should('be.visible')
    cy.get(REPOSITORY_NAME_VALIDATION_BTN).find('svg').should('have.attr', 'color', VALIDATION_ERROR_ICON_COLOR)
  },

  /**
   * Second validation icon on create-repository form (resource sync name field).
   * Same control as first: button.pf-v6-c-button.pf-m-plain with aria-label="Validation"; SVG color #b1380b.
   */
  expectSecondValidationIconError: () => {
    cy.get(RESOURCE_SYNC_0_NAME_VALIDATION_BTN).should('be.visible')
    cy.get(RESOURCE_SYNC_0_NAME_VALIDATION_BTN)
      .find('svg')
      .should('have.attr', 'color', VALIDATION_ERROR_ICON_COLOR)
  },

  /**
   * Resource sync name field on create form (same naming rules as repository name).
   */
  assertIllegalResourceSyncNameValuesShowValidation: () => {
    const resourceSyncNameField = '[data-testid="rich-validation-field-resourceSyncs[0].name"]'
    const validUrl = Cypress.env('repository') || 'https://github.com/flightctl/flightctl-demos'

    repositoriesPage.openCreateRepositoryForm()
    cy.get('[data-testid="rich-validation-field-name"]').clear().type('valid-repo-name')
    cy.get('[data-testid="textfield-url"]').clear().type(validUrl)
    cy.get('[data-testid="textfield-url"]').should('have.value', validUrl)
    cy.get('[data-testid="repository-form-use-resource-syncs"]').then(($cb) => {
      if (!$cb.is(':checked')) {
        cy.wrap($cb).check({ force: true })
      }
    })
    cy.get(resourceSyncNameField).should('be.visible')
    cy.wrap(INVALID_REPOSITORY_NAMES).each((invalidName) => {
      cy.get(resourceSyncNameField).clear()
      cy.get(resourceSyncNameField).type(invalidName)
      cy.get(resourceSyncNameField).should('have.value', invalidName)
      repositoriesPage.expectSecondValidationIconError()
    })
    repositoriesPage.cancelCreateRepositoryForm()
  },

  /**
   * Leave the create-repository form without submitting (Cancel).
   */
  cancelCreateRepositoryForm: () => {
    cy.get('[data-testid="repository-form-cancel"]').click()
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
   * Create a new repository
   */
  createRepository: (reponame = Cypress.env('repositoryname'), repo = Cypress.env('repository'), revision = Cypress.env('revision'), resource = Cypress.env('resource')) => {
    common.navigateTo('Repositories')

    cy.get('[data-testid="toolbar-create-repository"]').should('be.visible')
    cy.get('[data-testid="toolbar-create-repository"]').click()
    cy.get('[data-testid="rich-validation-field-name"]').should('be.visible')
    cy.get('[data-testid="rich-validation-field-name"]').type('test-repository')
    cy.get('[data-testid="rich-validation-field-name"]').should('have.value', 'test-repository')
    cy.get('[data-testid="repository-form-use-resource-syncs"]').should('be.visible')
    cy.get('[data-testid="textfield-url"]').type(repo)
    cy.get('[data-testid="textfield-url"]').should('have.value', repo)
    cy.get('.pf-v6-c-form__section').should('be.visible')
    cy.contains('Resource sync name').type('test-resource')
    cy.get('[data-testid="textfield-resourceSyncs[0].targetRevision"]').type(revision)
    cy.get('[data-testid="textfield-resourceSyncs[0].path"]').type(resource)
    cy.get('[data-testid="repository-form-submit"]').click()
    cy.get('[data-testid="repository-details-sync-status"]', { timeout: 100000 }).should('contain', 'Available')
  },

  /**
   * Edit an existing repository
   */
  editRepository: (reponame = Cypress.env('repositoryname'), newyaml = Cypress.env('newyaml'), resourcename = Cypress.env('resourcename'), revision = Cypress.env('revision')) => {
    common.navigateTo('Repositories')

    cy.contains('[data-testid^="repository-name-link-"]', Cypress.env('fleetname')).should('be.visible')
    cy.contains('[data-testid^="repository-name-link-"]', Cypress.env('fleetname'))
      .closest('tr')
      .find('[data-testid^="repository-row-actions-"] .pf-v6-c-menu-toggle')
      .click()
    cy.contains('.pf-v6-c-menu__item-text', 'Edit repository').should('be.visible').click()
    cy.get('[data-testid="repository-add-resource-sync-button"]').click()
    const newResourceSyncName =
      '[data-testid^="rich-validation-field-resourceSyncs["][data-testid$=".name"]'
    const newResourceSyncRevision =
      '[data-testid^="textfield-resourceSyncs["][data-testid$=".targetRevision"]'
    const newResourceSyncPath =
      '[data-testid^="textfield-resourceSyncs["][data-testid$=".path"]'

    cy.get(newResourceSyncName).filter(':visible').last().should('be.visible').clear().type('test-resource1')
    cy.get(newResourceSyncName).filter(':visible').last().should('have.value', 'test-resource1')
    cy.get(newResourceSyncRevision).filter(':visible').last().type(revision)
    cy.get(newResourceSyncPath).filter(':visible').last().clear().type(newyaml)
    cy.get('[data-testid="repository-form-submit"]').click()
    cy.get('[data-testid="repository-details-sync-status"]', { timeout: 100000 }).should('contain', 'Available')
  },

  /**
   * Delete a repository
   */
  deleteRepository: (reponame = Cypress.env('repositoryname')) => {
    common.navigateTo('Repositories')

    cy.get('[data-testid="repositories-table"]').should('contain', reponame)
    cy.contains('[data-testid^="repository-name-link-"]', reponame)
      .closest('tr')
      .find('input[type="checkbox"]')
      .should('be.visible')
      .click()
    cy.get('[data-testid="toolbar-delete-repositories"]').should('be.visible')
    cy.get('[data-testid="toolbar-delete-repositories"]').click()
    cy.get('[data-testid="modal-delete-repositories-confirm"]').should('be.visible')
    cy.get('[data-testid="modal-delete-repositories-confirm"]').click()
  },
}
