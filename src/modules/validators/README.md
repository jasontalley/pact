# Validators Module

Manages test validators - reusable specifications that prove Intent Atoms through testing.

## Overview

Validators are the coupling mechanism between code and intent. Each validator links a test specification to an atom, enabling Pact to verify that code actually implements committed intent.

## Entity: Validator

```typescript
interface Validator {
  id: string;              // UUID
  atomId: string;          // FK to Atom

  // Content
  content: string;         // The validation spec (Gherkin, code, etc.)
  validatorType: ValidatorType;  // acceptance, unit, integration, etc.
  format: ValidatorFormat;       // gherkin, natural_language, typescript, json

  // Translation cache
  originalFormat: ValidatorFormat;
  translatedContent: {
    [format: string]: string;
    translatedAt?: Record<string, Date>;
    confidenceScores?: Record<string, number>;
  };

  // State
  isActive: boolean;
  executionCount: number;
  lastExecutedAt: Date | null;
}
```

## Validator Types

| Type | Description |
|------|-------------|
| `acceptance` | High-level user acceptance criteria |
| `unit` | Low-level function/component tests |
| `integration` | Cross-module integration tests |
| `e2e` | End-to-end system tests |
| `manual` | Human-verified checkpoints |
| `performance` | Performance benchmarks |
| `security` | Security validation |

## Validator Formats

Validators can be authored in multiple formats:

| Format | Description | Example |
|--------|-------------|---------|
| `gherkin` | Given/When/Then BDD syntax | `Given a user exists...` |
| `natural_language` | Plain English description | `The user should be able to log in` |
| `typescript` | Jest/Mocha test code | `it('should authenticate', () => {...})` |
| `json` | Structured assertion schema | `{ "assert": "equals", ... }` |

## Translation System

Validators can be translated between formats using AI:

```typescript
// Translate Gherkin to TypeScript
const translation = await validatorTranslationService.translate(
  validatorId,
  'typescript',
  { confidence: true }
);

// Cache the translation
await validatorsService.cacheTranslation(
  validatorId,
  'typescript',
  translation.content,
  translation.confidence
);
```

Translations are cached in `translatedContent` with confidence scores.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/validators` | List validators with pagination/filtering |
| GET | `/validators/:id` | Get single validator |
| GET | `/validators/atom/:atomId` | Get validators for atom |
| POST | `/validators` | Create validator |
| PATCH | `/validators/:id` | Update validator |
| DELETE | `/validators/:id` | Soft delete (deactivate) |
| DELETE | `/validators/:id/hard` | Permanent delete |
| POST | `/validators/:id/activate` | Activate validator |
| POST | `/validators/:id/deactivate` | Deactivate validator |
| GET | `/validators/:id/status` | Get validation status |
| GET | `/validators/:id/translations` | Get cached translations |
| POST | `/validators/:id/translate/:format` | Translate to format |
| GET | `/validators/statistics` | Get validator statistics |

## WebSocket Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `validator:created` | `Validator` | New validator created |
| `validator:updated` | `Validator` | Validator updated |
| `validator:activated` | `Validator` | Validator activated |
| `validator:deactivated` | `Validator` | Validator deactivated |
| `validator:deleted` | `{ validatorId, atomId }` | Validator hard deleted |
| `validator:translated` | `{ validator, targetFormat }` | Translation completed |

## Template System

Validators can be created from templates:

```typescript
// Get available templates
const templates = await templatesService.getTemplates('acceptance');

// Create validator from template
const validator = await validatorsService.create({
  atomId: 'atom-uuid',
  content: template.content,
  validatorType: 'acceptance',
  format: template.format,
});
```

Templates are seeded from `validators/data/` on startup.

## Quality Scoring

The `AtomQualityService` (in this module) evaluates atoms across 5 dimensions:

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Observable | 25% | Can outcomes be verified externally? |
| Falsifiable | 20% | Are there clear failure conditions? |
| Implementation-Agnostic | 20% | Describes behavior, not implementation? |
| Unambiguous Language | 20% | Clear, precise language? |
| Clear Success Criteria | 15% | Well-defined acceptance criteria? |

## Service Methods

```typescript
class ValidatorsService {
  // CRUD
  create(dto: CreateValidatorDto): Promise<Validator>;
  findAll(options?: ValidatorSearchDto): Promise<PaginatedResponse>;
  findByAtom(atomId: string): Promise<Validator[]>;
  findOne(id: string): Promise<Validator>;
  update(id: string, dto: UpdateValidatorDto): Promise<Validator>;
  remove(id: string): Promise<Validator>;  // Soft delete
  hardRemove(id: string): Promise<void>;   // Permanent delete

  // State management
  activate(id: string): Promise<Validator>;
  deactivate(id: string): Promise<Validator>;

  // Translation
  cacheTranslation(id: string, format: ValidatorFormat, content: string, confidence: number): Promise<Validator>;
  getTranslations(id: string): Promise<TranslationMap>;

  // Queries
  getValidationStatus(atomId: string): Promise<ValidationStatus>;
  getCountByAtom(atomId: string): Promise<number>;
  getStatistics(): Promise<ValidatorStatistics>;

  // Execution tracking
  recordExecution(id: string): Promise<void>;
}
```

## File Structure

```
validators/
├── validator.entity.ts           # TypeORM entity
├── validators.controller.ts      # REST API
├── validators.service.ts         # Business logic
├── validators.repository.ts      # Database queries
├── validators.module.ts          # NestJS module
├── validator-translation.service.ts  # Format translation
├── atom-quality.service.ts       # 5-dimension quality scoring
├── templates.service.ts          # Template management
├── templates.repository.ts       # Template queries
├── data/                         # Seed data for templates
│   └── templates.json
├── dto/
│   ├── create-validator.dto.ts
│   ├── update-validator.dto.ts
│   └── validator-search.dto.ts
└── validators.service.spec.ts    # Unit tests
```

## Related Modules

- **atoms** - Validators are linked to atoms
- **evidence** - Execution results stored here
- **quality** - Test quality analysis uses validator data
- **agents** - Reconciliation tools validate atoms

## See Also

- [CLAUDE.md - Test-Atom Coupling](/CLAUDE.md#the-coupling-mechanism-tests)
