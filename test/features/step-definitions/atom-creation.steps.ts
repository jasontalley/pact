import { Given, When, Then, Before } from '@cucumber/cucumber';
import { expect } from 'expect';
import { PactWorld, Atom } from './world';

// Mock atomization service for BDD tests
// In integration tests, this would use the real service
const mockAtomizationService = {
  async atomize(intent: string, category?: string): Promise<any> {
    // Simulate LLM analysis based on intent patterns

    // Vague patterns - only match truly vague intents
    const isVague = /^(system|it) should be (fast|good|nice|better)$/i.test(intent);

    // Compound patterns - multiple distinct behaviors joined by 'and'
    const andParts = intent.split(/ and /i);
    const isCompound = andParts.length > 1 && andParts.every((p) => p.trim().length > 10);

    // Implementation-specific - storage/infrastructure terms (not 'using' in security context)
    const isImplementationSpecific =
      /\b(implement using|redis|sql|mongo|database for storage)\b/i.test(intent) ||
      /^use \w+ for /i.test(intent);

    // Check compound first (higher priority)
    if (isCompound) {
      return {
        success: false,
        confidence: 0.4,
        analysis: 'Intent contains multiple behaviors that should be separate atoms',
        message: 'Suggested decomposition: separate into individual atomic intents',
      };
    }

    if (isVague) {
      return {
        success: false,
        confidence: 0.3,
        analysis: 'Intent is too vague to be testable',
        message: 'Please clarify the intent with specific, measurable criteria',
      };
    }

    if (isImplementationSpecific) {
      return {
        success: false,
        confidence: 0.3,
        analysis: 'Intent contains implementation details',
        message: 'Please remove implementation specifics and describe the behavior',
      };
    }

    // Valid atomic intent
    const atomId = `IA-${String(Math.floor(Math.random() * 900) + 100)}`;
    return {
      success: true,
      atom: {
        id: `uuid-${atomId}`,
        atomId,
        description: intent,
        category: category || 'functional',
        status: 'draft',
        qualityScore: null,
        committedAt: null,
        supersededBy: null,
        tags: [],
      } as Atom,
      confidence: 0.85,
      analysis: 'Intent is atomic, observable, and implementation-agnostic',
    };
  },
};

Before(function (this: PactWorld) {
  this.reset();
});

// Background steps
Given('the Pact system is initialized', function (this: PactWorld) {
  // System is always initialized for tests
});

Given('I am authenticated as a product owner', function (this: PactWorld) {
  this.isAuthenticated = true;
  this.userRole = 'product_owner';
});

// Intent input steps
Given('I have an intent description: {string}', function (this: PactWorld, description: string) {
  this.intentDescription = description;
});

Given('I have a vague intent: {string}', function (this: PactWorld, description: string) {
  this.intentDescription = description;
});

Given('I have a compound intent: {string}', function (this: PactWorld, description: string) {
  this.intentDescription = description;
});

Given(
  'I have an implementation-specific intent: {string}',
  function (this: PactWorld, description: string) {
    this.intentDescription = description;
  },
);

Given('I specify category as {string}', function (this: PactWorld, category: string) {
  this.category = category;
});

// Action steps
When('I submit the intent for atomization', async function (this: PactWorld) {
  if (!this.intentDescription) {
    throw new Error('No intent description set');
  }

  this.atomizationResult = await mockAtomizationService.atomize(
    this.intentDescription,
    this.category || undefined,
  );

  // Store the atom if created
  if (this.atomizationResult?.success && this.atomizationResult.atom) {
    this.currentAtom = this.atomizationResult.atom;
    this.atoms.push(this.currentAtom);
  }
});

When('I refine the intent to: {string}', function (this: PactWorld, refinedIntent: string) {
  this.intentDescription = refinedIntent;
});

When('I set the atom quality score to {int}', function (this: PactWorld, score: number) {
  if (!this.currentAtom) {
    throw new Error('No current atom to update');
  }
  this.currentAtom.qualityScore = score;
});

When('I commit the atom', function (this: PactWorld) {
  if (!this.currentAtom) {
    throw new Error('No current atom to commit');
  }
  if (this.currentAtom.status !== 'draft') {
    throw new Error('Only draft atoms can be committed');
  }
  const qualityScore = this.currentAtom.qualityScore ?? 0;
  if (qualityScore < 80) {
    this.lastResponse = {
      status: 400,
      message: `Cannot commit atom with quality score ${qualityScore}. Minimum required is 80.`,
    };
    return;
  }

  this.currentAtom.status = 'committed';
  this.currentAtom.committedAt = new Date();
  this.lastResponse = { status: 200 };
});

