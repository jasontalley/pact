import { Test, TestingModule } from '@nestjs/testing';
import {
  ToolPermissionsService,
  AGENT_PROFILES,
  DEFAULT_AGENT_PROFILE,
} from './tool-permissions.service';
import { SafetyViolationType } from './constitution';

describe('ToolPermissionsService', () => {
  let service: ToolPermissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolPermissionsService],
    }).compile();

    service = module.get<ToolPermissionsService>(ToolPermissionsService);
  });

  describe('getProfile', () => {
    it('should return chat-agent profile', () => {
      const profile = service.getProfile('chat-agent');

      expect(profile.id).toBe('chat-agent');
      expect(profile.name).toBe('Chat Assistant');
      expect(profile.allowedTools).toContain('read_file');
      expect(profile.allowedTools).toContain('list_directory');
    });

    it('should return atomization-agent profile', () => {
      const profile = service.getProfile('atomization-agent');

      expect(profile.id).toBe('atomization-agent');
      expect(profile.allowedTools).toContain('create_atom');
      expect(profile.allowedTools).toContain('update_atom');
    });

    it('should return default profile for unknown agents', () => {
      const profile = service.getProfile('unknown-agent');

      expect(profile.id).toBe('unknown');
      expect(profile.allowedTools.length).toBeLessThan(
        AGENT_PROFILES['chat-agent'].allowedTools.length,
      );
    });
  });

  describe('canUseTool', () => {
    it('should allow chat-agent to use read_file', () => {
      expect(service.canUseTool('chat-agent', 'read_file')).toBe(true);
    });

    it('should allow chat-agent to use list_directory', () => {
      expect(service.canUseTool('chat-agent', 'list_directory')).toBe(true);
    });

    it('should deny chat-agent from using create_atom', () => {
      expect(service.canUseTool('chat-agent', 'create_atom')).toBe(false);
    });

    it('should deny chat-agent from using commit_atom', () => {
      expect(service.canUseTool('chat-agent', 'commit_atom')).toBe(false);
    });

    it('should allow atomization-agent to use create_atom', () => {
      expect(service.canUseTool('atomization-agent', 'create_atom')).toBe(true);
    });

    it('should deny atomization-agent from using commit_atom (explicitly denied)', () => {
      expect(service.canUseTool('atomization-agent', 'commit_atom')).toBe(false);
    });

    it('should allow commit-agent to use commit_atom', () => {
      expect(service.canUseTool('commit-agent', 'commit_atom')).toBe(true);
    });

    it('should deny unknown agent from most tools', () => {
      expect(service.canUseTool('unknown', 'read_file')).toBe(false);
      expect(service.canUseTool('unknown', 'create_atom')).toBe(false);
    });

    it('should allow unknown agent to use basic tools', () => {
      expect(service.canUseTool('unknown', 'list_directory')).toBe(true);
      expect(service.canUseTool('unknown', 'get_atom')).toBe(true);
    });
  });

  describe('validateToolCalls', () => {
    it('should allow valid tools for chat-agent', () => {
      const result = service.validateToolCalls('chat-agent', [
        'read_file',
        'list_directory',
        'get_atom',
      ]);

      expect(result.allowed).toEqual(['read_file', 'list_directory', 'get_atom']);
      expect(result.denied).toHaveLength(0);
    });

    it('should deny invalid tools for chat-agent', () => {
      const result = service.validateToolCalls('chat-agent', [
        'read_file',
        'create_atom',
        'commit_atom',
      ]);

      expect(result.allowed).toEqual(['read_file']);
      expect(result.denied).toHaveLength(2);
      expect(result.denied.every((v) => v.type === SafetyViolationType.TOOL_NOT_PERMITTED)).toBe(
        true,
      );
    });

    it('should detect too many tool calls', () => {
      const tools = Array(25).fill('read_file');
      const result = service.validateToolCalls('chat-agent', tools);

      expect(result.denied.some((v) => v.type === SafetyViolationType.TOO_MANY_TOOL_CALLS)).toBe(
        true,
      );
    });

    it('should respect per-agent tool limits', () => {
      // commit-agent has max 5 tools
      const tools = Array(10).fill('get_atom');
      const result = service.validateToolCalls('commit-agent', tools);

      expect(result.denied.some((v) => v.type === SafetyViolationType.TOO_MANY_TOOL_CALLS)).toBe(
        true,
      );
    });
  });

  describe('getAllowedTools', () => {
    it('should return all allowed tools for chat-agent', () => {
      const tools = service.getAllowedTools('chat-agent');

      expect(tools).toContain('read_file');
      expect(tools).toContain('list_directory');
      expect(tools).toContain('get_atom');
      expect(tools).not.toContain('create_atom');
      expect(tools).not.toContain('commit_atom');
    });

    it('should return minimal tools for unknown agent', () => {
      const tools = service.getAllowedTools('unknown');

      expect(tools.length).toBeLessThanOrEqual(DEFAULT_AGENT_PROFILE.allowedTools.length);
    });
  });

  describe('getLimits', () => {
    it('should return limits for chat-agent', () => {
      const limits = service.getLimits('chat-agent');

      expect(limits.maxToolCallsPerRequest).toBe(15);
    });

    it('should return limits for commit-agent', () => {
      const limits = service.getLimits('commit-agent');

      expect(limits.maxToolCallsPerRequest).toBe(5);
      expect(limits.maxInputLength).toBe(10_000);
      expect(limits.maxIterations).toBe(3);
    });
  });

  describe('canMutate', () => {
    it('should return false for chat-agent', () => {
      expect(service.canMutate('chat-agent')).toBe(false);
    });

    it('should return true for atomization-agent', () => {
      expect(service.canMutate('atomization-agent')).toBe(true);
    });

    it('should return true for commit-agent', () => {
      expect(service.canMutate('commit-agent')).toBe(true);
    });
  });

  describe('canAccessExternal', () => {
    it('should return false for all built-in agents', () => {
      expect(service.canAccessExternal('chat-agent')).toBe(false);
      expect(service.canAccessExternal('atomization-agent')).toBe(false);
      expect(service.canAccessExternal('commit-agent')).toBe(false);
    });
  });

  describe('registerProfile', () => {
    it('should register a custom agent profile', () => {
      service.registerProfile({
        id: 'custom-agent',
        name: 'Custom Agent',
        description: 'A custom test agent',
        allowedTools: ['read_file', 'custom_tool'],
        maxToolCallsPerRequest: 10,
        canMutate: false,
      });

      const profile = service.getProfile('custom-agent');
      expect(profile.id).toBe('custom-agent');
      expect(profile.allowedTools).toContain('custom_tool');
    });

    it('should overwrite existing profile', () => {
      service.registerProfile({
        id: 'chat-agent',
        name: 'Modified Chat Agent',
        description: 'Modified',
        allowedTools: ['list_directory'], // Fewer tools
        maxToolCallsPerRequest: 5,
        canMutate: false,
      });

      const profile = service.getProfile('chat-agent');
      expect(profile.name).toBe('Modified Chat Agent');
      expect(profile.allowedTools).toHaveLength(1);
    });
  });

  describe('listProfiles', () => {
    it('should list all registered profiles', () => {
      const profiles = service.listProfiles();

      expect(profiles.length).toBeGreaterThanOrEqual(Object.keys(AGENT_PROFILES).length);
      expect(profiles.some((p) => p.id === 'chat-agent')).toBe(true);
      expect(profiles.some((p) => p.id === 'atomization-agent')).toBe(true);
    });
  });
});
