# Pact Implementation Kickoff

**Version**: 1.0
**Created**: 2026-01-13
**Purpose**: Concrete implementation plan for Phase 0 (Weeks 1-4) including development infrastructure, testing framework, and bootstrap scaffolding

---

## Overview

This document provides step-by-step instructions for setting up Pact's development environment and implementing the first four weeks of development. By the end of Phase 0, we will have:

- Fully Dockerized development environment
- NestJS backend with proper project structure
- Testing framework (Jest + Cucumber/Gherkin)
- Test quality validation infrastructure
- First 4 agents operational (Atomization, Atom Quality, Test-Atom Coupling, Test Quality)
- Bootstrap scaffolding tracking system
- Ability to create, validate, and commit atoms

**Guiding Principles**:
- No host dependencies (Docker-first)
- Development matches production
- Test quality is a Red phase gate
- Bootstrap code has explicit demolition charges
- Agents propose, humans decide

---

## Part 1: Development Infrastructure Setup

### 1.1 Docker and Docker Compose Configuration

**Goal**: Create containerized development environment with PostgreSQL, NestJS, and support services.

**Steps**:

1. **Create `docker-compose.yml` in project root**:

```yaml
version: '3.8'

services:
  # PostgreSQL database
  postgres:
    image: postgres:16-alpine
    container_name: pact-postgres
    environment:
      POSTGRES_USER: pact
      POSTGRES_PASSWORD: pact_dev_password
      POSTGRES_DB: pact_development
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pact"]
      interval: 10s
      timeout: 5s
      retries: 5

  # NestJS application
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: pact-app
    command: npm run start:dev
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_USER: pact
      DATABASE_PASSWORD: pact_dev_password
      DATABASE_NAME: pact_development
      NODE_ENV: development
    depends_on:
      postgres:
        condition: service_healthy

  # Test runner (separate container for isolation)
  test:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: pact-test
    command: npm run test:watch
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_USER: pact
      DATABASE_PASSWORD: pact_dev_password
      DATABASE_NAME: pact_test
      NODE_ENV: test
    depends_on:
      postgres:
        condition: service_healthy

  # Redis for caching (Phase 1+)
  redis:
    image: redis:7-alpine
    container_name: pact-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

2. **Create `Dockerfile.dev` in project root**:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Default command (can be overridden in docker-compose)
CMD ["npm", "run", "start:dev"]
```

3. **Create `Dockerfile` for production** (used in CI/CD):

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main"]
```

4. **Create `.dockerignore`**:

```
node_modules
npm-debug.log
dist
.git
.env
.env.local
coverage
.vscode
.idea
*.md
!README.md
.DS_Store
```

**Validation**:
```bash
docker-compose up -d postgres
docker-compose ps  # Should show postgres healthy
docker-compose logs postgres  # Should show "database system is ready to accept connections"
```

---

### 1.2 NestJS Project Initialization

**Goal**: Create NestJS application with proper structure aligned to Pact's architecture.

**Steps**:

1. **Initialize NestJS project** (if not already done):

```bash
# Run inside Docker container
docker-compose run --rm app npm i -g @nestjs/cli
docker-compose run --rm app nest new . --skip-git --package-manager npm
```

2. **Install core dependencies**:

```bash
docker-compose run --rm app npm install \
  @nestjs/typeorm typeorm pg \
  @nestjs/config \
  class-validator class-transformer \
  @nestjs/swagger swagger-ui-express \
  langchain @langchain/core @langchain/openai \
  @modelcontextprotocol/sdk
```

3. **Install dev dependencies**:

```bash
docker-compose run --rm app npm install --save-dev \
  @types/node \
  @types/jest \
  @cucumber/cucumber \
  jest-cucumber \
  @nestjs/testing \
  supertest \
  @types/supertest
```

4. **Create directory structure**:

```bash
mkdir -p src/modules/{atoms,molecules,validators,evidence,agents}
mkdir -p src/common/{decorators,guards,interceptors,filters}
mkdir -p src/config/{database,agents}
mkdir -p bootstrap/{seed,migration,tooling,runtime}
mkdir -p test/{unit,integration,e2e}
mkdir -p atoms
mkdir -p molecules
mkdir -p global/invariants
mkdir -p ideas
mkdir -p docs/{architecture,implementation,acceptance-criteria}
```

5. **Create `src/config/database/database.config.ts`**:

```typescript
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
  username: process.env.DATABASE_USER || 'pact',
  password: process.env.DATABASE_PASSWORD || 'pact_dev_password',
  database: process.env.DATABASE_NAME || 'pact_development',
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
  synchronize: process.env.NODE_ENV === 'development', // Never in production
  logging: process.env.NODE_ENV === 'development',
});
```

6. **Update `src/app.module.ts`**:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
    }),
    TypeOrmModule.forRoot(databaseConfig()),
  ],
})
export class AppModule {}
```

7. **Create `.env.development`**:

```env
# Database
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_USER=pact
DATABASE_PASSWORD=pact_dev_password
DATABASE_NAME=pact_development

# Application
NODE_ENV=development
PORT=3000

# LLM Configuration (for agents)
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4-turbo-preview
LLM_CONFIDENCE_THRESHOLD_ATOMICITY=0.7
LLM_CONFIDENCE_THRESHOLD_TESTABILITY=0.7
LLM_CONFIDENCE_THRESHOLD_TRANSLATION=0.6

# Logging
LOG_LEVEL=debug
```

8. **Create `.env.test`**:

```env
# Database
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_USER=pact
DATABASE_PASSWORD=pact_dev_password
DATABASE_NAME=pact_test

# Application
NODE_ENV=test
PORT=3001

# LLM Configuration (use mocks in tests)
OPENAI_API_KEY=test-key
OPENAI_MODEL=gpt-4-turbo-preview

# Logging
LOG_LEVEL=error
```

9. **Create `.env.example`** (committed to Git):

```env
# Database
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_USER=pact
DATABASE_PASSWORD=your-password-here
DATABASE_NAME=pact_development

# Application
NODE_ENV=development
PORT=3000

# LLM Configuration
OPENAI_API_KEY=your-openai-key-here
OPENAI_MODEL=gpt-4-turbo-preview

# Logging
LOG_LEVEL=debug
```

**Validation**:
```bash
docker-compose up -d
docker-compose logs app  # Should show "Nest application successfully started"
curl http://localhost:3000  # Should return 404 (no routes yet, but server running)
```

---

### 1.3 PostgreSQL Database Setup

**Goal**: Initialize database schema for atoms, molecules, validators, evidence, and agents.

**Steps**:

1. **Create `docker/postgres/init.sql`**:

