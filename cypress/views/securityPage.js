import { common } from './common'

/**
 * Security/Vulnerability UI selectors and helpers.
 * Used across Device, Fleet, and Overview pages.
 */

const SECURITY_OVERVIEW_TOGGLE = 'button[aria-label="Toggle security details"]'

/** Filter by severity dropdown button */
const SEVERITY_FILTER_TOGGLE = 'button[aria-label="Filter by severity"]'

/** Search/find vulnerabilities by name input */
const VULNERABILITY_SEARCH_INPUT = 'input[aria-label="Find by name"]'

/** Vulnerabilities table */
const VULNERABILITIES_TABLE = 'table[aria-label="Vulnerabilities table"]'

/** One tbody per CVE (PatternFly compound-expand pattern — both compact and full row modes). */
const VULNERABILITY_ROWS = `${VULNERABILITIES_TABLE} tbody`

/** Empty state when no vulnerabilities found */
const NO_VULNERABILITIES_EMPTY_STATE = '.pf-v6-c-empty-state'

/** CVE details panel/drawer (when clicking on a CVE) */
const CVE_DETAILS_PANEL = '[role="dialog"], .pf-v6-c-drawer__panel'

/** Close button for CVE details */
const CLOSE_DETAILS_BUTTON = 'button[aria-label="Close drawer panel"]'

/** Severity badge/label colors (PatternFly label components) */
const SEVERITY_LABELS = {
  critical: '.pf-m-red',
  high: '.pf-m-orange',
  medium: '.pf-m-gold',
  low: '.pf-m-blue',
}

/**
 * Test image digest with known vulnerabilities
 * This matches DigestA from flightctl e2e tests which has SBOM data in Trustify
 * DigestA: glibc@2.28-150.el8 - vulnerable to both RHSA-2021:4358 and RHSA-2023:5455
 * Expected: 7 CVEs (1 Critical + 1 High + 4 Medium + 1 Low)
 */
export const KNOWN_VULNERABLE_IMAGE = {
  image: 'test-image:v1',
  digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  cves: {
    critical: ['CVE-2021-35942'],
    high: ['CVE-2023-4911'],
    medium: ['CVE-2021-33574', 'CVE-2023-4527', 'CVE-2023-4806', 'CVE-2023-4813'],
    low: ['CVE-2021-27645'],
  },
  totalCount: 7,
  counts: {
    critical: 1,
    high: 1,
    medium: 4,
    low: 1,
  },
}

/**
 * Clean image digest with no vulnerabilities
 * Matches DigestC from e2e tests - fully patched
 */
export const CLEAN_IMAGE = {
  image: 'test-image:v3',
  digest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
}

