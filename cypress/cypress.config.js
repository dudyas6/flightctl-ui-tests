const { defineConfig } = require('cypress')
const { downloadFile } = require('cypress-downloadfile/lib/addPlugin')
const { registerScaleFleetSimulatorTasks } = require('./plugins/scaleFleetSimulatorTasks')
const { registerFlightctlConsoleTasks } = require('./plugins/flightctlConsoleTasks')
const { registerCatalogTasks } = require('./plugins/catalogTasks')

module.exports = defineConfig({
  video: true,
  videoCompression: false,
  // Cypress default is 1000x660 when not set. Override for a larger test viewport:
  viewportWidth: parseInt(process.env.CYPRESS_VIEWPORT_WIDTH, 10) || 1280,
  viewportHeight: parseInt(process.env.CYPRESS_VIEWPORT_HEIGHT, 10) || 720,
  e2e: {
    // Same idea as kni-assisted-installer-auto/ui_tests: keep URL, cookies, and SPA state
    // between `it` blocks instead of resetting the browser each time.
    // Use before() + cy.ensureLoggedIn() once per top-level describe (not beforeEach).
    testIsolation: false,
    setupNodeEvents(on, config) {
      on('task', { downloadFile })
      registerScaleFleetSimulatorTasks(on)
      registerFlightctlConsoleTasks(on)
      registerCatalogTasks(on)
      // HTTPS oauth → http://localhost callback needs chromeWebSecurity off for the device-login spec
      // only; keep default true for other e2e specs.
      const norm = (p) => String(p).replace(/\\/g, '/')
      const specs = config.specs || []
      const onlyAuthProviderLogin =
        specs.length > 0 && specs.every((s) => norm(s).includes('/auth-provider-login/'))
      if (onlyAuthProviderLogin || process.env.CYPRESS_AUTH_PROVIDER_DEVICE_LOGIN === 'true') {
        config.chromeWebSecurity = false
      }
      return config
    },
    supportFile: 'support/e2e.js',
    specPattern: ['e2e/*.cy.{js,jsx,ts,tsx}', 'auth-provider-login/*.cy.{js,jsx,ts,tsx}'],
  },
  env: {
    host: process.env.OPENSHIFT_HOST || 'https://console-openshift-console.apps.ocp-edge-cluster-0.qe.lab.redhat.com',
    auth: process.env.OPENSHIFT_AUTH || 'https://oauth-openshift.apps.ocp-edge-cluster-0.qe.lab.redhat.com',
    username: process.env.OPENSHIFT_USERNAME || 'kubeadmin',
    password: process.env.OPENSHIFT_PASSWORD || 'kubeadmin',
    image: process.env.QUAY_IMAGE || 'quay.io/sdelacru/flightctl-centos:v1',
    fleetname: process.env.FLEETNAME || 'test-fleet',
    newimage: process.env.NEWIMAGE || 'quay.io/sdelacru/flightctl-centos:v2',
    repository: process.env.REPOSITORY || 'https://github.com/flightctl/flightctl-demos',
    revision: process.env.REVISION || 'main',
    yaml: process.env.YAML || '/demos/basic-nginx-demo/deployment/fleet.yaml',
    newyaml: process.env.NEWYAML || '/demos/quadlet-wordpress-demo/deployment/fleet.yaml',
    repositoryname: process.env.REPOSITORYNAME || 'test-repository',
    buildName: process.env.BUILD_NAME || 'new-build-flightctl',
    // Set to true (CYPRESS_SKIP_SIMULATOR=true) when running the device simulator manually.
    // Skips all simulator start/stop/wait/cleanup tasks in softwareCatalogPage.cy.js.
    skipSimulator: process.env.CYPRESS_SKIP_SIMULATOR === 'true' || false,
    flightctlRepoWithWriteName:     process.env.FLIGHTCTL_REPO_WITH_WRITE_NAME     || 'flightctl-repo',
    flightctlRepoWithWriteHostName: process.env.FLIGHTCTL_REPO_WITH_WRITE_HOSTNAME || '',
    flightctlRepoWithWriteUrl:      process.env.FLIGHTCTL_REPO_WITH_WRITE_URL      || '',
    flightctlRepoWithWritePath:     process.env.FLIGHTCTL_REPO_WITH_WRITE_PATH     || '',
    flightctlRepoWithWriteUsername: process.env.FLIGHTCTL_REPO_WITH_WRITE_USERNAME || '',
    flightctlRepoWithWritePassword: process.env.FLIGHTCTL_REPO_WITH_WRITE_PASSWORD || '',
    resourcename: process.env.RESOURCENAME || 'base/fedora-bootc/deploy/fleet.yaml',
    useAcmNavigation: process.env.CYPRESS_USE_ACM_NAVIGATION !== 'false',
    // Local kind deployments use the built-in Kubernetes token login instead of
    // the OpenShift OAuth flow used by the shared CI environment.
    localK8sAuth: process.env.CYPRESS_LOCAL_K8S_AUTH === 'true',
    k8sToken: process.env.CYPRESS_K8S_TOKEN || '',
    // auth-provider-login.cy.js: full authorize URL from `flightctl login --web --no-browser` output
    flightctlOAuthAuthorizeUrl:
      process.env.CYPRESS_FLIGHTCTL_OAUTH_AUTHORIZE_URL || process.env.FLIGHTCTL_OAUTH_AUTHORIZE_URL || '',
    flightctlCallbackPort: parseInt(
      process.env.CYPRESS_FLIGHTCTL_CALLBACK_PORT || process.env.FLIGHTCTL_CALLBACK_PORT || '18080',
      10,
    ),
    // Full image reference served by the Quay vulnerability test backend.
    // The hostname is deployment-specific and must be injected by CI.
    quayVulnerabilityImage:
      process.env.CYPRESS_QUAY_VULNERABILITY_IMAGE || process.env.QUAY_VULNERABILITY_IMAGE || '',
  },
})
