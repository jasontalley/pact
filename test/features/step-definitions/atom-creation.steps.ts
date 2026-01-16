import { Given, When, Then, Before } from '@cucumber/cucumber';
import { expect } from 'expect';
import { PactWorld } from './world';

// Mock atomization service for BDD tests
// In integration tests, this would use the real service
const mockAtomizationService = {
  async atomize(intent: string, category?: string): Promise<any> {
    // Simulate LLM analysis based on intent patterns
    const isVague = /should be (fast|good|nice|better)/i.test(intent);
    const isCompound = / and /i.test(intent);
    // Use word boundaries to avoid matching "User" as "use"
    const isImplementationSpecific =
      /\b(using|implement|redis|sql|mongo|database|api|http)\b/i.test(intent);

    // Check compound first (higher priority)
    if (isCompound) {
      return {
        success: false,
        confidence: 0.8,
        analysis: 'Intent contains multiple behaviors that should be separate atoms',
        message: 'Suggested decomposition: ["User can log in", "User can view dashboard"]',
      };
    }

    if (isVague || isImplementationSpecific) {
      return {
        success: false,
        confidence: 0.3,
        analysis: isVague
          ? 'Intent is too vague to be testable'
          : 'Intent contains implementation details',
        message: 'Please clarify the intent or remove implementation specifics',
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
      },
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
  // In real tests, this would verify database connection, etc.
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
