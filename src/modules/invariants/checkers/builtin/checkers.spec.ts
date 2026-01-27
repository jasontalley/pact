import { Atom } from '../../../atoms/atom.entity';
import { InvariantConfig } from '../../invariant-config.entity';
import { CheckContext } from '../interfaces';
import {
  ExplicitCommitmentChecker,
  BehavioralTestabilityChecker,
  NoAmbiguityChecker,
  ImmutabilityChecker,
  TraceabilityChecker,
  HumanCommitChecker,
  EvidenceImmutabilityChecker,
  RejectionLimitedChecker,
  AmbiguityResolutionChecker,
} from './index';

describe('Built-in Invariant Checkers', () => {
  const createMockAtom = (overrides: Partial<Atom> = {}): Atom =>
    ({
      id: 'atom-uuid-1',
      atomId: 'IA-001',
      description: 'Test atom description',
      category: 'functional',
      qualityScore: 85,
      status: 'draft',
      supersededBy: null,
      createdAt: new Date(),
      committedAt: null,
      createdBy: 'test-user',
      metadata: {},
      observableOutcomes: [{ description: 'Observable outcome' }],
      falsifiabilityCriteria: [{ condition: 'Condition', expectedBehavior: 'Expected' }],
      tags: ['test'],
      canvasPosition: null,
      parentIntent: 'Original user intent',
      refinementHistory: [],
      validators: [],
      ...overrides,
    }) as Atom;

  const createMockConfig = (overrides: Partial<InvariantConfig> = {}): InvariantConfig =>
    ({
      id: 'config-uuid',
      projectId: null,
      invariantId: 'INV-001',
      name: 'Test Invariant',
      description: 'Test',
      isEnabled: true,
      isBlocking: true,
      checkType: 'builtin',
      checkConfig: {},
      errorMessage: 'Error',
      suggestionPrompt: null,
      isBuiltin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as InvariantConfig;

  const createContext = (overrides: Partial<CheckContext> = {}): CheckContext => ({
    committedBy: 'jane.doe@company.com',
    isPreview: false,
    ...overrides,
  });

  describe('ExplicitCommitmentChecker (INV-001)', () => {
    let checker: ExplicitCommitmentChecker;
    let config: InvariantConfig;

    beforeEach(() => {
      checker = new ExplicitCommitmentChecker();
      config = createMockConfig({ invariantId: 'INV-001' });
    });

    it('should pass with valid committedBy and atoms', async () => {
      const atoms = [createMockAtom()];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
      expect(result.invariantId).toBe('INV-001');
    });

    it('should fail without committedBy', async () => {
      const atoms = [createMockAtom()];
      const context = createContext({ committedBy: '' });

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Missing committedBy');
    });

    it('should fail with too short committedBy', async () => {
      const atoms = [createMockAtom()];
      const context = createContext({ committedBy: 'ab' });

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('too short');
    });

    it('should fail with no atoms', async () => {
      const context = createContext();

      const result = await checker.check([], context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('No atoms');
    });

    it('should fail if atom has no description', async () => {
      const atoms = [createMockAtom({ description: '' })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('no description');
    });
  });

  describe('BehavioralTestabilityChecker (INV-002)', () => {
    let checker: BehavioralTestabilityChecker;
    let config: InvariantConfig;

    beforeEach(() => {
      checker = new BehavioralTestabilityChecker();
      config = createMockConfig({
        invariantId: 'INV-002',
        checkConfig: { minQualityScore: 60 },
      });
    });

    it('should pass with quality score above threshold', async () => {
      const atoms = [createMockAtom({ qualityScore: 85 })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });

    it('should fail with quality score below threshold', async () => {
      const atoms = [createMockAtom({ qualityScore: 50 })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('below minimum threshold');
    });

    it('should fail without observable outcomes', async () => {
      const atoms = [createMockAtom({ observableOutcomes: [] })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('No observable outcomes');
    });

    it('should fail without falsifiability criteria', async () => {
      const atoms = [createMockAtom({ falsifiabilityCriteria: [] })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('No falsifiability criteria');
    });
  });

  describe('NoAmbiguityChecker (INV-003)', () => {
    let checker: NoAmbiguityChecker;
    let config: InvariantConfig;

    beforeEach(() => {
      checker = new NoAmbiguityChecker();
      config = createMockConfig({ invariantId: 'INV-003' });
    });

    it('should pass with clear description', async () => {
      const atoms = [createMockAtom({ description: 'User can submit form with valid data' })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });

    it('should fail with vague terms', async () => {
      const atoms = [
        createMockAtom({ description: 'The system should be fast and user-friendly' }),
      ];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Vague terms');
    });

    it('should fail with implementation directives', async () => {
      const atoms = [createMockAtom({ description: 'Use React to implement the dashboard' })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Implementation directives');
    });

    it('should fail with TBD markers', async () => {
      const atoms = [createMockAtom({ description: 'Feature behavior TBD' })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Unresolved markers');
    });

    it('should fail with vague conditionals', async () => {
      const atoms = [
        createMockAtom({ description: 'Display data if applicable and when necessary' }),
      ];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Vague conditionals');
    });
  });

  describe('ImmutabilityChecker (INV-004)', () => {
    let checker: ImmutabilityChecker;
    let config: InvariantConfig;

    beforeEach(() => {
      checker = new ImmutabilityChecker();
      config = createMockConfig({ invariantId: 'INV-004' });
    });

    it('should pass with draft atoms', async () => {
      const atoms = [createMockAtom({ status: 'draft' })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });

    it('should fail with already committed atoms', async () => {
      const atoms = [createMockAtom({ status: 'committed' })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('already committed');
    });

    it('should fail with superseded atoms', async () => {
      const atoms = [createMockAtom({ status: 'superseded' })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('superseded');
    });

    it('should report all affected atom IDs', async () => {
      const atoms = [
        createMockAtom({ id: 'atom-1', status: 'committed' }),
        createMockAtom({ id: 'atom-2', status: 'superseded' }),
        createMockAtom({ id: 'atom-3', status: 'draft' }),
      ];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.affectedAtomIds).toContain('atom-1');
      expect(result.affectedAtomIds).toContain('atom-2');
      expect(result.affectedAtomIds).not.toContain('atom-3');
    });
  });

  describe('TraceabilityChecker (INV-005)', () => {
    let checker: TraceabilityChecker;
    let config: InvariantConfig;

    beforeEach(() => {
      checker = new TraceabilityChecker();
      config = createMockConfig({ invariantId: 'INV-005' });
    });

    it('should pass with parentIntent', async () => {
      const atoms = [createMockAtom({ parentIntent: 'User requested login feature' })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });

    it('should pass with createdBy', async () => {
      const atoms = [createMockAtom({ parentIntent: null, createdBy: 'user@example.com' })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });

    it('should pass with refinementHistory', async () => {
      const atoms = [
        createMockAtom({
          parentIntent: null,
          createdBy: null,
          refinementHistory: [
            {
              timestamp: new Date(),
              feedback: 'Improved clarity',
              previousDescription: 'Old desc',
              newDescription: 'New desc',
              source: 'user',
            },
          ],
        }),
      ];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });

    it('should fail without any traceability info', async () => {
      const atoms = [
        createMockAtom({
          parentIntent: null,
          createdBy: null,
          refinementHistory: [],
          metadata: {},
        }),
      ];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('traceability');
    });
  });

  describe('HumanCommitChecker (INV-006)', () => {
    let checker: HumanCommitChecker;
    let config: InvariantConfig;

    beforeEach(() => {
      checker = new HumanCommitChecker();
      config = createMockConfig({ invariantId: 'INV-006' });
    });

    it('should pass with valid email', async () => {
      const atoms = [createMockAtom()];
      const context = createContext({ committedBy: 'jane.doe@company.com' });

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });

    it('should pass with valid username', async () => {
      const atoms = [createMockAtom()];
      const context = createContext({ committedBy: 'janedoe' });

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });

    it('should fail with agent-like identifier', async () => {
      const atoms = [createMockAtom()];
      const context = createContext({ committedBy: 'automation-agent' });

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('agent');
    });

    it('should fail with bot identifier', async () => {
      const atoms = [createMockAtom()];
      const context = createContext({ committedBy: 'ci-bot' });

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('bot');
    });

    it('should fail with system identifier', async () => {
      const atoms = [createMockAtom()];
      const context = createContext({ committedBy: 'system-process' });

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
    });

    it('should fail with empty committedBy', async () => {
      const atoms = [createMockAtom()];
      const context = createContext({ committedBy: '' });

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('No human identifier');
    });

    it('should fail with numbers-only identifier', async () => {
      const atoms = [createMockAtom()];
      const context = createContext({ committedBy: '123456' });

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('valid human identifier');
    });
  });

  describe('EvidenceImmutabilityChecker (INV-007)', () => {
    let checker: EvidenceImmutabilityChecker;
    let config: InvariantConfig;

    beforeEach(() => {
      checker = new EvidenceImmutabilityChecker();
      config = createMockConfig({ invariantId: 'INV-007' });
    });

    it('should pass (placeholder implementation)', async () => {
      const atoms = [createMockAtom()];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });

    it('should detect atoms with evidence metadata', async () => {
      const atoms = [createMockAtom({ metadata: { evidence: 'test-evidence' } })];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
      expect(result.message).toContain('evidence');
    });
  });

  describe('RejectionLimitedChecker (INV-008)', () => {
    let checker: RejectionLimitedChecker;
    let config: InvariantConfig;

    beforeEach(() => {
      checker = new RejectionLimitedChecker();
      config = createMockConfig({ invariantId: 'INV-008' });
    });

    it('should pass with no rejection metadata', async () => {
      const atoms = [createMockAtom()];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });

    it('should fail with rejection lacking invariant reference', async () => {
      const atoms = [
        createMockAtom({
          metadata: {
            rejection: { reason: 'Some arbitrary reason' },
          },
        }),
      ];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('without invariant');
    });

    it('should pass with properly referenced rejection', async () => {
      const atoms = [
        createMockAtom({
          metadata: {
            rejection: { reason: 'Quality too low', invariantId: 'INV-002' },
          },
        }),
      ];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });
  });

  describe('AmbiguityResolutionChecker (INV-009)', () => {
    let checker: AmbiguityResolutionChecker;
    let config: InvariantConfig;

    beforeEach(() => {
      checker = new AmbiguityResolutionChecker();
      config = createMockConfig({ invariantId: 'INV-009' });
    });

    it('should pass with no pending clarifications', async () => {
      const atoms = [createMockAtom()];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(true);
    });

    it('should fail with pending clarifications', async () => {
      const atoms = [
        createMockAtom({
          metadata: { pendingClarifications: ['What does "fast" mean?'] },
        }),
      ];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('clarification');
    });

    it('should fail with hasAmbiguity flag', async () => {
      const atoms = [
        createMockAtom({
          metadata: { hasAmbiguity: true },
        }),
      ];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('ambiguity');
    });

    it('should fail with needsClarification flag', async () => {
      const atoms = [
        createMockAtom({
          metadata: { needsClarification: true, clarificationNote: 'Define scope' },
        }),
      ];
      const context = createContext();

      const result = await checker.check(atoms, context, config);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Define scope');
    });
  });
});
