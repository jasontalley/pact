# Validator Translation Service Architecture

This document describes the architecture of the Validator Translation Service, which provides AI-powered format translation between validator formats.

## Overview

The `ValidatorTranslationService` enables bidirectional translation between four validator formats:

- **Gherkin** - BDD-style Given/When/Then scenarios
- **Natural Language** - Plain English descriptions
- **TypeScript** - Executable Jest/Vitest test code
- **JSON** - Structured validation rules

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                 ValidatorTranslationService                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │   translate()    │───>│   LLM Service    │                   │
│  │                  │    │   (Primary)      │                   │
│  └────────┬─────────┘    └────────┬─────────┘                   │
│           │                       │                              │
│           │ fallback              │ unavailable                  │
│           ▼                       ▼                              │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │    Heuristic     │<───│   Confidence     │                   │
│  │    Translators   │    │   Scoring        │                   │
│  └──────────────────┘    └──────────────────┘                   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Translation Matrix                      │   │
│  │  ┌─────────┬──────────┬────────────┬──────────┬──────┐   │   │
│  │  │ From/To │ Gherkin  │ Natural    │ TypeScript│ JSON │   │   │
│  │  ├─────────┼──────────┼────────────┼──────────┼──────┤   │   │
│  │  │ Gherkin │    -     │    ✓       │    ✓     │  ✓   │   │   │
│  │  │ Natural │    ✓     │    -       │    ✓     │  ✓   │   │   │
│  │  │ TS      │    ✓     │    ✓       │    -     │  ✓   │   │   │
│  │  │ JSON    │    ✓     │    ✓       │    ✓     │  -   │   │   │
│  │  └─────────┴──────────┴────────────┴──────────┴──────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### ValidatorTranslationService

**Location**: `src/modules/validators/validator-translation.service.ts`

Main service responsible for:

1. Routing translation requests
2. Calling LLM service with appropriate prompts
3. Falling back to heuristic translators
4. Calculating confidence scores
5. Validating translations

### Translation Methods

```typescript
interface TranslationResult {
  content: string;
  sourceFormat: ValidatorFormat;
  targetFormat: ValidatorFormat;
  confidence: number;
  warnings: string[];
  wasLLMUsed: boolean;
}

// Main translation method
translate(content: string, sourceFormat: ValidatorFormat, targetFormat: ValidatorFormat): Promise<TranslationResult>

// Format-specific translators
translateToGherkin(content: string, sourceFormat: ValidatorFormat): Promise<TranslationResult>
translateToNaturalLanguage(content: string, sourceFormat: ValidatorFormat): Promise<TranslationResult>
translateToTypescript(content: string, sourceFormat: ValidatorFormat): Promise<TranslationResult>
translateToJson(content: string, sourceFormat: ValidatorFormat): Promise<TranslationResult>

// Validation
validateTranslation(original: string, translated: string, sourceFormat: ValidatorFormat, targetFormat: ValidatorFormat): Promise<TranslationValidationResult>
testRoundTrip(content: string, sourceFormat: ValidatorFormat, targetFormat: ValidatorFormat): Promise<RoundTripResult>
```

## Translation Strategies

### 1. LLM-Based Translation (Primary)

When the LLM service is available, translations use carefully crafted prompts:

```typescript
// Example: Natural Language → Gherkin prompt
const prompt = `
Convert the following natural language requirement into Gherkin format.

Natural Language:
${content}

Rules:
1. Use Feature/Scenario/Given/When/Then structure
2. Preserve all acceptance criteria
3. Make scenarios specific and testable
4. Include edge cases if mentioned

Output only the Gherkin content, no explanations.
`;
```

### 2. Heuristic Translation (Fallback)

When LLM is unavailable, pattern-based heuristics provide basic translation:

| Source | Target | Heuristic Strategy |
|--------|--------|-------------------|
| Gherkin → Natural Language | Extract Given/When/Then clauses, convert to prose |
| Natural Language → Gherkin | Pattern matching for "must", "should", "when" |
| TypeScript → Natural Language | Extract test names and assertions |
| JSON → Natural Language | Convert rules to readable statements |

### Heuristic Examples

```typescript
// Gherkin → Natural Language
private heuristicGherkinToNaturalLanguage(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Given')) {
      result.push(`Precondition: ${trimmed.replace('Given ', '')}`);
    } else if (trimmed.startsWith('When')) {
      result.push(`Action: ${trimmed.replace('When ', '')}`);
    } else if (trimmed.startsWith('Then')) {
      result.push(`Expected: ${trimmed.replace('Then ', '')}`);
    }
  }

  return result.join('\n');
}

// Natural Language → Gherkin
private heuristicNaturalLanguageToGherkin(content: string): string {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim());
  const result = ['Feature: Validation', '  Scenario: Requirement'];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase().trim();
    if (lower.includes('must') || lower.includes('should')) {
      result.push(`    Then ${sentence.trim()}`);
    } else if (lower.includes('when') || lower.includes('if')) {
      result.push(`    When ${sentence.trim()}`);
    } else {
      result.push(`    Given ${sentence.trim()}`);
    }
  }

  return result.join('\n');
}
```

## Confidence Scoring

Confidence scores (0-1) indicate translation reliability:

