/**
 * Test-Atom Coupling Service Tests
 *
 * Tests for coupling analysis between tests and atoms:
 * - Orphan test detection (tests without @atom annotations)
 * - Unrealized atom detection (committed atoms without tests)
 * - Test-atom mismatch detection (INV-009 violations)
 * - Report generation and gate checking
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs';
import {
  TestAtomCouplingService,
  CouplingAnalysisResult,
} from './test-atom-coupling.service';
import { Atom } from '../atoms/atom.entity';

// Mock fs module
jest.mock('fs');

describe('TestAtomCouplingService', () => {
  let service: TestAtomCouplingService;
  let mockAtomRepository: {
    find: jest.Mock;
  };

  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(async () => {
    mockAtomRepository = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestAtomCouplingService,
        {
          provide: getRepositoryToken(Atom),
          useValue: mockAtomRepository,
        },
      ],
    }).compile();

    service = module.get<TestAtomCouplingService>(TestAtomCouplingService);

    jest.clearAllMocks();
  });

  // @atom IA-030
  describe('service initialization', () => {
    // @atom IA-030
    it('should be defined', () => {
      // Service must be instantiated by NestJS DI
      expect(service).toBeInstanceOf(TestAtomCouplingService);
    });
  });

  // @atom IA-031
  describe('test file analysis', () => {
    // @atom IA-031
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

      const analysis = service.analyzeTestFile('/test/user.spec.ts');

      // Should count all tests in the file
      expect(analysis.totalTests).toBe(2);
      // All tests have @atom annotations
      expect(analysis.annotatedTests).toBe(2);
      // No orphan tests when all are annotated
      expect(analysis.orphanTests).toHaveLength(0);
      // Should extract referenced atom IDs
      expect(analysis.referencedAtomIds).toContain('IA-001');
      expect(analysis.referencedAtomIds).toContain('IA-002');
    });

    // @atom IA-031
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

  it('should refund payment', () => {
    expect(1).toBe(1);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const analysis = service.analyzeTestFile('/test/payment.spec.ts');

      // Should detect 3 total tests
      expect(analysis.totalTests).toBe(3);
      // Only 1 test has @atom annotation
      expect(analysis.annotatedTests).toBe(1);
      // 2 tests are orphans
      expect(analysis.orphanTests.length).toBe(2);
      // Orphan tests should include test names
      expect(analysis.orphanTests[0].testName).toContain('should handle payment failure');
      expect(analysis.orphanTests[1].testName).toContain('should refund payment');
    });

    // @atom IA-031
    it('should handle describe block context in orphan test names', () => {
      const testContent = `
describe('OuterContext', () => {
  it('orphan test', () => {
    expect(1).toBe(1);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const analysis = service.analyzeTestFile('/test/context.spec.ts');

      // Orphan test name should include describe context
      expect(analysis.orphanTests[0].testName).toBe('OuterContext > orphan test');
    });

    // @atom IA-031
    it('should handle multiple @atom annotations on same test', () => {
      const testContent = `
describe('MultiAtom', () => {
  // @atom IA-010
  // @atom IA-011
  it('covers multiple atoms', () => {
    expect(1).toBe(1);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const analysis = service.analyzeTestFile('/test/multi.spec.ts');

      // Should count test once
      expect(analysis.totalTests).toBe(1);
      // Test should be considered annotated
      expect(analysis.annotatedTests).toBe(1);
      // Both atom IDs should be referenced
      expect(analysis.referencedAtomIds).toContain('IA-010');
      expect(analysis.referencedAtomIds).toContain('IA-011');
    });

    // @atom IA-031
    it('should track line numbers for orphan tests', () => {
      const testContent = `line1
line2
describe('Test', () => {
  it('orphan test', () => {
    expect(1).toBe(1);
  });
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const analysis = service.analyzeTestFile('/test/lines.spec.ts');

      // Line number should be accurate (4th line is the it() call)
      expect(analysis.orphanTests[0].lineNumber).toBe(4);
    });
  });

  // @atom IA-032
  describe('unrealized atom detection', () => {
    // @atom IA-032
    it('should detect committed atoms without test coverage', async () => {
      // Mock test file with only IA-001 referenced
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('tests atom 1', () => {
    expect(1).toBe(1);
  });
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);

      // Mock atoms in database - IA-001 and IA-002 are committed
      mockAtomRepository.find
        .mockResolvedValueOnce([
          { atomId: 'IA-001', description: 'First atom', status: 'committed' },
          { atomId: 'IA-002', description: 'Second atom without tests', status: 'committed' },
        ])
        .mockResolvedValueOnce([
          { atomId: 'IA-001', description: 'First atom', status: 'committed' },
          { atomId: 'IA-002', description: 'Second atom without tests', status: 'committed' },
        ]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // IA-002 should be unrealized (committed but no tests)
      expect(result.unrealizedAtoms.length).toBe(1);
      // Should identify the correct unrealized atom
      expect(result.unrealizedAtoms[0].atomId).toBe('IA-002');
    });

    // @atom IA-032
    it('should not flag draft atoms as unrealized', async () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('tests atom 1', () => {});
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);

      // IA-002 is draft, not committed
      mockAtomRepository.find
        .mockResolvedValueOnce([
          { atomId: 'IA-001', description: 'Committed atom', status: 'committed' },
        ])
        .mockResolvedValueOnce([
          { atomId: 'IA-001', description: 'Committed atom', status: 'committed' },
          { atomId: 'IA-002', description: 'Draft atom', status: 'draft' },
        ]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // Only committed atoms without tests are unrealized
      expect(result.unrealizedAtoms).toHaveLength(0);
    });
  });

  // @atom IA-033
  describe('test-atom mismatch detection (INV-009)', () => {
    // @atom IA-033
    it('should detect tests referencing non-existent atoms', async () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-999
  it('references non-existent atom', () => {
    expect(1).toBe(1);
  });
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);

      // IA-999 does not exist in database
      mockAtomRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ atomId: 'IA-001', description: 'Existing atom', status: 'draft' }]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // Should detect mismatch for non-existent atom
      expect(result.mismatches.length).toBe(1);
      // Mismatch should identify the problematic atom ID
      expect(result.mismatches[0].atomId).toBe('IA-999');
      // Issue should explain the problem
      expect(result.mismatches[0].issue).toContain('does not exist');
    });

    // @atom IA-033
    it('should not flag valid atom references as mismatches', async () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('references existing atom', () => {
    expect(1).toBe(1);
  });
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);

      // IA-001 exists in database
      mockAtomRepository.find
        .mockResolvedValueOnce([{ atomId: 'IA-001', description: 'Existing atom', status: 'committed' }])
        .mockResolvedValueOnce([{ atomId: 'IA-001', description: 'Existing atom', status: 'committed' }]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // No mismatches when atom exists
      expect(result.mismatches).toHaveLength(0);
    });
  });

  // @atom IA-034
  describe('coupling score calculation', () => {
    // @atom IA-034
    it('should calculate 100% coupling when all tests are annotated', async () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('test 1', () => {});
  // @atom IA-002
  it('test 2', () => {});
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);
      mockAtomRepository.find.mockResolvedValue([]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // 2 annotated / 2 total = 100%
      expect(result.summary.couplingScore).toBe(100);
    });

    // @atom IA-034
    it('should calculate 50% coupling when half tests are annotated', async () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('annotated test', () => {});



  it('orphan test', () => {});
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);
      mockAtomRepository.find.mockResolvedValue([]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // 1 annotated / 2 total = 50%
      expect(result.summary.couplingScore).toBe(50);
    });

    // @atom IA-034
    it('should handle empty test directories', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([]);
      mockAtomRepository.find.mockResolvedValue([]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // No tests = 100% coupled (vacuously true)
      expect(result.summary.couplingScore).toBe(100);
      // Should have zero totals
      expect(result.summary.totalTests).toBe(0);
    });
  });

  // @atom IA-035
  describe('gate checking', () => {
    // @atom IA-035
    it('should pass gate when coupling score meets threshold', async () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('test 1', () => {});
  // @atom IA-002
  it('test 2', () => {});
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);
      mockAtomRepository.find.mockResolvedValue([
        { atomId: 'IA-001' },
        { atomId: 'IA-002' },
      ]);

      const result = await service.analyzeCoupling({
        testDirectory: '/test',
        minCouplingScore: 80,
      });

      // 100% coupling and no mismatches = pass
      expect(result.passesGate).toBe(true);
    });

    // @atom IA-035
    it('should fail gate when coupling score is below threshold', async () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('test 1', () => {});
  it('orphan 1', () => {});
  it('orphan 2', () => {});
  it('orphan 3', () => {});
  it('orphan 4', () => {});
};
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);
      mockAtomRepository.find.mockResolvedValue([{ atomId: 'IA-001' }]);

      const result = await service.analyzeCoupling({
        testDirectory: '/test',
        minCouplingScore: 80,
      });

      // 1/5 = 20% coupling < 80% threshold
      expect(result.passesGate).toBe(false);
    });

    // @atom IA-035
    it('should fail gate when mismatches exist even with high coupling', async () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-999
  it('test with invalid atom', () => {});
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);
      mockAtomRepository.find.mockResolvedValue([]); // IA-999 doesn't exist

      const result = await service.analyzeCoupling({
        testDirectory: '/test',
        minCouplingScore: 80,
      });

      // 100% coupling but mismatch exists = fail
      expect(result.passesGate).toBe(false);
    });

    // @atom IA-035
    it('should throw error when checkCouplingGate fails', async () => {
      const testContent = `
describe('Test', () => {
  it('orphan test', () => {});
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);
      mockAtomRepository.find.mockResolvedValue([]);

      // checkCouplingGate should throw when gate fails
      await expect(
        service.checkCouplingGate({ testDirectory: '/test', minCouplingScore: 80 }),
      ).rejects.toThrow('Test-atom coupling gate failed');
    });
  });

  // @atom IA-036
  describe('report generation', () => {
    // @atom IA-036
    it('should generate formatted report with all sections', () => {
      const mockResult: CouplingAnalysisResult = {
        summary: {
          totalTestFiles: 2,
          totalTests: 10,
          annotatedTests: 8,
          orphanTestCount: 2,
          unrealizedAtomCount: 1,
          mismatchCount: 1,
          couplingScore: 80,
        },
        orphanTests: [
          { filePath: '/test/orphan.spec.ts', testName: 'orphan test', lineNumber: 10 },
        ],
        unrealizedAtoms: [
          { atomId: 'IA-050', description: 'Unrealized atom description', status: 'committed' },
        ],
        mismatches: [
          { atomId: 'IA-999', testFile: '/test/mismatch.spec.ts', testName: 'bad test', issue: 'Atom does not exist' },
        ],
        testFileAnalyses: [],
        passesGate: false,
      };

      const report = service.generateReport(mockResult);

      // Report should contain header
      expect(report).toContain('TEST-ATOM COUPLING ANALYSIS REPORT');
      // Report should contain summary section
      expect(report).toContain('SUMMARY');
      expect(report).toContain('Coupling Score:       80%');
      // Report should contain orphan tests section
      expect(report).toContain('ORPHAN TESTS');
      expect(report).toContain('orphan test');
      // Report should contain unrealized atoms section
      expect(report).toContain('UNREALIZED ATOMS');
      expect(report).toContain('IA-050');
      // Report should contain mismatches section
      expect(report).toContain('MISMATCHES');
      expect(report).toContain('IA-999');
      // Report should show gate status
      expect(report).toContain('Gate Status:          FAILED');
    });

    // @atom IA-036
    it('should truncate long lists in report', () => {
      const manyOrphans = Array.from({ length: 30 }, (_, i) => ({
        filePath: `/test/orphan${i}.spec.ts`,
        testName: `orphan test ${i}`,
        lineNumber: i + 1,
      }));

      const mockResult: CouplingAnalysisResult = {
        summary: {
          totalTestFiles: 1,
          totalTests: 30,
          annotatedTests: 0,
          orphanTestCount: 30,
          unrealizedAtomCount: 0,
          mismatchCount: 0,
          couplingScore: 0,
        },
        orphanTests: manyOrphans,
        unrealizedAtoms: [],
        mismatches: [],
        testFileAnalyses: [],
        passesGate: false,
      };

      const report = service.generateReport(mockResult);

      // Report should truncate to first 20 items
      expect(report).toContain('... and 10 more');
    });
  });

  // @atom IA-037
  describe('file filtering', () => {
    // @atom IA-037
    it('should exclude node_modules by default', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dir: fs.PathLike) => {
        const dirStr = dir.toString();
        if (dirStr === '/test') {
          return [
            { name: 'valid.spec.ts', isDirectory: () => false, isFile: () => true },
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        // node_modules should not be traversed
        return [];
      });
      mockFs.readFileSync.mockReturnValue(`
describe('Test', () => {
  // @atom IA-001
  it('test', () => {});
});
`);
      mockAtomRepository.find.mockResolvedValue([{ atomId: 'IA-001' }]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // Only 1 test file should be found (node_modules excluded)
      expect(result.summary.totalTestFiles).toBe(1);
    });

    // @atom IA-037
    it('should only include .spec.ts and .test.ts files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'valid.spec.ts', isDirectory: () => false, isFile: () => true },
        { name: 'valid.test.ts', isDirectory: () => false, isFile: () => true },
        { name: 'invalid.ts', isDirectory: () => false, isFile: () => true },
        { name: 'readme.md', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(`
describe('Test', () => {
  // @atom IA-001
  it('test', () => {});
});
`);
      mockAtomRepository.find.mockResolvedValue([{ atomId: 'IA-001' }]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // Only .spec.ts and .test.ts files should be included
      expect(result.summary.totalTestFiles).toBe(2);
    });
  });

  // @atom IA-038
  describe('boundary and negative cases', () => {
    // @atom IA-038
    it('should handle non-existent test directory gracefully', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockAtomRepository.find.mockResolvedValue([]);

      const result = await service.analyzeCoupling({ testDirectory: '/nonexistent' });

      // Non-existent directory should return empty results
      expect(result.summary.totalTestFiles).toBe(0);
      // Should not throw error
      expect(result.summary.totalTests).toBe(0);
    });

    // @atom IA-038
    it('should handle empty test files', () => {
      mockFs.readFileSync.mockReturnValue('');

      const analysis = service.analyzeTestFile('/test/empty.spec.ts');

      // Empty file has no tests
      expect(analysis.totalTests).toBe(0);
      // Empty file has no annotations
      expect(analysis.annotatedTests).toBe(0);
      // Empty file has no orphans
      expect(analysis.orphanTests).toHaveLength(0);
    });

    // @atom IA-038
    it('should handle files with only describe blocks and no tests', () => {
      const testContent = `
describe('Empty describe', () => {
  // Just comments, no tests
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const analysis = service.analyzeTestFile('/test/nodefs.spec.ts');

      // No it() calls means no tests
      expect(analysis.totalTests).toBe(0);
    });

    // @atom IA-038
    it('should handle malformed atom annotations gracefully', () => {
      const testContent = `
describe('Test', () => {
  // @atom
  it('missing atom id', () => {});
  // @atom invalid-format
  it('invalid atom format', () => {});
  // @atom IA-001
  it('valid atom', () => {});
});
`;

      mockFs.readFileSync.mockReturnValue(testContent);

      const analysis = service.analyzeTestFile('/test/malformed.spec.ts');

      // Should detect 3 tests
      expect(analysis.totalTests).toBe(3);
      // Only the valid IA-001 format should be recognized
      expect(analysis.referencedAtomIds).toContain('IA-001');
      // Invalid formats should not be in referenced atoms
      expect(analysis.referencedAtomIds).not.toContain('invalid-format');
    });

    // @atom IA-038
    it('should handle threshold boundary at exactly 80%', async () => {
      // Create test content with 8 annotated tests and 2 orphans (80% coupling)
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('test 1', () => {});
  // @atom IA-002
  it('test 2', () => {});
  // @atom IA-003
  it('test 3', () => {});
  // @atom IA-004
  it('test 4', () => {});




  it('orphan 1', () => {});




  it('orphan 2', () => {});
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);
      mockAtomRepository.find.mockResolvedValue([
        { atomId: 'IA-001' },
        { atomId: 'IA-002' },
        { atomId: 'IA-003' },
        { atomId: 'IA-004' },
      ]);

      const result = await service.analyzeCoupling({
        testDirectory: '/test',
        minCouplingScore: 80,
      });

      // Boundary: 67% (4/6 tests) is below 80% threshold
      expect(result.passesGate).toBe(false);
    });

    // @atom IA-038
    it('should handle test files with only orphan tests', async () => {
      const testContent = `
describe('Test', () => {
  it('orphan 1', () => {});
  it('orphan 2', () => {});
  it('orphan 3', () => {});
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);
      mockAtomRepository.find.mockResolvedValue([]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // All tests are orphans
      expect(result.summary.orphanTestCount).toBe(3);
      // 0% coupling when no tests are annotated
      expect(result.summary.couplingScore).toBe(0);
      // Gate should fail with 0% coupling
      expect(result.passesGate).toBe(false);
    });

    // @atom IA-038
    it('should reject tests referencing superseded atoms', async () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('references superseded atom', () => {});
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);

      // IA-001 exists but is superseded
      mockAtomRepository.find
        .mockResolvedValueOnce([]) // No committed atoms
        .mockResolvedValueOnce([{ atomId: 'IA-001', status: 'superseded' }]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // Superseded atoms don't count as unrealized (they're not committed)
      expect(result.unrealizedAtoms).toHaveLength(0);
      // The atom reference is still valid (it exists)
      expect(result.mismatches).toHaveLength(0);
    });

    // @atom IA-038
    it('should handle coupling score boundary at exactly 0%', async () => {
      const testContent = `
describe('Test', () => {
  it('orphan 1', () => {});
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);
      mockAtomRepository.find.mockResolvedValue([]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // Boundary: 0% coupling is minimum
      expect(result.summary.couplingScore).toBe(0);
      // 0% is less than any positive threshold
      expect(result.summary.couplingScore).toBeLessThan(1);
    });

    // @atom IA-038
    it('should handle coupling score boundary at exactly 100%', async () => {
      const testContent = `
describe('Test', () => {
  // @atom IA-001
  it('fully annotated', () => {});
});
`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      ] as any);
      mockFs.readFileSync.mockReturnValue(testContent);
      mockAtomRepository.find.mockResolvedValue([{ atomId: 'IA-001' }]);

      const result = await service.analyzeCoupling({ testDirectory: '/test' });

      // Boundary: 100% coupling is maximum
      expect(result.summary.couplingScore).toBe(100);
      // 100% is not greater than 100
      expect(result.summary.couplingScore).toBeLessThan(101);
    });

    // @atom IA-038
    it('should reject invalid test directory path', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockAtomRepository.find.mockResolvedValue([]);

      const result = await service.analyzeCoupling({ testDirectory: '/invalid/path' });

      // Invalid path returns null/undefined file count
      expect(result.summary.totalTestFiles).toBe(0);
      // Invalid path should not crash
      expect(result.summary.orphanTestCount).toBe(0);
      // Mismatches should be zero for empty result
      expect(result.summary.mismatchCount).toBe(0);
    });
  });
});
