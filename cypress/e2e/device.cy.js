import { devicesPage, LOG_PRIORITIES } from '../views/devicesPage'
import { systemImageInput } from '../views/common'

const DEVICE_NAME = 'test-device'
const DEVICE_NAME_EDITED = 'test-device-edited'
const DEVICE_NAME_EDITED_2 = 'test-device-edited2'

describe('Device Management', () => {
  // One login + visit per spec file; later tests reuse the same tab (testIsolation: false).
  before(() => {
    cy.ensureLoggedIn()
  })

  describe('Approve device – Alias validation (negative)', () => {
    it('Should show validation error when alias starts with a dash', () => {
      devicesPage.openApproveDeviceModal()
      devicesPage.fillAliasInApproveModal('-invalid-alias')
      devicesPage.expectValidationIconError()
      devicesPage.closeApproveDeviceModal()
    })

    it('Should show validation error when alias ends with a dot', () => {
      devicesPage.openApproveDeviceModal()
      devicesPage.fillAliasInApproveModal('invalid-alias.')
      devicesPage.expectValidationIconError()
      devicesPage.closeApproveDeviceModal()
    })

    it('Should show validation error when alias contains spaces', () => {
      devicesPage.openApproveDeviceModal()
      devicesPage.fillAliasInApproveModal('invalid alias with spaces')
      devicesPage.expectValidationIconError()
      devicesPage.closeApproveDeviceModal()
    })

    it('Should show validation error when alias contains special characters (e.g. emoji shorthand)', () => {
      devicesPage.openApproveDeviceModal()
      devicesPage.fillAliasInApproveModal('Thanks for confirming :pray: At first I thought I hallucinating :slightly_s...')
      devicesPage.expectValidationIconError()
      devicesPage.closeApproveDeviceModal()
    })

    it('Should show validation error when alias exceeds 63 characters', () => {
      const longAlias = 'a'.repeat(64)
      devicesPage.openApproveDeviceModal()
      devicesPage.fillAliasInApproveModal(longAlias)
      devicesPage.expectValidationIconError()
      devicesPage.closeApproveDeviceModal()
    })
  })

  describe('Approve device', () => {
    it('Should approve a device enrollment request', () => {
      devicesPage.approveDevice(DEVICE_NAME)
    })

    /* it('Should open a terminal on a device', () => {
      devicesPage.openTerminal()
    }) */
  })

  describe('Catalog inheritance for standalone devices', () => {
    const fixture = {}
    const deviceAlias = DEVICE_NAME
    const channel = 'stable'
    const initialVersion = '1.0.0'

    before(() => {
      cy.task('catalogInheritanceSetup', {
        catalogName: 'default',
        includeAdvancedFixtures: false,
      }).then((created) => {
        Object.assign(fixture, created)
      })
    })

    after(() => {
      if (!fixture.fleetName) return

      // Restore the device owned by this spec before deleting the catalog fixtures.
      devicesPage.openEditDeviceConfigurations(deviceAlias)
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      devicesPage.clearManualOs()
      devicesPage.removeCatalogApplication(fixture.appItemName)
      systemImageInput().type(Cypress.env('image'))
      devicesPage.saveDeviceTemplateWizard()
      cy.task('catalogInheritanceCleanup', fixture)
    })

    it('Should replace the manual OS with pinned catalog OS and application references', () => {
      devicesPage.openEditDeviceConfigurations(deviceAlias)
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      devicesPage.clearManualOs()
      devicesPage.addCatalogOs(fixture.osItemName, channel, initialVersion)
      devicesPage.addCatalogApplication(fixture.appItemName, channel, initialVersion)
      devicesPage.expectCatalogInheritanceTemplate(
        fixture.osItemName,
        fixture.appItemName,
        { updateAvailable: true },
      )
      devicesPage.saveDeviceTemplateWizard()
    })

    it('Should show Update available for a reachable catalog upgrade during device edit', () => {
      devicesPage.openEditDeviceConfigurations(deviceAlias)
      cy.get('[data-testid="wizard-next-button"]').should('not.be.disabled').click()
      devicesPage.expectCatalogUpdateAvailable(fixture.appItemName)
      cy.contains('Update available').should('be.visible')
      cy.get('#selectfield-version-menu:visible').should('not.exist')
      cy.get('[data-testid="wizard-cancel-button"]').click()
      cy.get('[data-testid="wizard-cancel-button"]').should('not.exist')
    })
  })

  describe('Edit device, view device events', () => {
    it('Should edit a device', () => {
      devicesPage.editDevice(`${Cypress.env('image')}`, DEVICE_NAME, DEVICE_NAME_EDITED)
    })

    it('Should edit a device image - fake url', () => {
      devicesPage.editDevice(`quay.io/redhat/rhde:9.2`, DEVICE_NAME_EDITED, DEVICE_NAME_EDITED_2)
    })

    it('Should make sure device is out-of-date', () => {
      devicesPage.checkDeviceOutOfDate(DEVICE_NAME_EDITED_2)
    })

    it('Should view device events', () => {
      devicesPage.deviceEvents(DEVICE_NAME_EDITED_2)
    })
  })

  describe('View device logs, filter by priority, search, download', () => {
    const logMarker = (priority) => `CYPRESS_LOG_TEST_${priority.toUpperCase()}`

    it('Should retrieve agent logs with default filters', () => {
      devicesPage.openDeviceLogs(DEVICE_NAME_EDITED_2)
      devicesPage.retrieveLogsAndVerify()
    })

    it('Should retrieve system logs with default filters', () => {
      devicesPage.selectLogCategory('System')
      devicesPage.retrieveLogsAndVerify()
    })

    it('Should retrieve file path logs with default filters', () => {
      devicesPage.selectLogCategory('File path')
      cy.get('input[name="logFilePath"]', { timeout: 15000 }).clear().type('dnf.log')
      devicesPage.retrieveLogsAndVerify()
    })

    it('Should show error for non-existing file path', () => {
      devicesPage.openDeviceLogs(DEVICE_NAME_EDITED_2)
      devicesPage.selectLogCategory('File path')
      cy.get('input[name="logFilePath"]', { timeout: 15000 }).clear().type('nonexistent-file-xyz.log')
      cy.contains('button', 'Retrieve logs').should('not.be.disabled').click()
      cy.get('.pf-m-danger, [class*="danger"]', { timeout: 30000 }).should('be.visible')
    })

    it('Should show error for directory file path', () => {
      devicesPage.openDeviceLogs(DEVICE_NAME_EDITED_2)
      devicesPage.selectLogCategory('File path')
      cy.get('input[name="logFilePath"]', { timeout: 15000 }).clear().type('audit')
      cy.contains('button', 'Retrieve logs').should('not.be.disabled').click()
      cy.get('.pf-m-danger, [class*="danger"]', { timeout: 30000 }).should('be.visible')
    })

    it('Should inject logger messages at each syslog priority', () => {
      cy.task('flightctlConsoleCommand', {
        deviceAlias: DEVICE_NAME_EDITED_2,
        commands: LOG_PRIORITIES.map(p => `logger -p user.${p.key} "${logMarker(p.key)}"`)
      })
    })

    LOG_PRIORITIES.forEach(({ key, level }, index) => {
      it(`Should show ${key} message and all higher priorities`, () => {
        devicesPage.openDeviceLogs(DEVICE_NAME_EDITED_2)
        devicesPage.selectLogCategory('System')
        devicesPage.selectLogTimeRange('Last 1 hour')
        devicesPage.selectLogLevel(level)
        devicesPage.retrieveLogsAndVerify()

        LOG_PRIORITIES.slice(0, index + 1).forEach((p) => {
          devicesPage.searchLogsFor(logMarker(p.key))
        })
      })
    })

    it('Should enable live logs and receive new entries', () => {
      devicesPage.openDeviceLogs(DEVICE_NAME_EDITED_2)
      devicesPage.selectLogCategory('Agent')
      devicesPage.selectLogTimeRange('Current boot')
      devicesPage.retrieveLogsAndVerify()
      cy.contains('Show live logs', { timeout: 15000 }).should('be.visible')
      cy.get('.pf-v6-c-log-viewer__list-item', { timeout: 60000 }).its('length').then((initialCount) => {
        cy.contains('Show live logs').click()
        cy.get('.pf-v6-c-log-viewer__list-item', { timeout: 30000 })
          .should('have.length.greaterThan', initialCount)
      })
    })

    it('Should stop live streaming when toggled off', () => {
      cy.contains('Show live logs').click()
      cy.get('.pf-v6-c-log-viewer', { timeout: 5000 }).should('be.visible')
    })

    it('Should find and highlight search results', () => {
      devicesPage.openDeviceLogs(DEVICE_NAME_EDITED_2)
      devicesPage.retrieveLogsAndVerify()
      devicesPage.searchLogsFor('flightctl')
    })

    it('Should navigate between search results', () => {
      cy.contains(/[1-9]\d*\s*\/\s*[1-9]\d*/).should('be.visible').then(($count) => {
        const initialText = $count.text()
        cy.wrap($count).parent().find('button').first().click()
        cy.contains(/[1-9]\d*\s*\/\s*[1-9]\d*/).invoke('text').should('not.eq', initialText)
      })
    })

  })

  describe('Decommission device', () => {
    it('Should decommission a device', () => {
      devicesPage.decommissionDevice(DEVICE_NAME_EDITED_2)
    })
  })

  describe('Run device simulator to demo 50 devices', () => {
    before(() => {
      cy.task('scaleFleetEnsureExists', {})
      cy.task('scaleFleetSimulatorStart')
      cy.task(
        'scaleFleetSimulatorWaitForDevices',
        {
          expected: 50,
          labelSelector: 'fleet=scale-fleet-00',
          timeoutMs: 660000,
          pollMs: 5000,
          settleMs: 25000,
        },
        { timeout: 690000 },
      )
    })

    after(() => {
      cy.task('scaleFleetSimulatorStop')
      cy.task('scaleFleetCleanup', {})
    })

    it('should list 15 enrolled devices on pages 1–3 and 5 on page 4', () => {
      devicesPage.filterByFleetScaleLabel()
      //devicesPage.goToFirstEnrolledDevicesPage()

      cy.log('Page 1')
      devicesPage.expectEnrolledDeviceRowsCount(15)
      devicesPage.clickEnrolledDevicesNextPage()
      cy.log('Page 2')
      devicesPage.expectEnrolledDeviceRowsCount(15)
      devicesPage.clickEnrolledDevicesNextPage()
      cy.log('Page 3')
      devicesPage.expectEnrolledDeviceRowsCount(15)
      devicesPage.clickEnrolledDevicesNextPage()
      cy.log('Page 4')
      devicesPage.expectEnrolledDeviceRowsCount(5)
    })

    it('after decommissioning one device from page 3, page 3 still has 15 rows and page 4 has 4', () => {
      devicesPage.filterByFleetScaleLabel()
      devicesPage.goToEnrolledDevicesPageFromFirst(3)

      devicesPage.expectEnrolledDeviceRowsCount(15)

      devicesPage.decommissionDeviceAtEnrolledRow(0)

      cy.get('[data-testid="show-decommissioned-devices-switch"]').closest('label').click()
      cy.get('[data-testid="enrolled-devices-table"]', { timeout: 120000 }).should('exist')

      devicesPage.filterByFleetScaleLabel()
      devicesPage.goToEnrolledDevicesPageFromFirst(3)

      devicesPage.expectEnrolledDeviceRowsCount(15)

      devicesPage.clickEnrolledDevicesNextPage()

      devicesPage.expectEnrolledDeviceRowsCount(4)
    })

    it('removing fleet device-selector label disconnects a scale-fleet device and re-adding re-attaches', () => {
      devicesPage.runFleetLabelDetachReattachTest()
    })
  })
})
