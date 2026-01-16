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
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs';
import { TestQualityService, QualityAnalysisResult } from './test-quality.service';
import { TestQualitySnapshot } from './test-quality-snapshot.entity';

// Mock fs module
jest.mock('fs');

describe('TestQualityService', () => {
  let service: TestQualityService;
  let mockSnapshotRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };

  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(async () => {
    mockSnapshotRepository = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'snapshot-1', ...data })),
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestQualityService,
        {
          provide: getRepositoryToken(TestQualitySnapshot),
          useValue: mockSnapshotRepository,
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
});
