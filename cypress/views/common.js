/**
 * Common utilities for test operations
 */

/**
 * Device details "Fleet" field. Newer flightctl-ui (OCP 4.22) uses a DescriptionList
 * term labeled "Fleet"; OCP 4.20 still uses `.fctl-device-details-tab__label` + "Fleet name".
 * Returns a chainable scoped to the field's parent row.
 */
export const deviceDetailsFleetRow = (timeout = 60000) => {
  const termOrLegacyLabel = [
    'dt.pf-v6-c-description-list__term',
    '.fctl-device-details-tab__label',
  ].join(', ')
  const row = [
    '.pf-v6-c-description-list__group',
    '.pf-v6-l-stack',
  ].join(', ')
  return cy.contains(termOrLegacyLabel, /^(Fleet name|Fleet)$/, { timeout }).closest(row)
}

/** True after org selection was handled or confirmed absent — only run once per spec (first navigateTo). */
let organizationSelectionHandled = false

export const common = {
  /**
   * Visit a deep URL, translating /devicemanagement/ to /edge/ in ACM mode.
   * @param {string} url - Full URL to visit
   * @param {number} waitMs - ms to wait after visiting (default 2000)
   */
  visitPage: (url, waitMs = 2000) => {
    const resolvedUrl = Cypress.env('useAcmNavigation')
      ? url.replace(/\/devicemanagement\//, '/edge/')
      : url
    cy.visit(resolvedUrl, { timeout: 60000, retryOnStatusCodeFailure: true })
    cy.wait(waitMs)
  },

  /**
   * Navigate to a page (supports both ACM multi-level nav and flat nav).
   * @param {string} page - The page to navigate to (e.g., 'Devices', 'Fleets', 'Repositories', 'Overview')
   */
  navigateTo: (page) => {
    /** Standalone: data-testid + id on masthead toggle; ACM may use #nav-toggle only */
    const navToggle = '[data-testid="nav-toggle"], #page-toggle-button, #nav-toggle'

    if (Cypress.env('useAcmNavigation')) {
      // Overview is not a nav item under Edge Management — it's the ACM multicloud overview
      // page with an injected "Edge devices" tab (acm.overview/tab extension).
      if (page === 'Overview') {
        cy.visit(`${Cypress.env('host')}/multicloud/home/overview`, { timeout: 60000 })
        cy.contains('[role="tab"]', 'Edge devices', { timeout: 30000 }).should('be.visible').click()
        common.selectOrganizationIfNeeded('Default')
        return
      }

      const acmSidebar = '.pf-v6-c-page__sidebar'
      cy.get(navToggle, { timeout: 30000 }).should('exist')
      // Only open the sidebar if it's collapsed (clicking when open would close it)
      cy.get('body').then(($body) => {
        const sidebarExpanded =
          $body.find('.pf-v6-c-page__sidebar.pf-m-expanded').length > 0 ||
          $body.find(navToggle).attr('aria-expanded') === 'true'
        if (!sidebarExpanded) {
          cy.get(navToggle).first().click()
        }
      })
      cy.get(acmSidebar, { timeout: 30000 }).should('be.visible')
      cy.wait(1000)
      // If 'Edge Management' is absent the Fleet Management perspective may have been lost
      // (e.g. a prior test failure left the browser on an ACM page outside the perspective).
      // Select the perspective again and re-open the sidebar so the nav items appear.
      cy.get('body').then(($body) => {
        if ($body.find('button:contains("Edge Management")').length === 0) {
          cy.log('⚠ "Edge Management" not in sidebar — re-selecting Fleet Management perspective')
          cy.get('[data-test-id="perspective-switcher-toggle"]', { timeout: 10000 })
            .should('be.visible')
            .click()
          cy.get('[data-test-id="perspective-switcher-menu-option"]')
            .contains('Fleet management')
            .should('be.visible')
            .click()
          // After perspective switch the sidebar may collapse — re-open if needed
          cy.get('body').then(($b2) => {
            const expanded =
              $b2.find('.pf-v6-c-page__sidebar.pf-m-expanded').length > 0 ||
              $b2.find(navToggle).attr('aria-expanded') === 'true'
            if (!expanded) {
              cy.get(navToggle).first().click()
            }
          })
          cy.get(acmSidebar, { timeout: 30000 }).should('be.visible')
          cy.wait(500)
        }
      })
      // Re-query on click: wrap($btn) can fail if the nav re-renders after sidebar opens.
      cy.contains('button', 'Edge Management', { timeout: 30000 })
        .should('be.visible')
        .then(($btn) => {
          if ($btn.attr('aria-expanded') === 'true') {
            return
          }
          cy.contains('button', 'Edge Management').should('be.visible').click()
        })
      // Wait for the sidebar to finish re-rendering before querying the nav link.
      // ACM re-renders the sidebar after expanding Edge Management; clicking too
      // soon grabs a stale reference that detaches mid-click and lands on a wrong page.
      cy.wait(500)
      cy.contains(`${acmSidebar} a, ${acmSidebar} button`, page, { timeout: 15000 })
        .should('be.visible')
        .then(() => {
          // Re-query fresh to avoid holding a stale reference from the assertion above.
          cy.contains(`${acmSidebar} a, ${acmSidebar} button`, page).click()
        })
      common.selectOrganizationIfNeeded('Default')
    } else {
      const sidebar = '.pf-v6-c-page__sidebar'
      // Overview in standalone: use the sidebar nav item directly
      if (page === 'Overview') {
        common.selectOrganizationIfNeeded('Default')
        cy.get(navToggle, { timeout: 30000 }).should('exist')
        cy.get('body').then(($body) => {
          const toggle = $body.find(navToggle).first()
          const sidebarExpanded = toggle.attr('aria-expanded') === 'true'
          if (!sidebarExpanded) {
            cy.get(navToggle).first().click()
          }
        })
        cy.get(sidebar).contains('Overview').click()
        return
      }
      common.selectOrganizationIfNeeded('Default')
      cy.get('[data-testid="nav-toggle"], #page-toggle-button', { timeout: 30000 }).should('exist')
      cy.get('body').then(($body) => {
        const toggle = $body.find('[data-testid="nav-toggle"], #page-toggle-button').first()
        const sidebarExpanded = toggle.attr('aria-expanded') === 'true'
        if (!sidebarExpanded) {
          cy.get('[data-testid="nav-toggle"], #page-toggle-button').first().click()
        }
      })
      cy.get(sidebar).contains(page).click()
    }

  },

  /**
   * Select organization if the selection page appears.
   * Runs only the first time in a spec (first `navigateTo`); later calls are no-ops.
   */
  selectOrganizationIfNeeded: (orgName = 'Default', maxRetries = 10, retryDelay = 1000) => {
    if (organizationSelectionHandled) {
      cy.log('Organization selection already handled this run, skipping')
      return
    }

    const markHandled = () => {
      organizationSelectionHandled = true
    }

    const checkForOrgSelection = (attempt = 1) => {
      cy.log(`Checking for organization selection page (attempt ${attempt}/${maxRetries})`)

      cy.wait(retryDelay)

      cy.get('body').then(($body) => {
        if ($body.text().includes('Select Organization')) {
          cy.log(`Organization selection page detected, selecting ${orgName}`)
          cy.contains(orgName).click()
          cy.contains('button', 'Continue').click()
          cy.get('.pf-v6-c-page', { timeout: 30000 }).should('exist')
          cy.then(markHandled)
        } else if (attempt < maxRetries) {
          cy.log(`Organization selection not found yet, retrying...`)
          checkForOrgSelection(attempt + 1)
        } else {
          cy.log('No organization selection page detected after all retries, continuing...')
          markHandled()
        }
      })
    }

    checkForOrgSelection()
  },
}
