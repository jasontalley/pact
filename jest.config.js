module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.spec.ts',
    '!src/**/*.e2e-spec.ts',
    '!src/main.ts',
    '!src/**/*.module.ts', // NestJS modules are declarative wiring, no business logic
    '!src/**/*.entity.ts', // TypeORM entities are schema definitions, no testable behavior
    '!src/**/*.dto.ts', // DTOs are declarative validation schemas, no business logic
    '!src/config/**/*.ts', // Configuration factories are environment-driven, no business logic
    '!bootstrap/**/*', // Bootstrap code not counted in coverage
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  transformIgnorePatterns: [
    'node_modules/(?!(p-retry|is-network-error)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@atoms/(.*)$': '<rootDir>/atoms/$1',
    '^@molecules/(.*)$': '<rootDir>/molecules/$1',
  },
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
};
