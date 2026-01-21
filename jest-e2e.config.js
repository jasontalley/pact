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
};
