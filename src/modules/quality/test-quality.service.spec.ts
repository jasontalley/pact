/**
 * Tests for TestQualityService
 *
 * @atom IA-040 - Test quality analysis service
 *
 * Coverage:
 * - 7 quality dimension evaluation
 * - Atom reference detection
 * - HTML report generation
 * - Quality trend tracking
 * - Snapshot persistence
 * - Phase 14B: analyzeTestSource (text-based analysis)
 * - Phase 14B: analyzeTestSourceBatch (batch analysis)
 * - Phase 14B: Quality Profile CRUD
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs';
import { TestQualityService, QualityAnalysisResult } from './test-quality.service';
import { TestQualitySnapshot } from './test-quality-snapshot.entity';
import { QualityProfile, DEFAULT_QUALITY_DIMENSIONS } from './quality-profile.entity';

// Mock fs module
jest.mock('fs');

describe('TestQualityService', () => {
  let service: TestQualityService;
  let mockSnapshotRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let mockProfileRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(async () => {
    mockSnapshotRepository = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'snapshot-1', ...data })),
      find: jest.fn().mockResolvedValue([]),
    };

    const mockQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };

    mockProfileRepository = {
      create: jest.fn((data) => ({
        id: 'profile-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })),
      save: jest.fn((data) =>
        Promise.resolve({ id: 'profile-1', createdAt: new Date(), updatedAt: new Date(), ...data }),
      ),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestQualityService,
        {
          provide: getRepositoryToken(TestQualitySnapshot),
          useValue: mockSnapshotRepository,
        },
        {
          provide: getRepositoryToken(QualityProfile),
          useValue: mockProfileRepository,
        },
      ],
    }).compile();

    service = module.get<TestQualityService>(TestQualityService);

    jest.clearAllMocks();
  });

  // @atom IA-040
  describe('service initialization', () => {
    // @atom IA-040
    it('should be defined', () => {
      // Service must be instantiated by NestJS DI
      expect(service).toBeInstanceOf(TestQualityService);
    });
  });

  // @atom IA-041
  describe('intent fidelity evaluation', () => {
    // @atom IA-041
    it('should detect annotated tests with @atom comments', () => {
      const testContent = `
describe('UserService', () => {
  // @atom IA-001
  it('should create a user', () => {
    expect(1).toBe(1);
  });

  // @atom IA-002
  it('should delete a user', () => {
    expect(1).toBe(1);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/user.spec.ts', '/test');

      // Should detect all atom references
      expect(result.referencedAtoms).toContain('IA-001');
      expect(result.referencedAtoms).toContain('IA-002');
      // All tests are annotated
      expect(result.annotatedTests).toBe(2);
      // No orphan tests
      expect(result.orphanTests).toHaveLength(0);
      // Intent fidelity should be high
      expect(result.dimensions.intentFidelity.score).toBe(1.0);
    });

    // @atom IA-041
    it('should detect orphan tests without @atom annotations', () => {
      const testContent = `
describe('PaymentService', () => {
  // @atom IA-003
  it('should process payment', () => {
    expect(1).toBe(1);
  });

  it('should handle payment failure', () => {
    expect(1).toBe(1);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/payment.spec.ts', '/test');

      // One test is annotated, one is orphan
      expect(result.annotatedTests).toBe(1);
      expect(result.orphanTests).toHaveLength(1);
      // Orphan test should have name and line number
      expect(result.orphanTests[0].name).toContain('should handle payment failure');
      // Intent fidelity should be 50%
      expect(result.dimensions.intentFidelity.score).toBe(0.5);
    });

    // @atom IA-041
    it('should generate issues for orphan tests', () => {
      const testContent = `
describe('Test', () => {
  it('orphan test', () => {
    expect(1).toBe(1);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/orphan.spec.ts', '/test');

      // Should have issue about missing annotation
      expect(result.dimensions.intentFidelity.issues).toHaveLength(2);
      // Issue should mention the test name
      expect(result.dimensions.intentFidelity.issues[0].message).toContain('orphan test');
      // Issue should have suggestion
      expect(result.dimensions.intentFidelity.issues[0].suggestion).toContain('@atom');
    });
  });

  // @atom IA-042
  describe('vacuous tests detection', () => {
    // @atom IA-042
    it('should detect toBeDefined as vacuous', () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('vacuous test', () => {
    const result = doSomething();
    expect(result).toBeDefined();
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/vacuous.spec.ts', '/test');

      // Should flag vacuous assertion
      expect(result.dimensions.noVacuousTests.issues.length).toBeGreaterThan(0);
      // Score should be reduced
      expect(result.dimensions.noVacuousTests.score).toBeLessThan(1.0);
    });

    // @atom IA-042
    it('should not flag meaningful assertions', () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('meaningful test', () => {
    const result = calculate(5);
    expect(result).toBe(25);
    expect(result).toBeGreaterThan(0);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/good.spec.ts', '/test');

      // No vacuous assertions
      expect(result.dimensions.noVacuousTests.issues).toHaveLength(0);
      // Perfect score
      expect(result.dimensions.noVacuousTests.score).toBe(1.0);
    });

    // @atom IA-042
    it('should detect expect(true).toBe(true) as vacuous', () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('always passes', () => {
    expect(true).toBe(true);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/truthy.spec.ts', '/test');

      // Should detect vacuous pattern
      expect(result.dimensions.noVacuousTests.issues.length).toBeGreaterThan(0);
    });
  });

  // @atom IA-043
  describe('brittle tests detection', () => {
    // @atom IA-043
    it('should detect toHaveBeenCalledTimes as potentially brittle', () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('checks call count', () => {
    const mock = jest.fn();
    doSomething(mock);
    expect(mock).toHaveBeenCalledTimes(3);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/brittle.spec.ts', '/test');

      // Should flag potential brittleness
      expect(result.dimensions.noBrittleTests.issues.length).toBeGreaterThan(0);
      expect(result.dimensions.noBrittleTests.issues[0].message).toContain('toHaveBeenCalledTimes');
    });

    // @atom IA-043
    it('should detect snapshot tests as potentially brittle', () => {
      const testContent = `
describe('Component', () => {
  // @atom IA-001
  it('matches snapshot', () => {
    const tree = render(<Component />);
    expect(tree).toMatchSnapshot();
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/snapshot.spec.ts', '/test');

      // Should flag snapshot test
      expect(result.dimensions.noBrittleTests.issues.length).toBeGreaterThan(0);
    });
  });

  // @atom IA-044
  describe('determinism evaluation', () => {
    // @atom IA-044
    it('should detect Math.random without mocking', () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('uses random', () => {
    const value = Math.random();
    expect(value).toBeGreaterThan(0);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/random.spec.ts', '/test');

      // Should flag non-deterministic code
      expect(result.dimensions.determinism.issues.length).toBeGreaterThan(0);
      expect(result.dimensions.determinism.issues[0].message).toContain('Math.random()');
    });

    // @atom IA-044
    it('should not flag mocked Date usage', () => {
      const testContent = `
jest.mock('date-fns');

describe('Test', () => {
  // @atom IA-001
  it('uses date', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const value = Date.now();
    expect(value).toBe(1000);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/date-mocked.spec.ts', '/test');

      // Date.now is mocked, should not flag
      expect(result.dimensions.determinism.score).toBe(1.0);
    });
  });

  // @atom IA-045
  describe('boundary and negative coverage', () => {
    // @atom IA-045
    it('should detect boundary tests', () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('handles zero', () => {
    expect(calculate(0)).toBe(0);
  });

  // @atom IA-001
  it('handles null', () => {
    expect(getValue()).toBe(null);
  });

  // @atom IA-001
  it('throws on invalid', () => {
    expect(() => process(-1)).toThrow();
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/boundary.spec.ts', '/test');

      // Should have good boundary coverage
      expect(result.dimensions.boundaryAndNegativeCoverage.score).toBeGreaterThan(0.5);
    });

    // @atom IA-045
    it('should flag low boundary coverage', () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('normal case', () => {
    expect(calculate(5)).toBe(25);
  });

  // @atom IA-001
  it('another normal case', () => {
    expect(calculate(10)).toBe(100);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/no-boundary.spec.ts', '/test');

      // Low boundary coverage should have suggestion
      expect(result.dimensions.boundaryAndNegativeCoverage.score).toBeLessThan(0.6);
    });
  });

  // @atom IA-046
  describe('overall score calculation', () => {
    // @atom IA-046
    it('should calculate weighted overall score', () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('good test', () => {
    // This assertion checks the calculation
    expect(calculate(5)).toBe(25);
    expect(calculate(0)).toBe(0);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const result = service.analyzeTestFile('/test/good.spec.ts', '/test');

      // Overall score should be calculated
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    // @atom IA-046
    it('should determine pass/fail status based on thresholds', () => {
      const goodTestContent = `
describe('Test', () => {
  // @atom IA-001
  it('well-documented test', () => {
    // Assert the value is correct
    expect(calculate(5)).toBe(25);
    // Assert boundary case
    expect(calculate(0)).toBe(0);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(goodTestContent);

      const result = service.analyzeTestFile('/test/good.spec.ts', '/test');

      // High quality test should pass
      expect(result.passed).toBe(true);
    });
  });

  // @atom IA-047
  describe('HTML report generation', () => {
    // @atom IA-047
    it('should generate valid HTML report', () => {
      const mockResult: QualityAnalysisResult = {
        timestamp: new Date(),
        commitHash: 'abc123',
        branchName: 'develop',
        summary: {
          totalFiles: 2,
          passedFiles: 1,
          failedFiles: 1,
          overallScore: 85.5,
          totalTests: 10,
          annotatedTests: 8,
          orphanTests: 2,
        },
        dimensionAverages: {
          intentFidelity: 80,
          noVacuousTests: 90,
          noBrittleTests: 85,
          determinism: 95,
          failureSignalQuality: 70,
          integrationTestAuthenticity: 100,
          boundaryAndNegativeCoverage: 65,
        },
        fileResults: [
          {
            filePath: '/test/good.spec.ts',
            relativePath: 'good.spec.ts',
            overallScore: 95,
            passed: true,
            dimensions: {},
            referencedAtoms: ['IA-001'],
            orphanTests: [],
            totalTests: 5,
            annotatedTests: 5,
          },
          {
            filePath: '/test/bad.spec.ts',
            relativePath: 'bad.spec.ts',
            overallScore: 55,
            passed: false,
            dimensions: {},
            referencedAtoms: [],
            orphanTests: [{ name: 'orphan', lineNumber: 10 }],
            totalTests: 5,
            annotatedTests: 3,
          },
        ],
        trends: [],
      };

      const html = service.generateHtmlReport(mockResult);

      // Valid HTML document should start with DOCTYPE
      expect(html).toContain('<!DOCTYPE html>');
      // Should have opening html tag
      expect(html).toContain('<html');
      // Should have closing html tag
      expect(html).toContain('</html>');

      // Summary should display overall score
      expect(html).toContain('85.5%');
      // Summary should have file count header
      expect(html).toContain('Total Files');

      // Commit hash should be displayed
      expect(html).toContain('abc123');
      // Branch name should be displayed
      expect(html).toContain('develop');

      // Passed file should be listed
      expect(html).toContain('good.spec.ts');
      // Failed file should also be listed
      expect(html).toContain('bad.spec.ts');
    });

    // @atom IA-047
    it('should escape HTML in file paths', () => {
      const mockResult: QualityAnalysisResult = {
        timestamp: new Date(),
        summary: {
          totalFiles: 1,
          passedFiles: 1,
          failedFiles: 0,
          overallScore: 90,
          totalTests: 1,
          annotatedTests: 1,
          orphanTests: 0,
        },
        dimensionAverages: {},
        fileResults: [
          {
            filePath: '/test/<script>alert("xss")</script>.spec.ts',
            relativePath: '<script>alert("xss")</script>.spec.ts',
            overallScore: 90,
            passed: true,
            dimensions: {},
            referencedAtoms: [],
            orphanTests: [],
            totalTests: 1,
            annotatedTests: 1,
          },
        ],
        trends: [],
      };

      const html = service.generateHtmlReport(mockResult);

      // Should escape < and >
      expect(html).toContain('&lt;script&gt;');
      // Should not contain raw script tag
      expect(html).not.toContain('<script>alert');
    });
  });

  // @atom IA-048
  describe('quality trend tracking', () => {
    // @atom IA-048
    it('should save snapshot to database', async () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('test', () => {
    expect(1).toBe(1);
  });
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);

      await service.analyzeQuality({
        testDirectory: '/test',
        saveSnapshot: true,
      });

      // Repository create should be called with snapshot data
      expect(mockSnapshotRepository.create).toHaveBeenCalled();
      // Repository save should persist the snapshot
      expect(mockSnapshotRepository.save).toHaveBeenCalled();
    });

    // @atom IA-048
    it('should retrieve recent trends', async () => {
      mockSnapshotRepository.find.mockResolvedValue([
        {
          createdAt: new Date('2026-01-15'),
          overallScore: 85,
          passedFiles: 8,
          totalFiles: 10,
        },
        {
          createdAt: new Date('2026-01-16'),
          overallScore: 88,
          passedFiles: 9,
          totalFiles: 10,
        },
      ]);

      const trends = await service.getRecentTrends(7);

      // Should return correct number of trend entries
      expect(trends).toHaveLength(2);
      // First trend entry should have correct score
      expect(trends[0].overallScore).toBe(85);
      // Second trend entry should have correct score
      expect(trends[1].overallScore).toBe(88);
    });
  });

  // @atom IA-049
  describe('quality gate checking', () => {
    // @atom IA-049
    it('should pass gate when all files pass', async () => {
      // High-quality test content that passes all thresholds
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('validates normal case', () => {
    // Verifies calculation returns expected value
    expect(calculate(5)).toBe(25);
  });

  // @atom IA-001
  it('handles zero boundary', () => {
    // Boundary test for zero input
    expect(calculate(0)).toBe(0);
  });

  // @atom IA-001
  it('handles null input', () => {
    // Negative test for null
    expect(calculate(null)).toBe(null);
  });

  // @atom IA-001
  it('throws on invalid input', () => {
    // Error handling test
    expect(() => calculate(-1)).toThrow();
  });
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);

      // Should not throw
      await expect(service.checkQualityGate({ testDirectory: '/test' })).resolves.not.toThrow();
    });

    // @atom IA-049
    it('should fail gate when files fail thresholds', async () => {
      const badTestContent = `
describe('Test', () => {
  it('orphan test 1', () => {
    expect(true).toBeDefined();
  });
  it('orphan test 2', () => {
    expect(true).toBeTruthy();
  });
  it('orphan test 3', () => {
    expect(true).toBe(true);
  });
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'bad.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(badTestContent);

      // Should throw with failure details
      await expect(service.checkQualityGate({ testDirectory: '/test' })).rejects.toThrow(
        'Test quality gate failed',
      );
    });
  });

  // @atom IA-050
  describe('file discovery', () => {
    // @atom IA-050
    it('should find .spec.ts and .test.ts files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'a.spec.ts', isDirectory: () => false, isFile: () => true },
        { name: 'b.test.ts', isDirectory: () => false, isFile: () => true },
        { name: 'c.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(`
describe('Test', () => {
  // @atom IA-001
  it('test', () => {
    expect(1).toBe(1);
  });
});
`);

      const result = await service.analyzeQuality({ testDirectory: '/test' });

      // Should find 2 test files
      expect(result.summary.totalFiles).toBe(2);
    });

    // @atom IA-050
    it('should exclude node_modules', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = dir.toString();
        if (dirStr === '/test') {
          return [
            { name: 'a.spec.ts', isDirectory: () => false, isFile: () => true },
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue(`
describe('Test', () => {
  // @atom IA-001
  it('test', () => {
    expect(1).toBe(1);
  });
});
`);

      const result = await service.analyzeQuality({ testDirectory: '/test' });

      // Should only find 1 file (not from node_modules)
      expect(result.summary.totalFiles).toBe(1);
    });

    // @atom IA-050
    it('should handle non-existent directory gracefully', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await service.analyzeQuality({ testDirectory: '/nonexistent' });

      // Should return empty results
      expect(result.summary.totalFiles).toBe(0);
      expect(result.fileResults).toHaveLength(0);
    });
  });

  // ============================================================================
  // Phase 14B: analyzeTestSource (text-based analysis)
  // ============================================================================

  // @atom IA-040
  describe('analyzeTestSource', () => {
    // @atom IA-040
    it('should analyze source code text without filesystem access', () => {
      const sourceCode = `
describe('UserService', () => {
  // @atom IA-001
  it('should create a user', () => {
    // Validates user creation returns an id
    expect(createUser({ name: 'Test' })).toHaveProperty('id');
  });
});
`;

      const result = service.analyzeTestSource(sourceCode);

      // Should return a quality result with all expected fields
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.grade).toBeDefined();
      expect(typeof result.passed).toBe('boolean');
      expect(result.totalTests).toBe(1);
      expect(result.annotatedTests).toBe(1);
      expect(result.referencedAtoms).toContain('IA-001');
    });

    // @atom IA-040
    it('should return grade based on overall score', () => {
      // Well-structured test source with good quality signals
      const highQualitySource = `
describe('Calculator', () => {
  // @atom IA-010
  it('adds two numbers correctly', () => {
    // Validates basic addition
    expect(add(2, 3)).toBe(5);
    // Validates boundary case
    expect(add(0, 0)).toBe(0);
  });

  // @atom IA-010
  it('handles negative numbers', () => {
    // Validates negative input
    expect(add(-1, 1)).toBe(0);
  });

  // @atom IA-010
  it('throws on non-numeric input', () => {
    // Error handling
    expect(() => add('a', 1)).toThrow();
  });
});
`;

      const result = service.analyzeTestSource(highQualitySource);

      // Grade should be one of the valid grades
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
    });

    // @atom IA-040
    it('should use default filePath when not provided', () => {
      const sourceCode = `
describe('Test', () => {
  // @atom IA-001
  it('simple test', () => {
    expect(1).toBe(1);
  });
});
`;

      // Should not throw when no filePath is provided
      const result = service.analyzeTestSource(sourceCode);

      // Result should still be valid
      expect(result.totalTests).toBe(1);
      expect(result.dimensions).toBeDefined();
    });

    // @atom IA-040
    it('should use provided filePath for integration test detection', () => {
      const sourceCode = `
describe('Integration', () => {
  // @atom IA-001
  it('integrates with database', () => {
    jest.mock('database');
    expect(query()).toBeDefined();
  });
});
`;

      // With an integration file path, the integration authenticity dimension
      // should detect mocking patterns
      const resultIntegration = service.analyzeTestSource(sourceCode, {
        filePath: 'test/integration/db.spec.ts',
      });

      const resultUnit = service.analyzeTestSource(sourceCode, {
        filePath: 'test/unit/db.spec.ts',
      });

      // Integration test with mocks should have lower authenticity score
      expect(resultIntegration.dimensions.integrationTestAuthenticity.score).toBeLessThanOrEqual(
        resultUnit.dimensions.integrationTestAuthenticity.score,
      );
    });

    // @atom IA-040
    it('should include dimension breakdown with issues', () => {
      const sourceCode = `
describe('Test', () => {
  it('orphan with vacuous assertion', () => {
    expect(true).toBeDefined();
  });
});
`;

      const result = service.analyzeTestSource(sourceCode);

      // Should have dimensions object
      expect(result.dimensions).toBeDefined();
      // Should include intent fidelity dimension
      expect(result.dimensions.intentFidelity).toBeDefined();
      expect(result.dimensions.intentFidelity.score).toBeDefined();
      expect(result.dimensions.intentFidelity.passed).toBeDefined();
      expect(result.dimensions.intentFidelity.issues).toBeDefined();
      // Orphan test should generate intentFidelity issues
      expect(result.dimensions.intentFidelity.issues.length).toBeGreaterThan(0);
      // Vacuous assertion should generate noVacuousTests issues
      expect(result.dimensions.noVacuousTests).toBeDefined();
    });

    // @atom IA-040
    it('should detect zero tests in empty source', () => {
      const sourceCode = `
// An empty file with no test declarations
const helper = () => {};
`;

      const result = service.analyzeTestSource(sourceCode);

      // Should report zero tests
      expect(result.totalTests).toBe(0);
      expect(result.annotatedTests).toBe(0);
      expect(result.referencedAtoms).toHaveLength(0);
    });

    // @atom IA-040
    it('should handle multiple atom annotations', () => {
      const sourceCode = `
describe('MultiAtom', () => {
  // @atom IA-100
  it('first atom test', () => {
    expect(1).toBe(1);
  });

  // @atom IA-200
  it('second atom test', () => {
    expect(2).toBe(2);
  });

  // @atom IA-300
  it('third atom test', () => {
    expect(3).toBe(3);
  });
});
`;

      const result = service.analyzeTestSource(sourceCode);

      // Should detect all three atom references
      expect(result.referencedAtoms).toContain('IA-100');
      expect(result.referencedAtoms).toContain('IA-200');
      expect(result.referencedAtoms).toContain('IA-300');
      expect(result.annotatedTests).toBe(3);
      expect(result.totalTests).toBe(3);
    });
  });

  // ============================================================================
  // Phase 14B: analyzeTestSourceBatch (batch analysis)
  // ============================================================================

  // @atom IA-040
  describe('analyzeTestSourceBatch', () => {
    // @atom IA-040
    it('should analyze multiple test sources in batch', () => {
      const tests = [
        {
          sourceCode: `
describe('Test1', () => {
  // @atom IA-001
  it('test one', () => {
    expect(1).toBe(1);
  });
});
`,
          filePath: 'test1.spec.ts',
          testRecordId: 'record-1',
        },
        {
          sourceCode: `
describe('Test2', () => {
  // @atom IA-002
  it('test two', () => {
    expect(2).toBe(2);
  });
});
`,
          filePath: 'test2.spec.ts',
          testRecordId: 'record-2',
        },
      ];

      const result = service.analyzeTestSourceBatch(tests);

      // Should return results for each test
      expect(result.results).toHaveLength(2);
      // Summary should reflect batch totals
      expect(result.summary.totalAnalyzed).toBe(2);
      expect(result.summary.averageScore).toBeGreaterThan(0);
      // Grade distribution should be populated
      expect(result.summary.gradeDistribution).toBeDefined();
    });

    // @atom IA-040
    it('should preserve testRecordId in results', () => {
      const tests = [
        {
          sourceCode: `
describe('Test', () => {
  // @atom IA-001
  it('test', () => { expect(1).toBe(1); });
});
`,
          testRecordId: 'my-record-id',
        },
      ];

      const result = service.analyzeTestSourceBatch(tests);

      // testRecordId should be passed through to results
      expect(result.results[0].testRecordId).toBe('my-record-id');
    });

    // @atom IA-040
    it('should handle empty batch', () => {
      const result = service.analyzeTestSourceBatch([]);

      // Should return empty results with zero summary
      expect(result.results).toHaveLength(0);
      expect(result.summary.totalAnalyzed).toBe(0);
      expect(result.summary.averageScore).toBe(0);
    });

    // @atom IA-040
    it('should calculate correct average score across batch', () => {
      const tests = [
        {
          sourceCode: `
describe('Good', () => {
  // @atom IA-001
  it('good test', () => {
    // Validates the result
    expect(calc(5)).toBe(25);
    // Boundary check
    expect(calc(0)).toBe(0);
  });
});
`,
        },
        {
          sourceCode: `
describe('Bad', () => {
  it('orphan with no atom', () => {
    expect(true).toBeDefined();
  });
});
`,
        },
      ];

      const result = service.analyzeTestSourceBatch(tests);

      // Average score should be computed
      const expectedAvg = (result.results[0].overallScore + result.results[1].overallScore) / 2;
      expect(result.summary.averageScore).toBeCloseTo(expectedAvg, 1);
    });

    // @atom IA-040
    it('should populate grade distribution', () => {
      const tests = [
        {
          sourceCode: `
describe('Test', () => {
  // @atom IA-001
  it('test', () => {
    // Assertion comment
    expect(1).toBe(1);
    // Boundary
    expect(calc(0)).toBe(0);
  });
});
`,
        },
      ];

      const result = service.analyzeTestSourceBatch(tests);

      // Grade distribution should have at least one grade counted
      const totalGrades = Object.values(result.summary.gradeDistribution).reduce(
        (sum, count) => sum + count,
        0,
      );
      expect(totalGrades).toBe(1);
    });
  });

  // ============================================================================
  // Phase 14B: Quality Profile CRUD
  // ============================================================================

  // @atom IA-040
  describe('listProfiles', () => {
    // @atom IA-040
    it('should list all profiles when no projectId is given', async () => {
      const mockProfiles = [
        {
          id: 'p1',
          name: 'Default',
          description: null,
          projectId: null,
          dimensions: DEFAULT_QUALITY_DIMENSIONS,
          isDefault: true,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];

      mockProfileRepository.find.mockResolvedValue(mockProfiles);

      const result = await service.listProfiles();

      // Should call find without projectId filter
      expect(mockProfileRepository.find).toHaveBeenCalledWith({
        where: {},
        order: { isDefault: 'DESC', name: 'ASC' },
      });
      // Should return mapped response DTOs
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('p1');
      expect(result[0].name).toBe('Default');
      expect(result[0].isDefault).toBe(true);
    });

    // @atom IA-040
    it('should filter profiles by projectId', async () => {
      mockProfileRepository.find.mockResolvedValue([]);

      await service.listProfiles('project-abc');

      // Should include projectId in the where clause
      expect(mockProfileRepository.find).toHaveBeenCalledWith({
        where: { projectId: 'project-abc' },
        order: { isDefault: 'DESC', name: 'ASC' },
      });
    });

    // @atom IA-040
    it('should convert entity dates to ISO strings in response', async () => {
      const createdAt = new Date('2026-01-15T10:30:00Z');
      const updatedAt = new Date('2026-01-16T12:00:00Z');
      mockProfileRepository.find.mockResolvedValue([
        {
          id: 'p2',
          name: 'Strict',
          description: 'High thresholds',
          projectId: 'proj-1',
          dimensions: DEFAULT_QUALITY_DIMENSIONS,
          isDefault: false,
          createdAt,
          updatedAt,
        },
      ]);

      const result = await service.listProfiles();

      // Dates should be ISO strings
      expect(result[0].createdAt).toBe(createdAt.toISOString());
      expect(result[0].updatedAt).toBe(updatedAt.toISOString());
    });
  });

  // @atom IA-040
  describe('getProfile', () => {
    // @atom IA-040
    it('should return a profile by ID', async () => {
      const mockProfile = {
        id: 'p1',
        name: 'Default',
        description: null,
        projectId: null,
        dimensions: DEFAULT_QUALITY_DIMENSIONS,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockProfileRepository.findOne.mockResolvedValue(mockProfile);

      const result = await service.getProfile('p1');

      // Should query by the correct ID
      expect(mockProfileRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'p1' },
      });
      // Should return the profile entity
      expect(result).toBe(mockProfile);
    });

    // @atom IA-040
    it('should return null when profile not found', async () => {
      mockProfileRepository.findOne.mockResolvedValue(null);

      const result = await service.getProfile('nonexistent');

      // Should return null, not throw
      expect(result).toBeNull();
    });
  });

  // @atom IA-040
  describe('getDefaultProfile', () => {
    // @atom IA-040
    it('should return dimensions from default profile', async () => {
      const customDimensions = [
        {
          key: 'intentFidelity',
          name: 'Intent Fidelity',
          weight: 0.3,
          threshold: 0.8,
          enabled: true,
        },
      ];
      mockProfileRepository.findOne.mockResolvedValue({
        dimensions: customDimensions,
      });

      const result = await service.getDefaultProfile();

      // Should return the profile's dimensions
      expect(result).toEqual(customDimensions);
    });

    // @atom IA-040
    it('should return system defaults when no default profile exists', async () => {
      mockProfileRepository.findOne.mockResolvedValue(null);

      const result = await service.getDefaultProfile();

      // Should fall back to DEFAULT_QUALITY_DIMENSIONS
      expect(result).toEqual(DEFAULT_QUALITY_DIMENSIONS);
    });

    // @atom IA-040
    it('should filter by projectId when provided', async () => {
      mockProfileRepository.findOne.mockResolvedValue(null);

      await service.getDefaultProfile('proj-xyz');

      // Should include both isDefault and projectId in query
      expect(mockProfileRepository.findOne).toHaveBeenCalledWith({
        where: { isDefault: true, projectId: 'proj-xyz' },
      });
    });
  });

  // @atom IA-040
  describe('createProfile', () => {
    // @atom IA-040
    it('should create a new quality profile', async () => {
      const params = {
        name: 'Strict Profile',
        description: 'For critical paths',
        dimensions: DEFAULT_QUALITY_DIMENSIONS,
      };

      await service.createProfile(params);

      // Should call create with correct fields
      expect(mockProfileRepository.create).toHaveBeenCalledWith({
        name: 'Strict Profile',
        description: 'For critical paths',
        projectId: null,
        dimensions: DEFAULT_QUALITY_DIMENSIONS,
        isDefault: false,
      });
      // Should save the created entity
      expect(mockProfileRepository.save).toHaveBeenCalled();
    });

    // @atom IA-040
    it('should unset other defaults when creating a default profile', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      };
      mockProfileRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const params = {
        name: 'New Default',
        dimensions: DEFAULT_QUALITY_DIMENSIONS,
        isDefault: true,
      };

      await service.createProfile(params);

      // Should unset existing defaults before creating new one
      expect(mockProfileRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(mockQueryBuilder.set).toHaveBeenCalledWith({ isDefault: false });
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    // @atom IA-040
    it('should not unset defaults when creating a non-default profile', async () => {
      const params = {
        name: 'Not Default',
        dimensions: DEFAULT_QUALITY_DIMENSIONS,
        isDefault: false,
      };

      await service.createProfile(params);

      // Should not call createQueryBuilder for unsetting defaults
      expect(mockProfileRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    // @atom IA-040
    it('should associate profile with a project', async () => {
      const params = {
        name: 'Project Profile',
        projectId: 'proj-123',
        dimensions: DEFAULT_QUALITY_DIMENSIONS,
      };

      await service.createProfile(params);

      // Should include projectId in the created entity
      expect(mockProfileRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-123' }),
      );
    });
  });

  // @atom IA-040
  describe('updateProfile', () => {
    const existingProfile = {
      id: 'p1',
      name: 'Old Name',
      description: 'Old description',
      projectId: null,
      dimensions: DEFAULT_QUALITY_DIMENSIONS,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // @atom IA-040
    it('should update profile fields', async () => {
      mockProfileRepository.findOne.mockResolvedValue({ ...existingProfile });

      const result = await service.updateProfile('p1', {
        name: 'New Name',
        description: 'New description',
      });

      // Should save with updated fields
      expect(mockProfileRepository.save).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.name).toBe('New Name');
      expect(result!.description).toBe('New description');
    });

    // @atom IA-040
    it('should return null when profile not found', async () => {
      mockProfileRepository.findOne.mockResolvedValue(null);

      const result = await service.updateProfile('nonexistent', {
        name: 'Updated',
      });

      // Should return null without attempting save
      expect(result).toBeNull();
      expect(mockProfileRepository.save).not.toHaveBeenCalled();
    });

    // @atom IA-040
    it('should unset other defaults when setting a profile as default', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      };
      mockProfileRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockProfileRepository.findOne.mockResolvedValue({ ...existingProfile });

      await service.updateProfile('p1', { isDefault: true });

      // Should unset existing defaults
      expect(mockProfileRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.set).toHaveBeenCalledWith({ isDefault: false });
    });

    // @atom IA-040
    it('should not unset defaults when profile is already default', async () => {
      mockProfileRepository.findOne.mockResolvedValue({
        ...existingProfile,
        isDefault: true,
      });

      await service.updateProfile('p1', { isDefault: true });

      // Should not call createQueryBuilder since profile is already default
      expect(mockProfileRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    // @atom IA-040
    it('should update dimensions', async () => {
      mockProfileRepository.findOne.mockResolvedValue({ ...existingProfile });

      const newDimensions = [
        {
          key: 'intentFidelity',
          name: 'Intent Fidelity',
          weight: 0.5,
          threshold: 0.9,
          enabled: true,
        },
      ];

      const result = await service.updateProfile('p1', {
        dimensions: newDimensions,
      });

      // Should save with new dimensions
      expect(result).not.toBeNull();
      expect(result!.dimensions).toEqual(newDimensions);
    });
  });

  // @atom IA-040
  describe('deleteProfile', () => {
    // @atom IA-040
    it('should delete a profile and return true when found', async () => {
      mockProfileRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.deleteProfile('p1');

      // Should call delete with correct ID
      expect(mockProfileRepository.delete).toHaveBeenCalledWith({ id: 'p1' });
      // Should return true when deletion was successful
      expect(result).toBe(true);
    });

    // @atom IA-040
    it('should return false when profile not found for deletion', async () => {
      mockProfileRepository.delete.mockResolvedValue({ affected: 0 });

      const result = await service.deleteProfile('nonexistent');

      // Should return false when nothing was deleted
      expect(result).toBe(false);
    });
  });

  // @atom IA-040
  describe('toProfileResponse', () => {
    // @atom IA-040
    it('should convert entity to response DTO format', () => {
      const createdAt = new Date('2026-01-15T10:00:00Z');
      const updatedAt = new Date('2026-01-16T14:30:00Z');
      const profile = {
        id: 'p1',
        name: 'Test Profile',
        description: 'A test profile',
        projectId: 'proj-1',
        dimensions: DEFAULT_QUALITY_DIMENSIONS,
        isDefault: false,
        createdAt,
        updatedAt,
      } as QualityProfile;

      const result = service.toProfileResponse(profile);

      // Should map all fields correctly
      expect(result.id).toBe('p1');
      expect(result.name).toBe('Test Profile');
      expect(result.description).toBe('A test profile');
      expect(result.projectId).toBe('proj-1');
      expect(result.dimensions).toEqual(DEFAULT_QUALITY_DIMENSIONS);
      expect(result.isDefault).toBe(false);
      // Dates should be ISO strings
      expect(result.createdAt).toBe(createdAt.toISOString());
      expect(result.updatedAt).toBe(updatedAt.toISOString());
    });
  });
});