When('I attempt to commit the atom', function (this: PactWorld) {
  if (!this.currentAtom) {
    throw new Error('No current atom to commit');
  }
  const qualityScore = this.currentAtom.qualityScore ?? 0;
  if (qualityScore < 80) {
    this.lastResponse = {
      status: 400,
      message: `Cannot commit atom with quality score ${qualityScore}. Minimum required is 80.`,
    };
    return;
  }

  this.currentAtom.status = 'committed';
  this.currentAtom.committedAt = new Date();
  this.lastResponse = { status: 200 };
});

// Assertion steps
Then('the Atomization Agent analyzes the intent', function (this: PactWorld) {
  expect(this.atomizationResult).not.toBeNull();
  expect(this.atomizationResult!.analysis).toBeDefined();
});

Then(
  'the atom is created with status {string}',
  function (this: PactWorld, expectedStatus: string) {
    expect(this.atomizationResult!.success).toBe(true);
    expect(this.atomizationResult!.atom).toBeDefined();
    expect(this.atomizationResult!.atom!.status).toBe(expectedStatus);
  },
);

Then('the atom ID matches pattern {string}', function (this: PactWorld, pattern: string) {
  expect(this.atomizationResult!.atom).toBeDefined();
  const regex = new RegExp(pattern);
  expect(this.atomizationResult!.atom!.atomId).toMatch(regex);
});

Then('the confidence score is at least {float}', function (this: PactWorld, minConfidence: number) {
  expect(this.atomizationResult!.confidence).toBeGreaterThanOrEqual(minConfidence);
});

Then('the confidence score is below {float}', function (this: PactWorld, maxConfidence: number) {
  expect(this.atomizationResult!.confidence).toBeLessThan(maxConfidence);
});

Then('the confidence score reflects low atomicity', function (this: PactWorld) {
  expect(this.atomizationResult!.confidence).toBeLessThan(0.7);
});

Then('the system rejects the atom creation', function (this: PactWorld) {
  expect(this.atomizationResult!.success).toBe(false);
  expect(this.atomizationResult!.atom).toBeUndefined();
});

Then('I receive feedback explaining the issue', function (this: PactWorld) {
  expect(this.atomizationResult!.message).toBeDefined();
  expect(this.atomizationResult!.message!.length).toBeGreaterThan(0);
});

Then('the Atomization Agent detects the intent is not atomic', function (this: PactWorld) {
  expect(this.atomizationResult!.success).toBe(false);
  expect(this.atomizationResult!.analysis).toContain('multiple behaviors');
});

Then('the system suggests decomposition into smaller atoms', function (this: PactWorld) {
  expect(this.atomizationResult!.message).toContain('decomposition');
});

Then('no atom is created', function (this: PactWorld) {
  expect(this.atomizationResult!.atom).toBeUndefined();
});

Then(
  'the atom is created with category {string}',
  function (this: PactWorld, expectedCategory: string) {
    expect(this.atomizationResult!.success).toBe(true);
    expect(this.atomizationResult!.atom).toBeDefined();
    expect(this.atomizationResult!.atom!.category).toBe(expectedCategory);
  },
);

Then('the Atomization Agent detects implementation details', function (this: PactWorld) {
  expect(this.atomizationResult!.success).toBe(false);
  expect(this.atomizationResult!.analysis).toContain('implementation');
});

Then('I receive feedback about implementation-agnostic requirements', function (this: PactWorld) {
  expect(this.atomizationResult!.message).toBeDefined();
});

// Commitment steps
Then('the atom status changes to {string}', function (this: PactWorld, expectedStatus: string) {
  expect(this.currentAtom).not.toBeNull();
  expect(this.currentAtom!.status).toBe(expectedStatus);
});

Then('the commit timestamp is recorded', function (this: PactWorld) {
  expect(this.currentAtom).not.toBeNull();
  expect(this.currentAtom!.committedAt).not.toBeNull();
});

Then('the commit is rejected', function (this: PactWorld) {
  expect(this.lastResponse).not.toBeNull();
  expect(this.lastResponse!.status).toBe(400);
});

Then('I receive a message about quality requirements', function (this: PactWorld) {
  expect(this.lastResponse).not.toBeNull();
  expect(this.lastResponse!.message).toMatch(/quality|score/i);
});

Then('the atom remains in {string} status', function (this: PactWorld, expectedStatus: string) {
  expect(this.currentAtom).not.toBeNull();
  expect(this.currentAtom!.status).toBe(expectedStatus);
});
