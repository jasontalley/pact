module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(p-retry|is-network-error)/)',
  ],
  testEnvironment: 'node',
  forceExit: true,
  // Run E2E tests sequentially to avoid database conflicts
  maxWorkers: 1,
  // Run tests in a specific order
  testSequencer: './test/sequencer.js',
  // Note: E2E test results are primarily console output
  // To generate JSON reports, use: npm run test:e2e -- --json --outputFile=test-results/backend/e2e/reports/results.json
  // HTML reporters can be added via jest-html-reporters package if needed
};