export const securityPage = {
  getSecurityOverviewCard(timeout = 30000) {
    return cy.get('.pf-v6-c-card', { timeout })
      .filter((_, el) =>
        Cypress.$(el).find('.pf-v6-c-card__title-text').text().includes('Security overview'),
      )
      .first()
  },

  /**
   * Entity security cards are collapsed by default in the redesigned device/fleet page.
   * The overview page has no toggle, so this is intentionally a no-op there.
   */
  ensureEntitySecurityOverviewExpanded(timeout = 30000) {
    this.getSecurityOverviewCard(timeout).then(($card) => {
      const toggle = $card.find(SECURITY_OVERVIEW_TOGGLE)
      if (toggle.length) {
        if (toggle.attr('aria-expanded') !== 'true') {
          cy.wrap(toggle).click()
        }
        cy.wrap(toggle).should('have.attr', 'aria-expanded', 'true')
      }
    })
  },

  /**
   * Verify the security overview card is visible
   * Scrolls to the security overview section if needed
   */
  expectSecurityOverviewVisible() {
    // Scroll inside .should() so it runs on every retry and the timeout covers the whole search.
    // .contains() chained from .get() only retries the outer .get(); for the text check to
    // also retry within the timeout we must do everything inside the .should() callback.
    // Pre-scroll the page to the bottom so the Security overview card (below the fold on ACM
    // pages) is in the rendered viewport before we query for .pf-v6-c-card elements.
    cy.scrollTo('bottom', { ensureScrollable: false })
    this.getSecurityOverviewCard()
      .scrollIntoView({ behavior: 'instant', block: 'end' })
      .should('be.visible')
  },

  /**
   * Verify vulnerability count is displayed.
   *
   * Behaviour depends on which page type the selector lands on:
   *
   * Overview page — renders SecurityOverviewSummary:
   *   card text includes "Total active vulnerabilities." (system-wide count).
   *   We verify the label is present. The exact count is system-wide and may include
   *   CVEs from other devices, so we do NOT assert the precise number here.
   *
   * Device / Fleet page — renders only VulnerabilitiesTable (no count summary):
   *   We fall back to asserting that the CVE table has exactly `count` rows.
   *
   * @param {number} count - Expected total number of vulnerabilities
   * @param {number} timeout - Assertion timeout in ms (default 90000). Use a short value
   *   (e.g. 10000) when the state is expected to already be present — e.g. the initial
   *   "0 CVEs" check at test start where no waiting is needed.
   */
  expectVulnerabilityCount(count, timeout = 90000) {
    this.ensureEntitySecurityOverviewExpanded(timeout)
    if (count === 0) {
      // Everything (card search, scroll, text assertion) inside one .should() so Cypress
      // retries the whole block on every tick within `timeout`. If we chain .contains() off
      // .get() instead, only the outer .get() benefits from the timeout; the chained
      // .contains() uses its own 4 s default, causing premature failures on slow ACM pages.
      // Pre-scroll the page to the bottom so the Security overview card (below the fold on ACM
      // pages) is in the rendered viewport before we query for .pf-v6-c-card elements.
      cy.scrollTo('bottom', { ensureScrollable: false })
      cy.get('.pf-v6-c-card', { timeout })
        .should(($cards) => {
          const card = $cards.filter((_, el) =>
            Cypress.$(el).find('.pf-v6-c-card__title-text').text().includes('Security overview')
          )
          expect(card.length, 'Security overview card should exist').to.be.gt(0)
          card[0].scrollIntoView({ behavior: 'instant', block: 'end' })
          const text = card.first().text()
          const hasNoVulnState =
            text.includes('No vulnerabilities detected') ||
            text.includes('No vulnerabilities were found') ||
            text.includes('No CVEs detected') ||
            text.includes('No vulnerability data to display')
          const hasZeroTotal =
            text.includes('0') &&
            (text.includes('Total active vulnerabilities') ||
             text.includes('total active vulnerabilities'))
          expect(hasNoVulnState || hasZeroTotal, 'Should show 0 vulnerabilities').to.be.true
        })
    } else {
      // scroll + assert inside one .should() so the timeout covers the whole retry loop
      // and the scroll keeps the card visible on every retry (important on long ACM pages).
      cy.scrollTo('bottom', { ensureScrollable: false })
      cy.get('.pf-v6-c-card', { timeout })
        .should(($cards) => {
          const card = $cards.filter((_, el) =>
            Cypress.$(el).find('.pf-v6-c-card__title-text').text().includes('Security overview')
          )
          expect(card.length, 'Security overview card should exist').to.be.gt(0)

          card[0].scrollIntoView({ behavior: 'instant', block: 'end' })

          const text = card.first().text()
          if (text.includes('Total active vulnerabilities')) {
            // Overview page: the count is rendered in a large-font element whose text is
            // exactly the number (or "--" when no devices). text.includes(count) is too loose
            // and matches any digit in the card (dates, device counts, etc.).
            const countEl = card.first().find('.pf-v6-u-font-size-4xl')
            const countText = countEl.text().trim()
            expect(countText, `Expected CVE count element to show ${count}`).to.equal(count.toString())
          } else {
            // Device / Fleet page: count actual CVE rows (tr elements whose td has data-label).
            // Exclude PF6 expandable-row siblings — the Fleet table has expandable rows where
            // each CVE has a companion <tr class="pf-v6-c-table__expandable-row"> that also
            // contains td[data-label] elements, doubling the count without this exclusion.
            const cveRows = card.first().find(
              'table[aria-label="Vulnerabilities table"] tbody tr:not(.pf-v6-c-table__expandable-row) td[data-label]'
            ).closest('tr')
            expect(cveRows.length, `Expected ${count} CVE rows in vulnerability table`).to.equal(count)
          }
        })
    }
  },

  /**
   * Verify severity breakdown counts on the Overview and redesigned entity cards.
   *
   * @param {object} counts - Object with critical, high, medium, low counts
   */
  expectSeverityCounts(counts) {
    this.ensureEntitySecurityOverviewExpanded()
    this.getSecurityOverviewCard().then(($card) => {
      const isEntityCard = $card.find(SECURITY_OVERVIEW_TOGGLE).length > 0

      // Keep the existing calls and validate both the Overview and redesigned
      // device/fleet card variants.
      const checkBox = (cssClass, count, displayLabel) => {
        if (count > 0) {
          const severityTile = $card.find(
            `[aria-label="${displayLabel}"], ` +
            `[aria-label="Filter table by ${displayLabel} severity"], ` +
            `.fctl-security-overview-summary-box.${cssClass}`,
          )
          expect(severityTile.length, `${displayLabel} severity tile should exist`).to.be.gt(0)
          cy.wrap(severityTile.first())
            .scrollIntoView({ behavior: 'instant', block: 'center' })
            .should('be.visible')
            .within(() => {
              cy.get('strong').should('have.text', String(count))
              cy.contains(displayLabel).should('be.visible')
            })
        }
      }

      checkBox('critical', counts.critical, 'Critical')
      checkBox('high', counts.high, 'Important')
      checkBox('medium', counts.medium, 'Moderate')
      checkBox('low', counts.low, 'Low')
      if (isEntityCard) {
        cy.wrap($card).find(SECURITY_OVERVIEW_TOGGLE + '[aria-expanded="true"]').should('exist')
        cy.wrap($card).find('.fctl-security-overview-summary-box[role="button"]').should('exist')
      } else {
        cy.wrap($card).contains('Total active vulnerabilities').should('be.visible')
      }
    })
  },

  /**
   * Verify specific CVE is listed in the table
   * @param {string} cveId - CVE identifier (e.g., 'CVE-2021-35942')
   */
  expectCveVisible(cveId) {
    cy.contains(VULNERABILITY_ROWS, cveId, { timeout: 10000 }).should('be.visible')
  },

  /**
   * Verify multiple CVEs are visible
   * @param {string[]} cveIds - Array of CVE identifiers
   */
  expectCvesVisible(cveIds) {
    cveIds.forEach((cveId) => {
      this.expectCveVisible(cveId)
    })
  },

  /**
   * Click on a specific CVE to open details panel
   * @param {string} cveId - CVE identifier
   */
  clickCve(cveId) {
    // CVE name is rendered as a <Button variant="link"> inside the row — click the button,
    // not the <tr>, to ensure the onClick handler fires.
    cy.contains(`${VULNERABILITIES_TABLE} button`, cveId).click()
  },

  /**
   * Verify CVE details panel is visible
   */
  expectCveDetailsVisible() {
    cy.get(CVE_DETAILS_PANEL, { timeout: 10000 }).should('be.visible')
  },

  /**
   * Verify the drawer shows the expected CVE ID, severity label, and scanner name.
   * The drawer always shows "Trustify" as the hardcoded scanner name.
   * @param {string} cveId - CVE identifier shown as the drawer heading
   * @param {string} severityLabel - Display label ('Critical', 'Important', 'Moderate', 'Low')
   */
  expectCveDrawerContent(cveId, severityLabel) {
    // ACM mode keeps a persistent .pf-v6-c-drawer__panel in the DOM. Scope to the CVE details
    // panel specifically by requiring it to contain the drawer close button.
    cy.get('.pf-v6-c-drawer__panel:has(button[aria-label="Close drawer panel"])').within(() => {
      cy.contains('h3', cveId).should('be.visible')
      cy.contains('Severity').should('be.visible')
      cy.contains(severityLabel).should('be.visible')
      cy.contains('Trustify').should('be.visible')
    })
  },

  /**
   * Close the CVE details panel
   */
  closeCveDetails() {
    cy.get(CLOSE_DETAILS_BUTTON).should('be.visible').click()
    // The CVE drawer (FlightCtlPageDrawer) is fully unmounted on close — the portal
    // disappears. Assert the scoped panel is gone rather than [role="dialog"], since
    // ACM may keep other role=dialog elements in the DOM at all times.
    cy.get('.pf-v6-c-drawer__panel:has(button[aria-label="Close drawer panel"])', { timeout: 15000 }).should('not.exist')
  },

  /**
   * Verify severity label appears in details panel
   * @param {string} severity - Severity level ('Critical', 'High', 'Medium', 'Low')
   */
  expectSeverityInDetails(severity) {
    cy.get(CVE_DETAILS_PANEL).contains(severity).should('be.visible')
  },

  /**
   * Verify package name appears in CVE details
   * @param {string} packageName - Package name (e.g., 'glibc')
   */
  expectPackageInDetails(packageName) {
    cy.get(CVE_DETAILS_PANEL).contains(packageName).should('be.visible')
  },

  /**
   * Filter vulnerabilities by severity
   * @param {string} severity - Severity to filter by ('Critical', 'High', 'Medium', 'Low')
   */
  filterBySeverity(severity) {
    cy.get(SEVERITY_FILTER_TOGGLE).click()
    // PF6 MenuItem with hasCheckbox: onClick fires on the <li> (outer element), not the
    // inner <input>. Click the <li> directly so toggleSeverityFilter is invoked.
    cy.contains('li', severity).should('be.visible').click()
    // Close with Escape — idempotent whether the dropdown auto-closed or stayed open.
    cy.get('body').type('{esc}')
    cy.get(SEVERITY_FILTER_TOGGLE).should('have.attr', 'aria-expanded', 'false')
  },

  /**
   * Filter the CVE table by a severity display label, assert the expected row count,
   * then clear the filter by deselecting the same option.
   * Use the UI display label: 'Critical', 'Important' (High), 'Moderate' (Medium), 'Low'.
   * @param {string} severityDisplayLabel - Label as shown in the filter dropdown
   * @param {number} expectedCount - Expected number of table rows after filtering
   */
  expectFilteredRowCount(severityDisplayLabel, expectedCount) {
    // Wait for the table to have at least 1 visible row before applying a filter.
    // Guards against the 10s useFetchPeriodically refetch that sets isUpdating=true and
    // temporarily replaces rows with a spinner, causing a 0-row false negative on filter apply.
    cy.get(VULNERABILITIES_TABLE, { timeout: 30000 }).should(($table) => {
      const rows = $table.find('tbody tr:not(.pf-v6-c-table__expandable-row) td[data-label]').closest('tr')
      expect(rows.length, 'Table should have rows before filtering').to.be.gt(0)
    })

    // Open the FilterSelect dropdown. The MenuToggle's onClick fires toggleExpand (React state).
    // Do NOT use force:true — React 17+ delegates events via the root; forced synthetic events
    // bypass pointer-events checks but can miss React's root-level event listener in headless CI.
    cy.get(SEVERITY_FILTER_TOGGLE).should('be.visible').click()
    // Wait for the popup to open (aria-expanded flips to "true") before querying its items.
    cy.get(SEVERITY_FILTER_TOGGLE).should('have.attr', 'aria-expanded', 'true')
    // PF6 Select renders the popup as a portal appended directly to <body> with class pf-v6-c-menu.
    // Scope to .pf-v6-c-menu to avoid matching ACM sidebar <li> elements (those are inside
    // .pf-v6-c-page__sidebar). Do NOT use force:true — a real click is needed so React's synthetic
    // onClick on SelectOption fires toggleSeverityFilter.
    cy.contains('.pf-v6-c-menu li', severityDisplayLabel).should('be.visible').click()
    // Close the popup. shouldFocusToggleOnSelect returns focus to the toggle, which may auto-close
    // it. Conditionally click to close only if still open — avoids double-toggling.
    cy.get(SEVERITY_FILTER_TOGGLE, { timeout: 5000 }).then(($btn) => {
      if ($btn.attr('aria-expanded') === 'true') {
        cy.wrap($btn).click()
      }
    })
    cy.get(SEVERITY_FILTER_TOGGLE).should('have.attr', 'aria-expanded', 'false')

    if (expectedCount === 0) {
      // 0 results: Table.tsx replaces the table with an EmptyState — no <table> element.
      cy.get(VULNERABILITIES_TABLE, { timeout: 30000 }).should('not.exist')
    } else {
      // When a filter is active, Table.tsx renders a Spinner (no <table> element) while loading,
      // then the table. Wait up to 30s for the table to have the expected non-empty tbody count.
      cy.get(VULNERABILITIES_TABLE, { timeout: 30000 }).should('exist')
      cy.get(VULNERABILITIES_TABLE, { timeout: 30000 }).should(($table) => {
        const cveRows = $table.find('tbody tr:not(.pf-v6-c-table__expandable-row) td[data-label]').closest('tr')
        expect(cveRows.length, `Expected ${expectedCount} filtered CVE rows`).to.equal(expectedCount)
      })
    }

    // Deselect the filter (toggle it off), then wait for the table to settle before returning.
    cy.get(SEVERITY_FILTER_TOGGLE).should('be.visible').click()
    cy.get(SEVERITY_FILTER_TOGGLE).should('have.attr', 'aria-expanded', 'true')
    cy.contains('.pf-v6-c-menu li', severityDisplayLabel).should('be.visible').click()
    cy.get(SEVERITY_FILTER_TOGGLE, { timeout: 5000 }).then(($btn) => {
      if ($btn.attr('aria-expanded') === 'true') {
        cy.wrap($btn).click()
      }
    })
    cy.get(SEVERITY_FILTER_TOGGLE).should('have.attr', 'aria-expanded', 'false')
    // Wait for table to reappear with unfiltered rows before proceeding to the next filter call.
    cy.get(VULNERABILITIES_TABLE, { timeout: 15000 }).should('exist')
  },

  /**
   * Clear all filters
   */
  clearFilters() {
    // Look for clear filters button or chip group clear
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("Clear all filters")').length > 0) {
        cy.contains('button', 'Clear all filters').click()
      } else if ($body.find('.pf-v6-c-chip-group__close button').length > 0) {
        cy.get('.pf-v6-c-chip-group__close button').click()
      }
    })
  },

  /**
   * Search for a CVE by ID or text
   * @param {string} searchText - Text to search for
   */
  searchVulnerabilities(searchText) {
    // Use force:true to bypass any overlay covering the input in ACM/headless mode.
    // PF6 SearchInput may require Enter to trigger the filter — send it after typing.
    cy.get(VULNERABILITY_SEARCH_INPUT).clear({ force: true }).type(searchText, { force: true }).type('{enter}', { force: true })
  },

  /**
   * Clear the search input
   */
  clearSearch() {
    cy.get(VULNERABILITY_SEARCH_INPUT).clear({ force: true }).type('{enter}', { force: true })
  },

  /**
   * Get the count of visible vulnerability rows in the table
   * @returns {Cypress.Chainable<number>}
   */
  getVisibleVulnerabilityCount() {
    return cy.get(VULNERABILITY_ROWS).its('length')
  },

  /**
   * Verify the table shows exactly N vulnerabilities
   * @param {number} expectedCount
   */
  expectTableRowCount(expectedCount, timeout = 15000) {
    if (expectedCount === 0) {
      // When filter is active + 0 results, Table.tsx renders EmptyState (no table element).
      cy.get(VULNERABILITIES_TABLE, { timeout }).should('not.exist')
    } else {
      cy.get(VULNERABILITIES_TABLE, { timeout }).should('exist')
      cy.get(VULNERABILITIES_TABLE).should(($table) => {
        const cveRows = $table.find('tbody tr:not(.pf-v6-c-table__expandable-row) td[data-label]').closest('tr')
        expect(cveRows.length, `Expected ${expectedCount} CVE rows`).to.equal(expectedCount)
      })
    }
  },

  /**
   * Verify no vulnerabilities are shown (empty state)
   */
  expectNoVulnerabilities() {
    this.expectVulnerabilityCount(0)
  },

  /**
   * Wait for vulnerability data to be loaded and displayed
   * @param {number} timeout - Timeout in ms (default 15000)
   */
  waitForVulnerabilityDataLoad(timeout = 15000) {
    cy.get('body', { timeout }).should(($body) => {
      const text = $body.text()
      const hasData =
        text.includes('vulnerabilit') ||
        text.includes('CVE-') ||
        text.includes('No vulnerabilities found')
      expect(hasData).to.be.true
    })
  },

  /**
   * Wait for the security card to show the expected CVE count.
   *
   * The UI polls the backend every 10 s (useFetchPeriodically), so CVEs appear
   * by themselves without a page reload in normal conditions. Cypress's .should()
   * retry continuously re-queries the live DOM and sees each React update.
   *
   * Flow:
   *   1. Snapshot the current DOM state after firstWaitMs of live polling.
   *   2. If not yet visible, reload once and wait up to reloadWaitMs (default 2 min).
   *      The reload forces a fresh fetch in case the browser cached a stale response.
   *
   * NOTE: cy.on('fail') with queued commands is unreliable — Phase 2 commands can be
   * silently dropped after return false, causing the test to pass vacuously. Instead
   * we use a snapshot check after Phase 1 to decide whether Phase 2 is needed.
   *
   * @param {number} count - Expected CVE count (0 = empty state)
   * @param {object} opts
   * @param {number} opts.firstWaitMs  - Timeout for live-DOM polling phase (default 60000 = 1 min)
   * @param {number} opts.reloadWaitMs - Timeout after reload (default 120000 = 2 min)
   * @param {Function} opts.beforeReload - Optional Cypress command chain to run before reload (e.g. re-patch device status)
   */
  waitForVulnerabilityCountWithReload(count, { firstWaitMs = 60000, reloadWaitMs = 120000, beforeReload = null } = {}) {
    this.ensureEntitySecurityOverviewExpanded()
    // Helper: check whether the Security overview card currently shows the expected CVE count.
    // Runs synchronously inside a Cypress .then() / .should() callback.
    const isCveCountVisible = ($cards) => {
      const card = $cards.filter((_, el) =>
        Cypress.$(el).find('.pf-v6-c-card__title-text').text().includes('Security overview')
      )
      if (!card.length) return false
      card[0].scrollIntoView({ behavior: 'instant', block: 'end' })
      const $c = card.first()
      const text = $c.text()
      if (count === 0) {
        return (
          text.includes('No vulnerabilities detected') ||
          text.includes('No vulnerabilities were found') ||
          text.includes('No CVEs detected') ||
          text.includes('No vulnerability data to display') ||
          (text.includes('0') && text.includes('Total active vulnerabilities'))
        )
      } else if (text.includes('Total active vulnerabilities')) {
        // Overview page: the count is in a large-font element whose text is exactly the number.
        // text.includes(count) is too loose and false-positives on any digit in the card.
        const countText = $c.find('.pf-v6-u-font-size-4xl').text().trim()
        return countText === count.toString()
      } else {
        // Device / Fleet page: count actual CVE rows (tr elements whose td has data-label).
        // Exclude expandable-row siblings — the Fleet table uses PF6 expandable rows where
        // each CVE has a companion tr.pf-v6-c-table__expandable-row that doubles the count.
        const cveRows = $c.find(
          'table[aria-label="Vulnerabilities table"] tbody tr:not(.pf-v6-c-table__expandable-row) td[data-label]'
        ).closest('tr')
        return cveRows.length === count
      }
    }

    // Phase 1: poll the live DOM for up to firstWaitMs. The UI's 10s auto-fetch cycle
    // delivers new data without a reload. Cypress .should() retries on each tick.
    // After Phase 1, take a snapshot to decide if Phase 2 (reload) is needed.
    // We cannot use cy.on('fail') for Phase 2 — commands queued inside a fail handler
    // are silently dropped after return false, causing vacuous pass.
    cy.scrollTo('bottom', { ensureScrollable: false })

    // Phase 1: wait up to firstWaitMs for the count to appear via live DOM polling.
    // We use a snapshot poll (cy.wait + cy.get().then) loop rather than .should() so
    // we can inspect the result and branch to Phase 2 without cy.on('fail').
    const pollInterval = 10000 // match the UI's useFetchPeriodically interval
    const iterations = Math.floor(firstWaitMs / pollInterval)

    // Build a recursive polling chain: check → wait → check → ... → done or reload.
    // cy.get uses a 15s timeout so the card has time to appear after ACM page loads
    // (default 4s is too short for ACM/headless mode).
    const poll = (remaining) => {
      cy.get('.pf-v6-c-card', { timeout: 15000 }).then(($cards) => {
        if (isCveCountVisible($cards)) {
          cy.log(`✓ CVE count ${count} reached — no reload needed`)
          return
        }
        if (remaining <= 0) {
          cy.log(`CVE count ${count} not reached after Phase 1 — reloading`)
          if (beforeReload) { beforeReload() }
          cy.reload()
          cy.wait(5000)
          cy.scrollTo('bottom', { ensureScrollable: false })
          securityPage.expectVulnerabilityCount(count, reloadWaitMs)
          return
        }
        cy.wait(pollInterval)
        cy.scrollTo('bottom', { ensureScrollable: false })
        poll(remaining - 1)
      })
    }

    poll(iterations)
  },
}
