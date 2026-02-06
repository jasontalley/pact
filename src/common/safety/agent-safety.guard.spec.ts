/**
 * Agent Safety Guard Tests
 *
 * Tests for the NestJS guard that enforces safety checks at the route level.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AgentSafetyGuard,
  AgentSafetyInterceptor,
  SafetyException,
  AGENT_ID_KEY,
  SKIP_SAFETY_KEY,
} from './agent-safety.guard';
import { AgentSafetyService, SafetyContext } from './agent-safety.service';
import { SafetyViolationType } from './constitution';
import { of } from 'rxjs';

describe('AgentSafetyGuard', () => {
  let guard: AgentSafetyGuard;
  let mockSafetyService: jest.Mocked<AgentSafetyService>;
  let mockReflector: jest.Mocked<Reflector>;

  const mockSafetyContext: SafetyContext = {
    agentId: 'test-agent',
    sessionId: 'test-session',
    timestamp: new Date(),
    workspaceRoot: '/test/workspace',
  };

  beforeEach(async () => {
    mockSafetyService = {
      createContext: jest.fn().mockReturnValue(mockSafetyContext),
      validateRequest: jest.fn().mockReturnValue({
        allowed: true,
        sanitizedInput: 'test input',
        allViolations: [],
        overallRiskScore: 0,
        agentProfile: {
          id: 'test-agent',
          name: 'Test Agent',
          description: 'Test',
          allowedTools: [],
        },
        inputValidation: {
          passed: true,
          violations: [],
          riskScore: 0,
          sanitized: 'test input',
        },
      }),
      validateResponse: jest.fn().mockReturnValue({
        sanitizedOutput: 'test output',
      }),
    } as unknown as jest.Mocked<AgentSafetyService>;

    mockReflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentSafetyGuard,
        { provide: AgentSafetyService, useValue: mockSafetyService },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<AgentSafetyGuard>(AgentSafetyGuard);
  });

  function createMockExecutionContext(body: Record<string, unknown> = {}): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          body,
          headers: {},
        }),
      }),
    } as unknown as ExecutionContext;
  }

  describe('canActivate', () => {
    it('should return true when safety is skipped via metadata', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === SKIP_SAFETY_KEY) return true;
        return undefined;
      });

      const context = createMockExecutionContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockSafetyService.validateRequest).not.toHaveBeenCalled();
    });

    it('should return true when there is no input to validate', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      const context = createMockExecutionContext({});
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockSafetyService.validateRequest).not.toHaveBeenCalled();
    });

    it('should validate input when present in request body', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === AGENT_ID_KEY) return 'test-agent';
        return undefined;
      });

      const context = createMockExecutionContext({ message: 'Hello world' });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockSafetyService.createContext).toHaveBeenCalled();
      expect(mockSafetyService.validateRequest).toHaveBeenCalledWith(
        'Hello world',
        [],
        mockSafetyContext,
      );
    });

    it('should extract input from various field names', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      // Test with 'input' field
      let context = createMockExecutionContext({ input: 'test input' });
      await guard.canActivate(context);
      expect(mockSafetyService.validateRequest).toHaveBeenLastCalledWith(
        'test input',
        [],
        mockSafetyContext,
      );

      // Test with 'query' field
      context = createMockExecutionContext({ query: 'test query' });
      await guard.canActivate(context);
      expect(mockSafetyService.validateRequest).toHaveBeenLastCalledWith(
        'test query',
        [],
        mockSafetyContext,
      );

      // Test with 'prompt' field
      context = createMockExecutionContext({ prompt: 'test prompt' });
      await guard.canActivate(context);
      expect(mockSafetyService.validateRequest).toHaveBeenLastCalledWith(
        'test prompt',
        [],
        mockSafetyContext,
      );

      // Test with 'content' field
      context = createMockExecutionContext({ content: 'test content' });
      await guard.canActivate(context);
      expect(mockSafetyService.validateRequest).toHaveBeenLastCalledWith(
        'test content',
        [],
        mockSafetyContext,
      );

      // Test with 'text' field
      context = createMockExecutionContext({ text: 'test text' });
      await guard.canActivate(context);
      expect(mockSafetyService.validateRequest).toHaveBeenLastCalledWith(
        'test text',
        [],
        mockSafetyContext,
      );
    });

    it('should extract tools from request body', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      const context = createMockExecutionContext({
        message: 'run tool',
        tools: [{ name: 'tool1' }, { name: 'tool2' }],
      });

      await guard.canActivate(context);

      expect(mockSafetyService.validateRequest).toHaveBeenCalledWith(
        'run tool',
        ['tool1', 'tool2'],
        mockSafetyContext,
      );
    });

    it('should extract toolCalls from request body', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      const context = createMockExecutionContext({
        message: 'run tool',
        toolCalls: [{ name: 'bash' }, { name: 'read' }],
      });

      await guard.canActivate(context);

      expect(mockSafetyService.validateRequest).toHaveBeenCalledWith(
        'run tool',
        ['bash', 'read'],
        mockSafetyContext,
      );
    });

    it('should throw SafetyException when validation fails', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      mockSafetyService.validateRequest.mockReturnValue({
        allowed: false,
        sanitizedInput: '',
        allViolations: [
          {
            type: SafetyViolationType.PROMPT_INJECTION,
            message: 'Detected injection attack',
            severity: 'critical',
            rule: 'no-injection',
          },
        ],
        overallRiskScore: 95,
        agentProfile: { id: 'test', name: 'Test', description: 'Test', allowedTools: [] },
        inputValidation: {
          passed: false,
          violations: [
            {
              type: SafetyViolationType.PROMPT_INJECTION,
              message: 'Detected injection attack',
              severity: 'critical',
              rule: 'no-injection',
            },
          ],
          riskScore: 95,
          sanitized: '',
        },
      });

      const context = createMockExecutionContext({ message: 'malicious input' });

      await expect(guard.canActivate(context)).rejects.toThrow(SafetyException);
    });

    it('should use agentId from request body if not in metadata', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      const context = createMockExecutionContext({
        message: 'test',
        agentId: 'body-agent-id',
      });

      await guard.canActivate(context);

      expect(mockSafetyService.createContext).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'body-agent-id',
        }),
      );
    });

    it('should use sessionId from request body', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      const context = createMockExecutionContext({
        message: 'test',
        sessionId: 'custom-session',
      });

      await guard.canActivate(context);

      expect(mockSafetyService.createContext).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'custom-session',
        }),
      );
    });

    it('should attach sanitized input to request on success', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      const request = { body: { message: 'test' }, headers: {} };
      const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      expect((request as any).sanitizedInput).toBe('test input');
      expect((request as any).safetyContext).toBe(mockSafetyContext);
    });
  });
});

describe('SafetyException', () => {
  it('should create exception with correct properties', () => {
    const violations = [
      {
        type: SafetyViolationType.PROMPT_INJECTION,
        message: 'Test violation',
        severity: 'critical' as const,
      },
    ];
    const exception = new SafetyException('Test error', violations, 85);

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.violations).toEqual(violations);
    expect(exception.riskScore).toBe(85);

    const response = exception.getResponse();
    expect(response).toMatchObject({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Safety Violation',
      message: 'Test error',
      riskScore: 85,
    });
  });
});

describe('AgentSafetyInterceptor', () => {
  let interceptor: AgentSafetyInterceptor;
  let mockSafetyService: jest.Mocked<AgentSafetyService>;

  beforeEach(async () => {
    mockSafetyService = {
      validateResponse: jest.fn().mockReturnValue({
        sanitizedOutput: 'sanitized message',
      }),
    } as unknown as jest.Mocked<AgentSafetyService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentSafetyInterceptor,
        { provide: AgentSafetyService, useValue: mockSafetyService },
      ],
    }).compile();

    interceptor = module.get<AgentSafetyInterceptor>(AgentSafetyInterceptor);
  });

  it('should pass through when no safety context', (done) => {
    const context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({}),
      }),
    } as unknown as ExecutionContext;

    const callHandler = {
      handle: () => of({ message: 'original' }),
    };

    interceptor.intercept(context, callHandler).subscribe((result) => {
      expect(result).toEqual({ message: 'original' });
      expect(mockSafetyService.validateResponse).not.toHaveBeenCalled();
      done();
    });
  });

  it('should sanitize response message when safety context exists', (done) => {
    const safetyContext: SafetyContext = {
      agentId: 'test',
      sessionId: 'test',
      timestamp: new Date(),
      workspaceRoot: '/test',
    };

    const context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ safetyContext }),
      }),
    } as unknown as ExecutionContext;

    const callHandler = {
      handle: () => of({ message: 'original message', other: 'data' }),
    };

    interceptor.intercept(context, callHandler).subscribe((result) => {
      expect(result).toEqual({ message: 'sanitized message', other: 'data' });
      expect(mockSafetyService.validateResponse).toHaveBeenCalledWith(
        'original message',
        safetyContext,
      );
      done();
    });
  });

  it('should pass through non-object responses', (done) => {
    const safetyContext: SafetyContext = {
      agentId: 'test',
      sessionId: 'test',
      timestamp: new Date(),
      workspaceRoot: '/test',
    };

    const context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ safetyContext }),
      }),
    } as unknown as ExecutionContext;

    const callHandler = {
      handle: () => of('string response'),
    };

    interceptor.intercept(context, callHandler).subscribe((result) => {
      expect(result).toBe('string response');
      expect(mockSafetyService.validateResponse).not.toHaveBeenCalled();
      done();
    });
  });

  it('should pass through objects without message field', (done) => {
    const safetyContext: SafetyContext = {
      agentId: 'test',
      sessionId: 'test',
      timestamp: new Date(),
      workspaceRoot: '/test',
    };

    const context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ safetyContext }),
      }),
    } as unknown as ExecutionContext;

    const callHandler = {
      handle: () => of({ data: 'test', status: 'ok' }),
    };

    interceptor.intercept(context, callHandler).subscribe((result) => {
      expect(result).toEqual({ data: 'test', status: 'ok' });
      expect(mockSafetyService.validateResponse).not.toHaveBeenCalled();
      done();
    });
  });
});
