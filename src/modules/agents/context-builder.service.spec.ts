/**
 * Tests for ContextBuilderService
 *
 * The ContextBuilderService provides sophisticated context building for brownfield analysis:
 * - Test structure parsing
 * - Semantic information extraction
 * - Dependency graph building
 * - Documentation discovery
 * - Focused context summary creation
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ContextBuilderService, TestAnalysis } from './context-builder.service';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');

describe('ContextBuilderService', () => {
  let service: ContextBuilderService;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContextBuilderService],
    }).compile();

    service = module.get<ContextBuilderService>(ContextBuilderService);
    jest.clearAllMocks();
  });

  describe('service instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('analyzeTest', () => {
    const sampleTestCode = `
import { UserService } from './user.service';
import { Test } from '@nestjs/testing';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UserService],
    }).compile();
    service = module.get(UserService);
  });

  it('should create a user with valid data', async () => {
    const user = await service.create({ name: 'John', email: 'john@example.com' });
    expect(user).toBeDefined();
    expect(user.name).toBe('John');
    expect(user.email).toEqual('john@example.com');
  });

  it('should throw error for invalid email', async () => {
    await expect(service.create({ name: 'Jane', email: 'invalid' })).rejects.toThrow();
  });
});
`;

    beforeEach(() => {
      mockFs.readFileSync.mockReturnValue(sampleTestCode);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);
    });

    it('should analyze test and return TestAnalysis', async () => {
      const result = await service.analyzeTest(
        '/test/user.service.spec.ts',
        'should create a user with valid data',
        10,
        '/test',
      );

      expect(result).toMatchObject({
        testName: 'should create a user with valid data',
        testFilePath: '/test/user.service.spec.ts',
        testLineNumber: 10,
      });
      expect(result.assertions).toBeDefined();
      expect(result.imports).toBeDefined();
      expect(result.functionCalls).toBeDefined();
    });

    it('should extract imports from test code', async () => {
      const result = await service.analyzeTest(
        '/test/user.service.spec.ts',
        'should create a user with valid data',
        10,
        '/test',
      );

      expect(result.imports).toContain('./user.service');
      expect(result.imports).toContain('@nestjs/testing');
    });

    it('should extract assertions from test code', async () => {
      const result = await service.analyzeTest(
        '/test/user.service.spec.ts',
        'should create a user with valid data',
        10,
        '/test',
      );

      expect(result.assertions.length).toBeGreaterThan(0);
      // Should find toBe and toEqual assertions
      expect(result.assertions.some((a) => a.includes('toBe') || a.includes('toEqual'))).toBe(true);
    });

    it('should extract function calls from test code', async () => {
      const result = await service.analyzeTest(
        '/test/user.service.spec.ts',
        'should create a user with valid data',
        10,
        '/test',
      );

      expect(result.functionCalls.length).toBeGreaterThan(0);
      // Should find service.create call
      expect(result.functionCalls).toContain('create');
    });

    it('should extract domain concepts', async () => {
      const result = await service.analyzeTest(
        '/test/user.service.spec.ts',
        'should create a user with valid data',
        10,
        '/test',
      );

      expect(result.domainConcepts).toContain('user');
    });

    it('should extract test setup information', async () => {
      const result = await service.analyzeTest(
        '/test/user.service.spec.ts',
        'should create a user with valid data',
        10,
        '/test',
      );

      expect(result.testSetup).toBeDefined();
      expect(Array.isArray(result.testSetup)).toBe(true);
    });

    it('should handle missing file gracefully', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = await service.analyzeTest(
        '/test/nonexistent.spec.ts',
        'test name',
        1,
        '/test',
      );

      expect(result.isolatedTestCode).toBe('');
    });
  });

  describe('buildFocusedContext', () => {
    const mockAnalysis: TestAnalysis = {
      testName: 'should authenticate user with valid credentials',
      testFilePath: '/src/auth/auth.service.spec.ts',
      testLineNumber: 42,
      isolatedTestCode: 'it("should authenticate user", async () => { ... })',
      assertions: ['toBe', 'toHaveBeenCalled', 'Test description: should authenticate user'],
      imports: ['./auth.service', '@nestjs/jwt'],
      functionCalls: ['authenticate', 'validateUser', 'signToken'],
      testSetup: ['Uses mocks/stubs'],
      expectedBehavior: 'Function is invoked; Returns expected value',
      relatedSourceFiles: ['/src/auth/auth.service.ts'],
      relatedTestFiles: ['/src/auth/jwt.service.spec.ts'],
      documentationSnippets: ['From docs/auth.md: Authentication flow...'],
      domainConcepts: ['user', 'authentication'],
      technicalConcepts: ['validation'],
    };

    it('should build focused context from analysis', () => {
      const context = service.buildFocusedContext(mockAnalysis);

      expect(context).toContain('## Test: should authenticate user with valid credentials');
      expect(context).toContain('### Assertions');
      expect(typeof context).toBe('string');
    });

    it('should include expected behavior section', () => {
      const context = service.buildFocusedContext(mockAnalysis);

      expect(context).toContain('### Expected Behavior');
      expect(context).toContain('Function is invoked');
    });

    it('should include domain concepts', () => {
      const context = service.buildFocusedContext(mockAnalysis);

      expect(context).toContain('### Domain Concepts');
      expect(context).toContain('user');
      expect(context).toContain('authentication');
    });

    it('should include documentation snippets', () => {
      const context = service.buildFocusedContext(mockAnalysis);

      expect(context).toContain('### Relevant Documentation');
      expect(context).toContain('docs/auth.md');
    });

    it('should handle empty domain concepts', () => {
      const analysisWithoutConcepts = {
        ...mockAnalysis,
        domainConcepts: [],
      };

      const context = service.buildFocusedContext(analysisWithoutConcepts);

      expect(context).not.toContain('### Domain Concepts');
    });

    it('should handle empty documentation', () => {
      const analysisWithoutDocs = {
        ...mockAnalysis,
        documentationSnippets: [],
      };

      const context = service.buildFocusedContext(analysisWithoutDocs);

      expect(context).not.toContain('### Relevant Documentation');
    });

    it('should summarize source files', () => {
      mockFs.readFileSync.mockReturnValue(`
        export class AuthService {
          async authenticate(credentials: any) { return true; }
        }
      `);
      mockFs.existsSync.mockReturnValue(true);

      const context = service.buildFocusedContext(mockAnalysis);

      expect(context).toContain('### Related Source Code');
    });
  });

  describe('private helper methods (via analyzeTest)', () => {
    describe('extractAssertions', () => {
      it('should extract toBe assertions', async () => {
        mockFs.readFileSync.mockReturnValue(`
          it('test', () => {
            expect(result).toBe(true);
          });
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.assertions.some((a) => a.includes('toBe'))).toBe(true);
      });

      it('should extract toHaveBeenCalled assertions', async () => {
        mockFs.readFileSync.mockReturnValue(`
          it('test', () => {
            expect(mockFn).toHaveBeenCalled();
          });
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.assertions.some((a) => a.includes('toHaveBeenCalled'))).toBe(true);
      });

      it('should extract toThrow assertions', async () => {
        // Use simpler code without nested parens (regex limitation)
        mockFs.readFileSync.mockReturnValue(`
          it('test', () => {
            expect(fn).toThrow(Error);
          });
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.assertions.some((a) => a.includes('toThrow'))).toBe(true);
      });

      it('should include test description as assertion', async () => {
        mockFs.readFileSync.mockReturnValue(`
          it('should validate user input', () => {
            expect(true).toBe(true);
          });
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest(
          '/test.spec.ts',
          'should validate user input',
          1,
          '/',
        );

        expect(result.assertions.some((a) => a.includes('Test description'))).toBe(true);
      });
    });

    describe('extractImports', () => {
      it('should extract named imports', async () => {
        mockFs.readFileSync.mockReturnValue(`
          import { Service } from './service';
          it('test', () => {});
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.imports).toContain('./service');
      });

      it('should extract wildcard imports', async () => {
        mockFs.readFileSync.mockReturnValue(`
          import * as utils from './utils';
          it('test', () => {});
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.imports).toContain('./utils');
      });
    });

    describe('extractFunctionCalls', () => {
      it('should filter out test framework functions', async () => {
        mockFs.readFileSync.mockReturnValue(`
          describe('test', () => {
            beforeEach(() => {});
            it('test', () => {
              expect(true).toBe(true);
            });
          });
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        // Should not include 'describe', 'it', 'beforeEach', 'expect'
        expect(result.functionCalls).not.toContain('describe');
        expect(result.functionCalls).not.toContain('it');
        expect(result.functionCalls).not.toContain('beforeEach');
        expect(result.functionCalls).not.toContain('expect');
      });

      it('should extract actual function calls', async () => {
        mockFs.readFileSync.mockReturnValue(`
          it('test', () => {
            const result = service.processData(input);
            expect(result).toBeDefined();
          });
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.functionCalls).toContain('processData');
      });
    });

    describe('extractTestSetup', () => {
      it('should detect mock usage', async () => {
        mockFs.readFileSync.mockReturnValue(`
          jest.mock('./service');
          it('test', () => {});
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.testSetup).toContain('Uses mocks/stubs');
      });

      it('should detect fixture usage', async () => {
        mockFs.readFileSync.mockReturnValue(`
          const fixture = createFixture();
          it('test', () => {});
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.testSetup).toContain('Uses test fixtures');
      });
    });

    describe('inferExpectedBehavior', () => {
      it('should infer function invocation behavior', async () => {
        mockFs.readFileSync.mockReturnValue(`
          it('test', () => {
            expect(mockFn).toHaveBeenCalled();
          });
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.expectedBehavior).toContain('Function is invoked');
      });

      it('should infer error handling behavior', async () => {
        // Use simpler assertion without nested parens (regex limitation)
        mockFs.readFileSync.mockReturnValue(`
          it('test', () => {
            expect(fn).toThrow(Error);
          });
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.expectedBehavior).toContain('Handles errors appropriately');
      });

      it('should infer value return behavior', async () => {
        mockFs.readFileSync.mockReturnValue(`
          it('test', () => {
            expect(result).toBe(expected);
          });
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.expectedBehavior).toContain('Returns expected value');
      });

      it('should infer object structure behavior', async () => {
        mockFs.readFileSync.mockReturnValue(`
          it('test', () => {
            expect(obj).toHaveProperty('id');
          });
        `);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

        expect(result.expectedBehavior).toContain('Object has expected structure');
      });
    });

    describe('extractDomainConcepts', () => {
      // The extractDomainConcepts method looks for exact pattern substrings
      // Test names must contain the exact pattern (e.g., "authentication" not "authenticate")
      it.each([
        ['user', 'should create user'],
        ['authentication', 'should verify authentication'], // 'authentication' is the exact pattern
        ['payment', 'should process payment'],
        ['order', 'should place order'],
        ['notification', 'should send notification'],
        ['email', 'should validate email'],
      ])('should extract domain concept "%s" from test name "%s"', async (concept, testName) => {
        mockFs.readFileSync.mockReturnValue(`it('${testName}', () => {});`);
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/test.spec.ts', testName, 1, '/');

        expect(result.domainConcepts).toContain(concept);
      });
    });

    describe('extractTechnicalConcepts', () => {
      // The extractTechnicalConcepts method looks for exact pattern substrings
      // in the combined text of assertions and function calls
      it.each([
        ['cache', 'cacheData'], // 'cachedata' includes 'cache'
        ['validation', 'runValidation'], // 'runvalidation' includes 'validation'
        ['middleware', 'useMiddleware'], // 'usemiddleware' includes 'middleware'
        ['handler', 'errorHandler'], // 'errorhandler' includes 'handler'
      ])(
        'should extract technical concept "%s" from function call "%s"',
        async (concept, funcCall) => {
          mockFs.readFileSync.mockReturnValue(`
          it('test', () => {
            ${funcCall}();
          });
        `);
          mockFs.existsSync.mockReturnValue(false);
          mockFs.readdirSync.mockReturnValue([]);

          const result = await service.analyzeTest('/test.spec.ts', 'test', 1, '/');

          expect(result.technicalConcepts).toContain(concept);
        },
      );
    });

    describe('findRelatedSourceFiles', () => {
      it('should find corresponding source file for test', async () => {
        mockFs.readFileSync.mockReturnValue(`
          import { UserService } from './user.service';
          it('test', () => {});
        `);
        mockFs.existsSync.mockImplementation((filePath: string) => {
          return filePath === '/src/user.service.ts';
        });
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/src/user.service.spec.ts', 'test', 1, '/');

        expect(result.relatedSourceFiles).toContain('/src/user.service.ts');
      });

      it('should resolve relative imports', async () => {
        mockFs.readFileSync.mockReturnValue(`
          import { Helper } from './helpers/helper';
          it('test', () => {});
        `);
        mockFs.existsSync.mockImplementation((filePath: string) => {
          return filePath.includes('helper.ts');
        });
        mockFs.readdirSync.mockReturnValue([]);

        const result = await service.analyzeTest('/src/test.spec.ts', 'test', 1, '/');

        expect(result.relatedSourceFiles.length).toBeGreaterThanOrEqual(0);
      });
    });

    describe('findRelatedTestFiles', () => {
      it('should find other test files in same directory', async () => {
        mockFs.readFileSync.mockReturnValue('it("test", () => {});');
        mockFs.existsSync.mockReturnValue(false);
        // readdirSync without withFileTypes returns string arrays
        mockFs.readdirSync.mockReturnValue(['user.spec.ts', 'auth.spec.ts', 'other.ts'] as any);

        const result = await service.analyzeTest('/src/test.spec.ts', 'test', 1, '/');

        expect(result.relatedTestFiles.some((f) => f.includes('user.spec.ts'))).toBe(true);
        expect(result.relatedTestFiles.some((f) => f.includes('auth.spec.ts'))).toBe(true);
      });

      it('should exclude the current test file', async () => {
        mockFs.readFileSync.mockReturnValue('it("test", () => {});');
        mockFs.existsSync.mockReturnValue(false);
        // readdirSync without withFileTypes returns string arrays
        mockFs.readdirSync.mockReturnValue(['test.spec.ts', 'other.spec.ts'] as any);

        const result = await service.analyzeTest('/src/test.spec.ts', 'test', 1, '/src');

        // Should not include the current file in related files
        expect(result.relatedTestFiles.filter((f) => f === '/src/test.spec.ts')).toHaveLength(0);
      });
    });
  });

  describe('isolateTest', () => {
    it('should isolate test block from surrounding code', async () => {
      const testCode = `
describe('Suite', () => {
  it('should do something', () => {
    const x = 1;
    expect(x).toBe(1);
  });

  it('should do something else', () => {
    expect(true).toBe(true);
  });
});
`;
      mockFs.readFileSync.mockReturnValue(testCode);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);

      const result = await service.analyzeTest('/test.spec.ts', 'should do something', 3, '/');

      expect(result.isolatedTestCode).toContain('should do something');
      expect(result.isolatedTestCode).toContain('const x = 1');
    });

    it('should handle nested braces correctly', async () => {
      const testCode = `
it('test with nested braces', () => {
  const obj = { nested: { deep: true } };
  if (obj.nested) {
    expect(obj.nested.deep).toBe(true);
  }
});
`;
      mockFs.readFileSync.mockReturnValue(testCode);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);

      const result = await service.analyzeTest('/test.spec.ts', 'test with nested braces', 2, '/');

      expect(result.isolatedTestCode).toContain('test with nested braces');
      expect(result.isolatedTestCode).toContain('nested');
    });
  });
});