```sql
-- Initial database setup
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Atoms table
CREATE TABLE atoms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  atom_id VARCHAR(20) UNIQUE NOT NULL, -- e.g., "IA-001"
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL, -- functional, performance, security, etc.
  quality_score DECIMAL(5,2), -- 0-100
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, committed, superseded
  superseded_by UUID REFERENCES atoms(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  committed_at TIMESTAMP,
  created_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  CHECK (quality_score >= 0 AND quality_score <= 100)
);

-- Molecules table
CREATE TABLE molecules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  molecule_id VARCHAR(20) UNIQUE NOT NULL, -- e.g., "MOL-001"
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Molecule-Atom relationships (many-to-many)
CREATE TABLE molecule_atoms (
  molecule_id UUID REFERENCES molecules(id) ON DELETE CASCADE,
  atom_id UUID REFERENCES atoms(id) ON DELETE CASCADE,
  position INTEGER, -- Order within molecule
  PRIMARY KEY (molecule_id, atom_id)
);

-- Validators table
CREATE TABLE validators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  atom_id UUID REFERENCES atoms(id) ON DELETE CASCADE,
  validator_type VARCHAR(50) NOT NULL, -- gherkin, executable, declarative
  content TEXT NOT NULL,
  format VARCHAR(20) NOT NULL, -- gherkin, typescript, json
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Evidence table
CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  atom_id UUID REFERENCES atoms(id) ON DELETE CASCADE,
  validator_id UUID REFERENCES validators(id),
  result VARCHAR(20) NOT NULL, -- pass, fail, error
  output TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  execution_context JSONB, -- test environment, CI run, etc.
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Clarification Artifacts table (INV-009)
CREATE TABLE clarifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  atom_id UUID REFERENCES atoms(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Agent Actions Log (for auditing agent decisions)
CREATE TABLE agent_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_name VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  input JSONB,
  output JSONB,
  confidence_score DECIMAL(5,2),
  human_approved BOOLEAN,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Bootstrap Scaffolds Tracking
CREATE TABLE bootstrap_scaffolds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scaffold_id VARCHAR(20) UNIQUE NOT NULL, -- e.g., "BS-001"
  scaffold_type VARCHAR(20) NOT NULL, -- seed, migration, tooling, runtime
  purpose TEXT NOT NULL,
  exit_criterion TEXT NOT NULL,
  target_removal VARCHAR(20) NOT NULL, -- Phase 0, Phase 1, Phase 2
  owner VARCHAR(255),
  removal_ticket VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, demolished
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  demolished_at TIMESTAMP,
  demolished_by VARCHAR(255),
  notes TEXT
);

-- Indexes for performance
CREATE INDEX idx_atoms_status ON atoms(status);
CREATE INDEX idx_atoms_atom_id ON atoms(atom_id);
CREATE INDEX idx_molecules_molecule_id ON molecules(molecule_id);
CREATE INDEX idx_evidence_atom_id ON evidence(atom_id);
CREATE INDEX idx_evidence_timestamp ON evidence(timestamp);
CREATE INDEX idx_agent_actions_agent_name ON agent_actions(agent_name);
CREATE INDEX idx_agent_actions_timestamp ON agent_actions(timestamp);
CREATE INDEX idx_bootstrap_scaffolds_status ON bootstrap_scaffolds(status);
```

2. **Create TypeORM migration** (run inside Docker):

```bash
docker-compose run --rm app npm run typeorm migration:create -- -n InitialSchema
```

**Validation**:
```bash
# Connect to database
docker-compose exec postgres psql -U pact -d pact_development

# Check tables
\dt

# Should show: atoms, molecules, molecule_atoms, validators, evidence, clarifications, agent_actions, bootstrap_scaffolds

# Exit
\q
```

---

## Part 2: Testing Framework Setup

### 2.1 Jest Configuration

**Goal**: Configure Jest for unit, integration, and E2E tests with proper isolation and coverage tracking.

**Steps**:

1. **Create `jest.config.js` in project root**:

```javascript
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
    '!bootstrap/**/*', // Bootstrap code not counted in coverage
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@atoms/(.*)$': '<rootDir>/atoms/$1',
    '^@molecules/(.*)$': '<rootDir>/molecules/$1',
  },
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

2. **Create `jest-e2e.config.js`**:

```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup-e2e.ts'],
};
```

3. **Create `test/setup-e2e.ts`**:

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

let app: INestApplication;

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
});

export { app };
```

4. **Update `package.json` scripts**:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./jest-e2e.config.js",
    "test:e2e:watch": "jest --config ./jest-e2e.config.js --watch",
    "test:quality": "node bootstrap/tooling/test-quality-analyzer.js"
  }
}
```

**Validation**:
```bash
# Create a simple test
cat > src/app.controller.spec.ts << 'EOF'
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
EOF

# Run test
docker-compose run --rm test npm run test

# Should show: PASS  src/app.controller.spec.ts
```

---

### 2.2 Cucumber/Gherkin Integration

**Goal**: Enable BDD-style testing with Gherkin scenarios that map to Intent Atoms.

**Steps**:

1. **Create `cucumber.js` config**:

```javascript
module.exports = {
  default: {
    require: ['test/features/step-definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: ['progress', 'html:test/reports/cucumber-report.html'],
    paths: ['test/features/**/*.feature'],
  },
};
```

2. **Create sample feature file `test/features/atom-creation.feature`**:

```gherkin
# @atom IA-001
Feature: Atom Creation
  As a product owner
  I want to create Intent Atoms
  So that I can capture behavioral requirements

  Background:
    Given the Pact system is initialized
    And I am authenticated as a product owner

  Scenario: Create valid atom with sufficient quality score
    Given I have an intent description: "User authentication must complete within 2 seconds"
    When I submit the intent for atomization
    Then the Atomization Agent analyzes the intent
    And the Atom Quality Validator scores the atom
    And the quality score is at least 80
    And a new atom is created with status "draft"
    And the atom ID matches pattern "IA-\d{3}"

  Scenario: Reject atom with low quality score
    Given I have a vague intent: "System should be fast"
    When I submit the intent for atomization
    Then the Atomization Agent analyzes the intent
    And the Atom Quality Validator scores the atom
    And the quality score is below 60
    And the system rejects the atom
    And I receive specific quality feedback

  Scenario: Agent requests clarification for ambiguous intent
    Given I have an ambiguous intent: "Payment must process securely"
    When I submit the intent for atomization
    Then the Atomization Agent detects ambiguity
    And the agent's confidence score is below 0.7
    And the agent requests clarification from me
    And the agent does NOT make a best-guess suggestion
```

3. **Create step definitions `test/features/step-definitions/atom-creation.steps.ts`**:

```typescript
import { Given, When, Then } from '@cucumber/cucumber';
import { Test } from '@nestjs/testing';
import { AtomizationService } from '../../../src/modules/agents/atomization.service';
import { expect } from '@jest/globals';

let atomizationService: AtomizationService;
let intentDescription: string;
let atomizationResult: any;

Given('the Pact system is initialized', async () => {
  const module = await Test.createTestingModule({
    providers: [AtomizationService],
  }).compile();

  atomizationService = module.get<AtomizationService>(AtomizationService);
});

Given('I am authenticated as a product owner', () => {
  // Authentication logic here
});

Given('I have an intent description: {string}', (description: string) => {
  intentDescription = description;
});

When('I submit the intent for atomization', async () => {
  atomizationResult = await atomizationService.atomize(intentDescription);
});

Then('the quality score is at least {int}', (minScore: number) => {
  expect(atomizationResult.qualityScore).toBeGreaterThanOrEqual(minScore);
});

Then('the atom ID matches pattern {string}', (pattern: string) => {
  expect(atomizationResult.atomId).toMatch(new RegExp(pattern));
});
```

4. **Update `package.json` to add Cucumber scripts**:

```json
{
  "scripts": {
    "test:bdd": "cucumber-js",
    "test:bdd:watch": "nodemon --exec cucumber-js"
  }
}
```

**Validation**:
```bash
# Run Cucumber tests (will fail until we implement services)
docker-compose run --rm test npm run test:bdd

# Should show Gherkin scenarios with pending steps
```

---

### 2.3 Test Quality Validation Infrastructure

**Goal**: Create automated test quality analyzer that runs as Red phase gate.

**Steps**:

1. **Create `bootstrap/tooling/test-quality-analyzer.js`**:

```javascript
/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-001
 * Type: Tooling
 * Purpose: Analyze test quality before Green phase
 * Exit Criterion: Pact runtime provides built-in test quality analysis
 * Target Removal: Phase 1
 * Owner: @jasontalley
 */

const fs = require('fs');
const path = require('path');

// Quality dimensions (from /ingest/test-quality.md)
const QUALITY_DIMENSIONS = {
  intentFidelity: { weight: 0.20, threshold: 0.7 },
  noVacuousTests: { weight: 0.15, threshold: 0.9 },
  noBrittleTests: { weight: 0.15, threshold: 0.8 },
  determinism: { weight: 0.10, threshold: 0.95 },
  failureSignalQuality: { weight: 0.15, threshold: 0.7 },
  integrationTestAuthenticity: { weight: 0.15, threshold: 0.8 },
  boundaryAndNegativeCoverage: { weight: 0.10, threshold: 0.6 },
};

function analyzeTestFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  const scores = {
    intentFidelity: checkIntentFidelity(content),
    noVacuousTests: checkForVacuousTests(content),
    noBrittleTests: checkForBrittleTests(content),
    determinism: checkDeterminism(content),
    failureSignalQuality: checkFailureSignalQuality(content),
    integrationTestAuthenticity: checkIntegrationAuthenticity(content, filePath),
    boundaryAndNegativeCoverage: checkBoundaryAndNegativeCoverage(content),
  };

  const overallScore = calculateOverallScore(scores);
  const passed = checkThresholds(scores);

  return {
    filePath,
    scores,
    overallScore,
    passed,
    issues: collectIssues(scores),
  };
}