| Score | Level | Meaning |
|-------|-------|---------|
| 0.95+ | High | LLM translation with validation |
| 0.80-0.94 | Good | LLM translation, minor concerns |
| 0.60-0.79 | Medium | Heuristic or uncertain translation |
| < 0.60 | Low | Best-effort, review required |

### Scoring Factors

- **LLM vs Heuristic**: LLM translations start at 0.85, heuristics at 0.65
- **Format Complexity**: Simple formats (NL↔Gherkin) score higher
- **Content Length**: Very short or very long content reduces confidence
- **Pattern Recognition**: Successful pattern matching increases confidence

## Translation Validation

### Semantic Equivalence Check

```typescript
interface TranslationValidationResult {
  isValid: boolean;
  semanticEquivalence: number;
  warnings: string[];
  suggestions: string[];
}

async validateTranslation(
  original: string,
  translated: string,
  sourceFormat: ValidatorFormat,
  targetFormat: ValidatorFormat
): Promise<TranslationValidationResult>
```

The validation process:

1. Compare key concepts in original and translated
2. Check for missing requirements
3. Identify added requirements (potential drift)
4. Score semantic preservation

### Round-Trip Testing

```typescript
interface RoundTripResult {
  originalContent: string;
  translatedContent: string;
  roundTripContent: string;
  preservationScore: number;
  isAcceptable: boolean;
  differences: string[];
}

async testRoundTrip(
  content: string,
  sourceFormat: ValidatorFormat,
  targetFormat: ValidatorFormat
): Promise<RoundTripResult>
```

Round-trip translation (A → B → A) validates that:

1. Meaning is preserved through both translations
2. No information is lost
3. Translations are reversible

## Caching

Translations are cached in the validator's `translatedContent` field:

```typescript
interface TranslatedContent {
  gherkin?: string;
  natural_language?: string;
  typescript?: string;
  json?: string;
  translatedAt?: Record<string, Date>;
  confidenceScores?: Record<string, number>;
}
```

Benefits:
- Avoid repeated LLM calls
- Consistent translations for the same validator
- Track translation history

## Error Handling

### LLM Unavailable

```typescript
if (!this.llmService || !this.llmService.isAvailable()) {
  return this.heuristicTranslation(content, sourceFormat, targetFormat);
}
```

### Invalid Format

```typescript
if (!this.isValidFormat(sourceFormat) || !this.isValidFormat(targetFormat)) {
  throw new BadRequestException(`Invalid format: ${format}`);
}
```

### Translation Failure

```typescript
try {
  const result = await this.llmService.complete(prompt);
  return this.parseTranslationResult(result);
} catch (error) {
  this.logger.warn('LLM translation failed, falling back to heuristic', error);
  return this.heuristicTranslation(content, sourceFormat, targetFormat);
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/validators/translate` | POST | Standalone translation |
| `/validators/:id/translate/:targetFormat` | POST | Translate existing validator |
| `/validators/:id/validate-translation` | POST | Validate a translation |
| `/validators/:id/test-round-trip/:targetFormat` | POST | Test round-trip preservation |
| `/validators/:id/translations` | GET | Get cached translations |

## Usage Examples

### Basic Translation

```typescript
const result = await translationService.translate(
  'Users must be authenticated before accessing protected resources',
  'natural_language',
  'gherkin'
);

// Result:
// {
//   content: 'Feature: Authentication\n  Scenario: Access protected resources\n    Given a user is not authenticated\n    When they attempt to access a protected resource\n    Then access should be denied',
//   sourceFormat: 'natural_language',
//   targetFormat: 'gherkin',
//   confidence: 0.92,
//   warnings: [],
//   wasLLMUsed: true
// }
```

### Validation

```typescript
const validation = await translationService.validateTranslation(
  originalContent,
  translatedContent,
  'natural_language',
  'gherkin'
);

// Result:
// {
//   isValid: true,
//   semanticEquivalence: 0.95,
//   warnings: [],
//   suggestions: []
// }
```

### Round-Trip Test

```typescript
const roundTrip = await translationService.testRoundTrip(
  content,
  'gherkin',
  'natural_language'
);

// Result:
// {
//   originalContent: 'Given a user...',
//   translatedContent: 'The user must...',
//   roundTripContent: 'Given a user...',
//   preservationScore: 0.93,
//   isAcceptable: true,
//   differences: []
// }
```

## Configuration

The translation service uses the LLM configuration from `llm_configurations` table:

```json
{
  "primary_model": {
    "provider": "openai",
    "modelName": "gpt-4-turbo-preview",
    "temperature": 0.2,
    "maxTokens": 4096
  }
}
```

Lower temperature (0.2) ensures consistent, deterministic translations.

## Testing

Unit tests cover:

- All 12 translation directions
- LLM and heuristic fallback paths
- Confidence scoring accuracy
- Validation logic
- Round-trip preservation
- Error handling

Location: `src/modules/validators/validator-translation.service.spec.ts`

## Future Improvements

1. **Custom Prompts**: Allow users to customize translation prompts
2. **Learning**: Improve heuristics based on LLM translations
3. **Multi-Model**: Use different models for different translations
4. **Batch Translation**: Translate multiple validators in one call
5. **Translation Memory**: Cache successful translations across validators