function checkIntentFidelity(content) {
  // Check for @atom annotations
  const atomAnnotations = (content.match(/@atom IA-\d{3}/g) || []).length;
  const testCases = (content.match(/it\(/g) || []).length;

  if (testCases === 0) return 1.0; // No tests yet

  const coverage = atomAnnotations / testCases;
  return Math.min(coverage, 1.0);
}

function checkForVacuousTests(content) {
  const vacuousPatterns = [
    /expect\([^)]+\)\.toBeDefined\(\)/g,
    /expect\([^)]+\)\.toBeTruthy\(\)/g,
    /expect\(true\)\.toBe\(true\)/g,
  ];

  let vacuousCount = 0;
  vacuousPatterns.forEach(pattern => {
    vacuousCount += (content.match(pattern) || []).length;
  });

  const totalAssertions = (content.match(/expect\(/g) || []).length;
  if (totalAssertions === 0) return 1.0;

  return 1.0 - (vacuousCount / totalAssertions);
}

function checkForBrittleTests(content) {
  const brittlePatterns = [
    /\.toHaveBeenCalledTimes\(/g, // Coupling to call count
    /toMatchSnapshot\(\)/g, // Snapshot tests can be brittle
  ];

  let brittleCount = 0;
  brittlePatterns.forEach(pattern => {
    brittleCount += (content.match(pattern) || []).length;
  });

  const totalTests = (content.match(/it\(/g) || []).length;
  if (totalTests === 0) return 1.0;

  return Math.max(0, 1.0 - (brittleCount / totalTests) * 0.5);
}

function checkDeterminism(content) {
  const nonDeterministicPatterns = [
    /Math\.random\(\)/g,
    /Date\.now\(\)/g,
    /new Date\(\)/g,
    /fetch\(/g,
    /axios\./g,
  ];

  let issues = 0;
  nonDeterministicPatterns.forEach(pattern => {
    const matches = content.match(pattern) || [];
    // Check if they're mocked
    const isMocked = content.includes('jest.mock') || content.includes('jest.spyOn');
    if (matches.length > 0 && !isMocked) {
      issues += matches.length;
    }
  });

  return issues === 0 ? 1.0 : Math.max(0, 1.0 - issues * 0.1);
}

function checkFailureSignalQuality(content) {
  // Check if custom error messages are provided
  const assertionsWithMessages = (content.match(/expect\([^)]+\)\.[^;]+,\s*['"`]/g) || []).length;
  const totalAssertions = (content.match(/expect\(/g) || []).length;

  if (totalAssertions === 0) return 1.0;

  return assertionsWithMessages / totalAssertions;
}

function checkIntegrationAuthenticity(content, filePath) {
  const isIntegrationTest = filePath.includes('integration') || filePath.includes('e2e');

  if (!isIntegrationTest) return 1.0; // Not applicable to unit tests

  // Check for inappropriate mocks in integration tests
  const mockPatterns = [
    /jest\.mock\(/g,
    /\.mockImplementation\(/g,
    /\.mockReturnValue\(/g,
  ];

  let mockCount = 0;
  mockPatterns.forEach(pattern => {
    mockCount += (content.match(pattern) || []).length;
  });

  // Integration tests should have minimal mocking
  return mockCount === 0 ? 1.0 : Math.max(0, 1.0 - mockCount * 0.2);
}

function checkBoundaryAndNegativeCoverage(content) {
  const boundaryPatterns = [
    /toBe\(0\)/g,
    /toBe\(null\)/g,
    /toBe\(undefined\)/g,
    /toBeGreaterThan\(/g,
    /toBeLessThan\(/g,
    /toThrow/g,
    /expect.*\.rejects/g,
  ];

  let boundaryTestCount = 0;
  boundaryPatterns.forEach(pattern => {
    boundaryTestCount += (content.match(pattern) || []).length;
  });

  const totalTests = (content.match(/it\(/g) || []).length;
  if (totalTests === 0) return 1.0;

  // At least 30% of tests should cover boundaries/negatives
  const ratio = boundaryTestCount / totalTests;
  return Math.min(ratio / 0.3, 1.0);
}

function calculateOverallScore(scores) {
  let weightedSum = 0;
  let totalWeight = 0;

  Object.keys(QUALITY_DIMENSIONS).forEach(dimension => {
    const weight = QUALITY_DIMENSIONS[dimension].weight;
    weightedSum += scores[dimension] * weight;
    totalWeight += weight;
  });

  return (weightedSum / totalWeight) * 100;
}

function checkThresholds(scores) {
  const failures = [];

  Object.keys(QUALITY_DIMENSIONS).forEach(dimension => {
    const threshold = QUALITY_DIMENSIONS[dimension].threshold;
    if (scores[dimension] < threshold) {
      failures.push({
        dimension,
        score: scores[dimension],
        threshold,
      });
    }
  });

  return failures.length === 0;
}

function collectIssues(scores) {
  const issues = [];

  Object.keys(QUALITY_DIMENSIONS).forEach(dimension => {
    const threshold = QUALITY_DIMENSIONS[dimension].threshold;
    const score = scores[dimension];

    if (score < threshold) {
      issues.push({
        dimension,
        score: (score * 100).toFixed(1) + '%',
        threshold: (threshold * 100).toFixed(1) + '%',
        severity: score < threshold * 0.5 ? 'critical' : 'warning',
      });
    }
  });

  return issues;
}

// CLI interface
if (require.main === module) {
  const testFilePath = process.argv[2];

  if (!testFilePath) {
    console.error('Usage: node test-quality-analyzer.js <test-file-path>');
    process.exit(1);
  }

  const result = analyzeTestFile(testFilePath);

  console.log('\n=== Test Quality Analysis ===\n');
  console.log(`File: ${result.filePath}`);
  console.log(`Overall Score: ${result.overallScore.toFixed(1)}%`);
  console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n`);

  if (result.issues.length > 0) {
    console.log('Issues Found:\n');
    result.issues.forEach(issue => {
      const icon = issue.severity === 'critical' ? '🔴' : '🟡';
      console.log(`${icon} ${issue.dimension}: ${issue.score} (threshold: ${issue.threshold})`);
    });
  }

  process.exit(result.passed ? 0 : 1);
}

module.exports = { analyzeTestFile };
```

2. **Create pre-commit hook `.husky/pre-commit`**:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run test quality analysis on staged test files
STAGED_TEST_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.spec\.ts$')

if [ -n "$STAGED_TEST_FILES" ]; then
  echo "🔍 Running test quality analysis..."

  for file in $STAGED_TEST_FILES; do
    node bootstrap/tooling/test-quality-analyzer.js "$file"

    if [ $? -ne 0 ]; then
      echo "❌ Test quality check failed for $file"
      echo "Please fix test quality issues before committing."
      exit 1
    fi
  done

  echo "✅ All test files passed quality checks"
fi
```

3. **Install Husky** (for git hooks):

```bash
docker-compose run --rm app npm install --save-dev husky
docker-compose run --rm app npx husky install
docker-compose run --rm app npx husky add .husky/pre-commit "npm run test:quality"
```

**Validation**:
```bash
# Create a test file with quality issues
cat > src/test-sample.spec.ts << 'EOF'
describe('Sample', () => {
  it('should work', () => {
    expect(true).toBe(true); // Vacuous test
  });
});
EOF

# Run quality analyzer
docker-compose run --rm app node bootstrap/tooling/test-quality-analyzer.js src/test-sample.spec.ts

# Should show: FAILED with quality issues
```

---

## Part 3: Bootstrap Scaffolding Setup

### 3.1 Scaffold Ledger Database Integration

**Goal**: Track bootstrap scaffolds in database and ensure one-way dependencies.

**Steps**:

1. **Create `bootstrap/tooling/scaffold-register.js`**:

```javascript
/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-002
 * Type: Tooling
 * Purpose: Register new bootstrap scaffolds in ledger
 * Exit Criterion: No new scaffolds being created (Phase 2)
 * Target Removal: Phase 2
 * Owner: @jasontalley
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const SCAFFOLD_TYPES = ['seed', 'migration', 'tooling', 'runtime'];
const TARGET_PHASES = ['Phase 0', 'Phase 1', 'Phase 2'];

async function registerScaffold(scaffoldData) {
  const {
    scaffoldId,
    scaffoldType,
    purpose,
    exitCriterion,
    targetRemoval,
    owner,
    removalTicket,
  } = scaffoldData;

  // Validate input
  if (!SCAFFOLD_TYPES.includes(scaffoldType)) {
    throw new Error(`Invalid scaffold type: ${scaffoldType}`);
  }

  if (!TARGET_PHASES.includes(targetRemoval)) {
    throw new Error(`Invalid target phase: ${targetRemoval}`);
  }

  // Connect to database
  const client = new Client({
    host: process.env.DATABASE_HOST || 'postgres',
    port: process.env.DATABASE_PORT || 5432,
    user: process.env.DATABASE_USER || 'pact',
    password: process.env.DATABASE_PASSWORD || 'pact_dev_password',
    database: process.env.DATABASE_NAME || 'pact_development',
  });

  await client.connect();

  try {
    // Insert scaffold
    await client.query(
      `INSERT INTO bootstrap_scaffolds
       (scaffold_id, scaffold_type, purpose, exit_criterion, target_removal, owner, removal_ticket, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
      [scaffoldId, scaffoldType, purpose, exitCriterion, targetRemoval, owner, removalTicket]
    );

    console.log(`✅ Registered scaffold: ${scaffoldId}`);

    // Update ledger markdown
    await updateLedgerMarkdown();

  } finally {
    await client.end();
  }
}

async function updateLedgerMarkdown() {
  const client = new Client({
    host: process.env.DATABASE_HOST || 'postgres',
    port: process.env.DATABASE_PORT || 5432,
    user: process.env.DATABASE_USER || 'pact',
    password: process.env.DATABASE_PASSWORD || 'pact_dev_password',
    database: process.env.DATABASE_NAME || 'pact_development',
  });

  await client.connect();

  try {
    // Get active scaffolds
    const activeResult = await client.query(
      'SELECT * FROM bootstrap_scaffolds WHERE status = $1 ORDER BY scaffold_id',
      ['active']
    );

    // Get demolished scaffolds
    const demolishedResult = await client.query(
      'SELECT * FROM bootstrap_scaffolds WHERE status = $1 ORDER BY demolished_at DESC',
      ['demolished']
    );

    // Read current README
    const readmePath = path.join(__dirname, '../README.md');
    let readmeContent = fs.readFileSync(readmePath, 'utf-8');

    // Replace active scaffolds table
    const activeTable = generateActiveScaffoldsTable(activeResult.rows);
    readmeContent = readmeContent.replace(
      /## Active Scaffolds\n\n[\s\S]*?\n\n---/,
      `## Active Scaffolds\n\n${activeTable}\n\n---`
    );

    // Replace demolished scaffolds table
    const demolishedTable = generateDemolishedScaffoldsTable(demolishedResult.rows);
    readmeContent = readmeContent.replace(
      /## Demolished Scaffolds\n\n[\s\S]*?\n\n---/,
      `## Demolished Scaffolds\n\n${demolishedTable}\n\n---`
    );

    fs.writeFileSync(readmePath, readmeContent);
    console.log('✅ Updated bootstrap/README.md');

  } finally {
    await client.end();
  }
}

function generateActiveScaffoldsTable(rows) {
  if (rows.length === 0) {
    return '| ID | Type | Purpose | Exit Criterion | Owner | Removal Ticket | Target Phase |\n' +
           '|----|------|---------|----------------|-------|----------------|--------------|\n' +
           '| *No scaffolds yet* | - | - | - | - | - | - |';
  }

  let table = '| ID | Type | Purpose | Exit Criterion | Owner | Removal Ticket | Target Phase |\n';
  table += '|----|------|---------|----------------|-------|----------------|--------------|\n';

  rows.forEach(row => {
    table += `| ${row.scaffold_id} | ${row.scaffold_type} | ${row.purpose} | ${row.exit_criterion} | ${row.owner || 'TBD'} | ${row.removal_ticket || 'TBD'} | ${row.target_removal} |\n`;
  });

  return table;
}

function generateDemolishedScaffoldsTable(rows) {
  if (rows.length === 0) {
    return '| ID | Type | Purpose | Demolition Date | Demolished By | Notes |\n' +
           '|----|------|---------|-----------------|---------------|-------|\n' +
           '| *No demolished scaffolds yet* | - | - | - | - | - |';
  }

  let table = '| ID | Type | Purpose | Demolition Date | Demolished By | Notes |\n';
  table += '|----|------|---------|-----------------|---------------|-------|\n';

  rows.forEach(row => {
    const date = new Date(row.demolished_at).toISOString().split('T')[0];
    table += `| ${row.scaffold_id} | ${row.scaffold_type} | ${row.purpose} | ${date} | ${row.demolished_by || 'Unknown'} | ${row.notes || '-'} |\n`;
  });

  return table;
}

// CLI interface
if (require.main === module) {
  const action = process.argv[2];

  if (action === 'register') {
    const scaffoldData = {
      scaffoldId: process.argv[3],
      scaffoldType: process.argv[4],
      purpose: process.argv[5],
      exitCriterion: process.argv[6],
      targetRemoval: process.argv[7],
      owner: process.argv[8],
      removalTicket: process.argv[9],
    };

    registerScaffold(scaffoldData).catch(console.error);
  } else if (action === 'update-ledger') {
    updateLedgerMarkdown().catch(console.error);
  } else {
    console.error('Usage: node scaffold-register.js register <id> <type> <purpose> <exit-criterion> <target-removal> <owner> <ticket>');
    console.error('   or: node scaffold-register.js update-ledger');
    process.exit(1);
  }
}

module.exports = { registerScaffold, updateLedgerMarkdown };
```

2. **Register existing scaffolds**:

```bash
# Register BS-001 (test quality analyzer)
docker-compose run --rm app node bootstrap/tooling/scaffold-register.js register \
  "BS-001" \
  "tooling" \
  "Analyze test quality before Green phase" \
  "Pact runtime provides built-in test quality analysis" \
  "Phase 1" \
  "@jasontalley" \
  "TBD"

# Register BS-002 (scaffold register itself)
docker-compose run --rm app node bootstrap/tooling/scaffold-register.js register \
  "BS-002" \
  "tooling" \
  "Register new bootstrap scaffolds in ledger" \
  "No new scaffolds being created (Phase 2)" \
  "Phase 2" \
  "@jasontalley" \
  "TBD"
```

**Validation**:
```bash
# Check database
docker-compose exec postgres psql -U pact -d pact_development -c "SELECT scaffold_id, scaffold_type, status FROM bootstrap_scaffolds;"

# Should show: BS-001 and BS-002 as active

# Check README update
cat bootstrap/README.md | grep -A 3 "## Active Scaffolds"

# Should show BS-001 and BS-002 in table
```

---

### 3.2 CI/CD Pipeline for Bootstrap Isolation

**Goal**: Ensure `/src` never depends on `/bootstrap` via automated CI checks.

**Steps**:

1. **Create `.github/workflows/bootstrap-isolation-check.yml`**:

```yaml
name: Bootstrap Isolation Check

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop]

jobs:
  check-dependencies:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Check for bootstrap imports in src/
        run: |
          # Check if any file in /src imports from /bootstrap
          VIOLATIONS=$(grep -r "from.*bootstrap" src/ || true)

          if [ -n "$VIOLATIONS" ]; then
            echo "❌ CRITICAL: /src depends on /bootstrap (one-way dependency violated)"
            echo "$VIOLATIONS"
            exit 1
          fi

          echo "✅ Bootstrap isolation verified: /src does not depend on /bootstrap"

      - name: Check for missing scaffold version stamps
        run: |
          # Check all files in /bootstrap have version stamps
          FILES_WITHOUT_STAMPS=$(find bootstrap/ -type f -name "*.js" -o -name "*.ts" | while read file; do
            if ! grep -q "BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS" "$file"; then
              echo "$file"
            fi
          done)

          if [ -n "$FILES_WITHOUT_STAMPS" ]; then
            echo "⚠️  WARNING: Bootstrap files missing version stamps:"
            echo "$FILES_WITHOUT_STAMPS"
            echo "Please add version stamp header to these files."
            exit 1
          fi

          echo "✅ All bootstrap files have version stamps"
```

2. **Create `.github/workflows/test-quality-gate.yml`**:

```yaml
name: Test Quality Gate

on:
  pull_request:
    branches: [develop, main]

jobs:
  test-quality:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run test quality analysis
        run: |
          # Analyze all test files
          find src/ test/ -name "*.spec.ts" | while read testfile; do
            echo "Analyzing: $testfile"
            node bootstrap/tooling/test-quality-analyzer.js "$testfile"

            if [ $? -ne 0 ]; then
              echo "❌ Test quality check failed for $testfile"
              exit 1
            fi
          done

          echo "✅ All tests passed quality gate"
```

**Validation**:
```bash
# Test bootstrap isolation check locally
grep -r "from.*bootstrap" src/ && echo "VIOLATION FOUND" || echo "✅ No violations"

# Test version stamp check
find bootstrap/ -type f \( -name "*.js" -o -name "*.ts" \) | while read file; do
  grep -q "BOOTSTRAP SCAFFOLDING" "$file" || echo "Missing stamp: $file"
done
```

---

## Part 4: Phase 0 Implementation Plan (Weeks 1-4)

### Week 1: Infrastructure + Atomization Agent

**Deliverables**:
- ✅ Dockerized development environment
- ✅ NestJS application running
- ✅ PostgreSQL database initialized
- ✅ Testing framework configured
- 🔨 Atomization Agent implemented

**Tasks**:

1. **Complete infrastructure setup** (Days 1-2):
   - Execute Part 1 (Development Infrastructure Setup)
   - Execute Part 2 (Testing Framework Setup)
   - Execute Part 3 (Bootstrap Scaffolding Setup)
   - Verify all validation checks pass

2. **Implement Atomization Agent** (Days 3-5):

   a. **Create entity `src/modules/atoms/atom.entity.ts`**:
   ```typescript
   import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

   @Entity('atoms')
   export class Atom {
     @PrimaryGeneratedColumn('uuid')
     id: string;

     @Column({ unique: true })
     atomId: string; // e.g., "IA-001"

     @Column('text')
     description: string;

     @Column()
     category: string; // functional, performance, security, etc.

     @Column('decimal', { precision: 5, scale: 2, nullable: true })
     qualityScore: number;

     @Column({ default: 'draft' })
     status: string; // draft, committed, superseded

     @Column({ type: 'uuid', nullable: true })
     supersededBy: string;

     @CreateDateColumn()
     createdAt: Date;

     @Column({ type: 'timestamp', nullable: true })
     committedAt: Date;

     @Column({ nullable: true })
     createdBy: string;

     @Column('jsonb', { default: {} })
     metadata: Record<string, any>;
   }
   ```

   b. **Create service `src/modules/agents/atomization.service.ts`**:
   ```typescript
   import { Injectable } from '@nestjs/common';
   import { InjectRepository } from '@nestjs/typeorm';
   import { Repository } from 'typeorm';
   import { Atom } from '../atoms/atom.entity';
   import { OpenAI } from 'langchain/llms/openai';

   @Injectable()
   export class AtomizationService {
     constructor(
       @InjectRepository(Atom)
       private atomRepository: Repository<Atom>,
     ) {}

     async atomize(intentDescription: string): Promise<{
       atom: Atom;
       confidence: number;
       analysis: string;
     }> {
       // LLM analysis for atomicity
       const llm = new OpenAI({
         modelName: process.env.OPENAI_MODEL,
         temperature: 0.2,
       });

       const prompt = `Analyze the following intent for atomicity:

       Intent: "${intentDescription}"

       Evaluate:
       1. Is this irreducible? (Cannot be decomposed further)
       2. Is this behaviorally testable? (Observable and falsifiable)
       3. Is this implementation-agnostic? (No "how", only "what")

       Respond in JSON format:
       {
         "isAtomic": true/false,
         "confidence": 0.0-1.0,
         "reasoning": "explanation",
         "category": "functional|performance|security|reliability",
         "suggestedDecomposition": ["atom1", "atom2"] (if not atomic)
       }`;

       const response = await llm.call(prompt);
       const analysis = JSON.parse(response);

       // Check confidence threshold
       const threshold = parseFloat(process.env.LLM_CONFIDENCE_THRESHOLD_ATOMICITY || '0.7');

       if (analysis.confidence < threshold) {
         return {
           atom: null,
           confidence: analysis.confidence,
           analysis: `Unable to determine atomicity with confidence. ${analysis.reasoning}`,
         };
       }

       if (!analysis.isAtomic) {
         return {
           atom: null,
           confidence: analysis.confidence,
           analysis: `Intent is not atomic. Suggested decomposition: ${analysis.suggestedDecomposition.join(', ')}`,
         };
       }

       // Generate atom ID
       const latestAtom = await this.atomRepository.findOne({
         order: { atomId: 'DESC' },
       });

       const nextId = latestAtom
         ? parseInt(latestAtom.atomId.split('-')[1]) + 1
         : 1;
       const atomId = `IA-${String(nextId).padStart(3, '0')}`;

       // Create atom (draft status)
       const atom = this.atomRepository.create({
         atomId,
         description: intentDescription,
         category: analysis.category,
         status: 'draft',
         metadata: {
           atomizationAnalysis: analysis,
         },
       });

       await this.atomRepository.save(atom);

       return {
         atom,
         confidence: analysis.confidence,
         analysis: analysis.reasoning,
       };
     }
   }
   ```

   c. **Create tests `src/modules/agents/atomization.service.spec.ts`**:
   ```typescript
   // @atom IA-001
   describe('AtomizationService', () => {
     it('should create atom from valid, atomic intent with high confidence', async () => {
       const result = await service.atomize('User authentication must complete within 2 seconds');

       expect(result.atom).toBeDefined();
       expect(result.atom.atomId).toMatch(/^IA-\d{3}$/);
       expect(result.confidence).toBeGreaterThanOrEqual(0.7);
       expect(result.atom.status).toBe('draft');
     });

     // @atom IA-002
     it('should request clarification when confidence is low', async () => {
       const result = await service.atomize('System should be good');

       expect(result.atom).toBeNull();
       expect(result.confidence).toBeLessThan(0.7);
       expect(result.analysis).toContain('Unable to determine');
     });

     // @atom IA-003
     it('should suggest decomposition for non-atomic intent', async () => {
       const result = await service.atomize('User can log in and view dashboard');

       expect(result.atom).toBeNull();
       expect(result.analysis).toContain('not atomic');
       expect(result.analysis).toContain('Suggested decomposition');
     });
   });
   ```

3. **Validation checklist**:
   - [ ] `docker-compose up -d` starts all services
   - [ ] Database tables exist (9 tables)
   - [ ] Tests run in Docker container
   - [ ] Atomization service creates atoms with IDs
   - [ ] Low-confidence intents are rejected
   - [ ] Non-atomic intents trigger decomposition suggestions

**Success Criteria**:
- Infrastructure is fully operational
- Atomization Agent can analyze intents
- Confidence thresholds are enforced
- All tests pass quality gate

---

### Week 2: Atom Quality Validator

**Deliverables**:
- 🔨 Atom Quality Validator implemented
- 🔨 Quality scoring with 7 dimensions
- 🔨 Gating logic (≥80 approve, 60-79 revise, <60 reject)

**Tasks**:

1. **Create `src/modules/validators/atom-quality.service.ts`**:
   ```typescript
   import { Injectable } from '@nestjs/common';
   import { Atom } from '../atoms/atom.entity';
   import { OpenAI } from 'langchain/llms/openai';

   interface QualityDimensions {
     observable: number; // 0-25
     falsifiable: number; // 0-25
     implementationAgnostic: number; // 0-20
     unambiguousLanguage: number; // 0-15
     clearSuccessCriteria: number; // 0-15
   }

   @Injectable()
   export class AtomQualityService {
     async evaluateQuality(atom: Atom): Promise<{
       overallScore: number;
       dimensions: QualityDimensions;
       recommendation: 'approve' | 'revise' | 'reject';
       feedback: string[];
     }> {
       const llm = new OpenAI({
         modelName: process.env.OPENAI_MODEL,
         temperature: 0.1,
       });

       const prompt = `Evaluate the quality of this Intent Atom:

       Atom ID: ${atom.atomId}
       Description: "${atom.description}"

       Score each dimension (0-max):
       1. Observable (0-25): Can this behavior be observed in a running system?
       2. Falsifiable (0-25): Can this behavior be proven false if violated?
       3. Implementation-Agnostic (0-20): Does this describe WHAT, not HOW?
       4. Unambiguous Language (0-15): Is the language clear and unambiguous?
       5. Clear Success Criteria (0-15): Are success criteria explicit?

       Respond in JSON format:
       {
         "dimensions": {
           "observable": score,
           "falsifiable": score,
           "implementationAgnostic": score,
           "unambiguousLanguage": score,
           "clearSuccessCriteria": score
         },
         "feedback": ["issue1", "issue2", ...]
       }`;

       const response = await llm.call(prompt);
       const evaluation = JSON.parse(response);

       const overallScore = Object.values(evaluation.dimensions).reduce(
         (sum: number, score: number) => sum + score,
         0
       );

       let recommendation: 'approve' | 'revise' | 'reject';
       if (overallScore >= 80) {
         recommendation = 'approve';
       } else if (overallScore >= 60) {
         recommendation = 'revise';
       } else {
         recommendation = 'reject';
       }

       return {
         overallScore,
         dimensions: evaluation.dimensions,
         recommendation,
         feedback: evaluation.feedback,
       };
     }
   }
   ```

2. **Create tests with quality scenarios**:
   ```typescript
   // @atom IA-004
   describe('AtomQualityService - High Quality Atoms', () => {
     it('should approve atom with score >= 80', async () => {
       const atom = createAtom('User authentication must complete within 2 seconds');
       const result = await service.evaluateQuality(atom);

       expect(result.overallScore).toBeGreaterThanOrEqual(80);
       expect(result.recommendation).toBe('approve');
     });
   });

   // @atom IA-005
   describe('AtomQualityService - Medium Quality Atoms', () => {
     it('should suggest revision for atom with score 60-79', async () => {
       const atom = createAtom('Payment should be secure');
       const result = await service.evaluateQuality(atom);

       expect(result.overallScore).toBeGreaterThanOrEqual(60);
       expect(result.overallScore).toBeLessThan(80);
       expect(result.recommendation).toBe('revise');
       expect(result.feedback.length).toBeGreaterThan(0);
     });
   });

   // @atom IA-006
   describe('AtomQualityService - Low Quality Atoms', () => {
     it('should reject atom with score < 60', async () => {
       const atom = createAtom('System should be fast');
       const result = await service.evaluateQuality(atom);

       expect(result.overallScore).toBeLessThan(60);
       expect(result.recommendation).toBe('reject');
     });
   });
   ```

3. **Integrate with Atomization flow**:
   - Update `atomization.service.ts` to call quality validator after creating draft atom
   - Store quality score in `atom.qualityScore` field
   - Return quality evaluation with atomization result

**Validation checklist**:
- [ ] Quality validator scores all 5 dimensions
- [ ] Overall score calculation is correct (sum of dimensions)
- [ ] Gating logic works (approve/revise/reject)
- [ ] Feedback is actionable
- [ ] Tests pass quality gate

---

### Week 3: Test-Atom Coupling Agent

**Deliverables**:
- 🔨 Test-Atom Coupling Agent implemented
- 🔨 Orphan test detection
- 🔨 Unrealized atom detection
- 🔨 Test-atom mismatch detection (INV-009 violations)

**Tasks**:

1. **Create `src/modules/agents/test-atom-coupling.service.ts`**:
   ```typescript
   import { Injectable } from '@nestjs/common';
   import { InjectRepository } from '@nestjs/typeorm';
   import { Repository } from 'typeorm';
   import { Atom } from '../atoms/atom.entity';
   import * as fs from 'fs';
   import * as glob from 'glob';

   interface CouplingIssue {
     type: 'orphan-test' | 'unrealized-atom' | 'test-atom-mismatch';
     severity: 'error' | 'warning';
     file?: string;
     atomId?: string;
     details: string;
   }

   @Injectable()
   export class TestAtomCouplingService {
     constructor(
       @InjectRepository(Atom)
       private atomRepository: Repository<Atom>,
     ) {}

     async analyzeCoupling(): Promise<{
       issues: CouplingIssue[];
       stats: {
         totalTests: number;
         totalAtoms: number;
         orphanTests: number;
         unrealizedAtoms: number;
         mismatches: number;
       };
     }> {
       const issues: CouplingIssue[] = [];

       // Find all test files
       const testFiles = glob.sync('src/**/*.spec.ts');

       // Extract @atom annotations from tests
       const testAtomMap = new Map<string, string[]>(); // atomId -> [testFiles]
       const testsWithoutAtoms: string[] = [];

       testFiles.forEach(file => {
         const content = fs.readFileSync(file, 'utf-8');
         const atomMatches = content.match(/@atom (IA-\d{3})/g);

         if (!atomMatches || atomMatches.length === 0) {
           // Check if file has actual tests
           if (content.includes('it(')) {
             testsWithoutAtoms.push(file);
             issues.push({
               type: 'orphan-test',
               severity: 'error',
               file,
               details: 'Test file has no @atom annotations',
             });
           }
         } else {
           atomMatches.forEach(match => {
             const atomId = match.replace('@atom ', '');
             if (!testAtomMap.has(atomId)) {
               testAtomMap.set(atomId, []);
             }
             testAtomMap.get(atomId).push(file);
           });
         }
       });

       // Find unrealized atoms (atoms without tests)
       const allAtoms = await this.atomRepository.find({
         where: { status: 'committed' },
       });

       const unrealizedAtoms = allAtoms.filter(
         atom => !testAtomMap.has(atom.atomId)
       );

       unrealizedAtoms.forEach(atom => {
         issues.push({
           type: 'unrealized-atom',
           severity: 'warning',
           atomId: atom.atomId,
           details: `Committed atom has no tests: ${atom.description}`,
         });
       });

       // Detect test-atom mismatches (INV-009 violations)
       for (const [atomId, files] of testAtomMap.entries()) {
         const atom = allAtoms.find(a => a.atomId === atomId);
         if (!atom) continue;

         for (const file of files) {
           const mismatch = await this.detectMismatch(atom, file);
           if (mismatch) {
             issues.push({
               type: 'test-atom-mismatch',
               severity: 'error',
               file,
               atomId,
               details: mismatch,
             });
           }
         }
       }

       return {
         issues,
         stats: {
           totalTests: testFiles.length,
           totalAtoms: allAtoms.length,
           orphanTests: testsWithoutAtoms.length,
           unrealizedAtoms: unrealizedAtoms.length,
           mismatches: issues.filter(i => i.type === 'test-atom-mismatch').length,
         },
       };
     }

     private async detectMismatch(atom: Atom, testFile: string): Promise<string | null> {
       // Use LLM to semantically compare atom description with test assertions
       const content = fs.readFileSync(testFile, 'utf-8');

       const llm = new OpenAI({
         modelName: process.env.OPENAI_MODEL,
         temperature: 0.1,
       });

       const prompt = `Compare the Intent Atom with the test assertions:

       Atom ${atom.atomId}: "${atom.description}"

       Test Code:
       ${content}

       Does the test TIGHTEN, WEAKEN, or CONTRADICT the atom without a superseding commitment?

       Examples of violations (INV-009):
       - Atom: "must process within 5 seconds" → Test: expect(time).toBeLessThan(2000) // TIGHTENS to 2 seconds
       - Atom: "must validate email format" → Test: // no email validation test // WEAKENS
       - Atom: "must return 200 on success" → Test: expect(status).toBe(201) // CONTRADICTS

       Respond in JSON:
       {
         "mismatch": true/false,
         "type": "tightens|weakens|contradicts|none",
         "explanation": "detailed explanation"
       }`;

       const response = await llm.call(prompt);
       const analysis = JSON.parse(response);

       if (analysis.mismatch) {
         return `Test ${analysis.type} atom without supersession: ${analysis.explanation}`;
       }

       return null;
     }
   }
   ```

2. **Create pre-commit hook for coupling check**:
   ```bash
   # .husky/pre-commit (update existing)

   # Run test-atom coupling analysis
   echo "🔍 Checking test-atom coupling..."
   npm run test:coupling

   if [ $? -ne 0 ]; then
     echo "❌ Test-atom coupling issues found"
     exit 1
   fi
   ```

3. **Add npm script**:
   ```json
   {
     "scripts": {
       "test:coupling": "ts-node src/modules/agents/test-atom-coupling.service.ts"
     }
   }
   ```

**Validation checklist**:
- [ ] Orphan tests are detected
- [ ] Unrealized atoms are detected
- [ ] Test-atom mismatches are detected
- [ ] Pre-commit hook blocks commits with coupling issues

---

### Week 4: Test Quality Analyzer Integration

**Deliverables**:
- 🔨 Test Quality Analyzer integrated into CI/CD
- 🔨 All 7 quality dimensions enforced
- 🔨 Quality reports generated
- ✅ Phase 0 complete

**Tasks**:

1. **Enhance test quality analyzer** (from bootstrap):
   - Add detailed failure messages with atom references
   - Generate HTML reports
   - Add quality trend tracking

2. **Create quality dashboard endpoint**:
   ```typescript
   // src/modules/evidence/test-quality.controller.ts
   @Controller('test-quality')
   export class TestQualityController {
     @Get('report')
     async getQualityReport() {
       // Return quality metrics across all test files
     }
   }
   ```

3. **Update CI/CD to fail on low quality**:
   - Enforce minimum score of 70% per test file
   - Fail build if critical issues found
   - Generate quality badge for README

**Validation checklist**:
- [ ] All 7 quality dimensions are checked
- [ ] CI fails on quality violations
- [ ] Quality report is readable
- [ ] Test quality trends are tracked

**Phase 0 Success Criteria**:
- ✅ Development environment is fully Dockerized
- ✅ PostgreSQL database schema is complete
- ✅ Testing framework (Jest + Cucumber) operational
- ✅ Atomization Agent creates atoms with confidence checks
- ✅ Atom Quality Validator gates commitment (80+ score)
- ✅ Test-Atom Coupling Agent detects orphans and mismatches
- ✅ Test Quality Analyzer enforces 7 dimensions
- ✅ Bootstrap scaffolding is tracked and isolated
- ✅ CI/CD pipeline enforces all quality gates

---

## Part 5: Validation & Readiness Checklist

### 5.1 Infrastructure Validation

Run these commands to verify setup:

```bash
# 1. Docker services are healthy
docker-compose ps
# Should show: postgres (healthy), app (running), test (running), redis (running)

# 2. Database connectivity
docker-compose exec postgres psql -U pact -d pact_development -c "\dt"
# Should list: 8 tables (atoms, molecules, validators, evidence, etc.)

# 3. Application is running
curl http://localhost:3000/health
# Should return: {"status":"ok"}

# 4. Tests can run
docker-compose run --rm test npm run test
# Should show: All tests passing

# 5. Cucumber/BDD tests work
docker-compose run --rm test npm run test:bdd
# Should show: Gherkin scenarios with steps

# 6. Test quality analyzer works
docker-compose run --rm app node bootstrap/tooling/test-quality-analyzer.js src/app.controller.spec.ts
# Should show: Quality score and analysis

# 7. Bootstrap isolation check
grep -r "from.*bootstrap" src/
# Should return: Nothing (no violations)

# 8. Scaffold ledger is up to date
cat bootstrap/README.md | grep -A 5 "## Active Scaffolds"
# Should show: BS-001 and BS-002 registered
```

### 5.2 Agent Functionality Validation

After Week 1-4 implementation:

```bash
# 1. Atomization Agent
curl -X POST http://localhost:3000/atoms/atomize \
  -H "Content-Type: application/json" \
  -d '{"intent": "User authentication must complete within 2 seconds"}'
# Should return: { "atomId": "IA-001", "confidence": 0.85, "status": "draft" }

# 2. Atom Quality Validator
curl -X POST http://localhost:3000/atoms/IA-001/validate-quality
# Should return: { "score": 85, "recommendation": "approve" }

# 3. Test-Atom Coupling
curl http://localhost:3000/test-coupling/analyze
# Should return: { "orphanTests": 0, "unrealizedAtoms": 0, "mismatches": 0 }

# 4. Test Quality Report
curl http://localhost:3000/test-quality/report
# Should return: Quality metrics across all tests
```

### 5.3 Quality Gates Validation

```bash
# 1. Test quality gate (should fail for low quality)
cat > src/bad-test.spec.ts << 'EOF'
describe('Bad Test', () => {
  it('should work', () => {
    expect(true).toBe(true); // Vacuous
  });
});
EOF

docker-compose run --rm app node bootstrap/tooling/test-quality-analyzer.js src/bad-test.spec.ts
# Should show: FAILED with quality issues

# 2. Pre-commit hook (should block commits with issues)
git add src/bad-test.spec.ts
git commit -m "Test commit"
# Should be blocked by pre-commit hook

# 3. CI/CD (should fail on bootstrap isolation violation)
echo "import { something } from '../bootstrap/tooling/test-quality-analyzer';" > src/violation.ts
git add src/violation.ts
git push
# Should fail in CI with isolation error
```

---

## Part 6: Ready-to-Develop Criteria

You are ready to begin Phase 1 development when:

- [ ] All infrastructure validation checks pass (Part 5.1)
- [ ] All agent functionality checks pass (Part 5.2)
- [ ] All quality gate checks pass (Part 5.3)
- [ ] Documentation is complete:
  - [ ] `/ideas/pact-agents.md` exists with agent specifications
  - [ ] `/bootstrap/README.md` is updated with active scaffolds
  - [ ] `/CLAUDE.md` includes Intent Artifact Management and Bootstrap Scaffolding sections
  - [ ] This document (`/ideas/implementation-kickoff.md`) is reviewed and understood
- [ ] Team alignment:
  - [ ] Product owner understands atom/molecule model
  - [ ] Developers understand test quality gates
  - [ ] Everyone knows where to find documentation
- [ ] Development workflow is validated:
  - [ ] Can create idea in `/ideas`
  - [ ] Can atomize intent via Atomization Agent
  - [ ] Can validate atom quality
  - [ ] Can commit atom (manual ceremony for now)
  - [ ] Can write tests with `@atom` annotations
  - [ ] Tests pass quality gate
  - [ ] Can commit code with test-atom coupling enforced

---

## Part 7: Common Issues & Troubleshooting

### Issue: Docker containers won't start

**Symptoms**: `docker-compose up` fails or containers exit immediately

**Solutions**:
```bash
# Check Docker daemon is running
docker info

# Check for port conflicts
lsof -i :5432  # PostgreSQL
lsof -i :3000  # NestJS

# Clean up and rebuild
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Issue: Database connection refused

**Symptoms**: Application can't connect to PostgreSQL

**Solutions**:
```bash
# Verify postgres is healthy
docker-compose ps

# Check postgres logs
docker-compose logs postgres

# Ensure DATABASE_HOST=postgres in .env.development (not localhost)

# Wait for postgres to be ready
docker-compose exec postgres pg_isready -U pact
```

### Issue: Tests failing due to missing dependencies

**Symptoms**: `Cannot find module` errors in tests

**Solutions**:
```bash
# Rebuild node_modules in Docker
docker-compose run --rm app npm ci

# Verify package.json has all dependencies
docker-compose run --rm app npm ls

# Check TypeScript configuration
docker-compose run --rm app npx tsc --noEmit
```

### Issue: Test quality analyzer gives false positives

**Symptoms**: Good tests fail quality checks

**Solutions**:
- Adjust thresholds in `bootstrap/tooling/test-quality-analyzer.js`
- Add `@atom` annotations to all test cases
- Ensure tests have meaningful assertions (not just `.toBeDefined()`)
- Check for mocked dependencies in integration tests

### Issue: Pre-commit hook blocks valid commits

**Symptoms**: Hook fails even though changes are valid

**Solutions**:
```bash
# Run quality analyzer manually to see details
node bootstrap/tooling/test-quality-analyzer.js <your-test-file>

# Bypass hook temporarily (NOT RECOMMENDED for regular use)
git commit --no-verify -m "Message"

# Fix quality issues in tests before committing
```

---

## Part 8: Next Steps After Phase 0

Once Phase 0 is complete (infrastructure + first 4 agents), proceed to:

**Phase 1 (Weeks 5-8)**:
- Bootstrap Scaffolding Agent (Week 5-6)
- Update existing skills for atom/molecule model (Week 7-8)
- Commitment ceremony implementation
- Clarification Artifact system

**Phase 2 (Weeks 9-12)**:
- Molecule Composer Agent
- Invariant Enforcement Agent
- Molecule management UI
- Advanced atom queries

**Phase 3 (Weeks 13+)**:
- Evidence Collector Agent
- Real-time evidence streaming
- Completeness analysis
- Self-hosting capabilities

**Reference Documents**:
- `/ideas/pact-agents.md` - Full agent specifications
- `/docs/architectural-review-response-2026-01-12.md` - Architectural decisions
- `/ingest/invariants.md` - Global invariants (INV-001 through INV-009)
- `/bootstrap/README.md` - Scaffold tracking ledger

---

**Last Updated**: 2026-01-13
**Status**: Ready for execution
**Owner**: @jasontalley

---

## Quick Start Commands

```bash
# Complete Phase 0 setup in one go:

# 1. Start infrastructure
docker-compose up -d

# 2. Verify health
docker-compose ps
docker-compose logs app

# 3. Run database migrations
docker-compose exec app npm run typeorm migration:run

# 4. Register initial scaffolds
docker-compose run --rm app node bootstrap/tooling/scaffold-register.js register \
  "BS-001" "tooling" "Test quality analyzer" \
  "Pact runtime provides built-in analysis" "Phase 1" "@jasontalley" "TBD"

# 5. Run tests
docker-compose run --rm test npm run test

# 6. Start development
# You're ready to implement Week 1 tasks!
```

---

**End of Implementation Kickoff**
