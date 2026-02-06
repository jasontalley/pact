#!/usr/bin/env node

/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-003
 * Type: Seed
 * Purpose: Seed database with atom definitions extracted from test annotations
 * Exit Criterion: Pact can manage atoms via UI/API without seed step
 * Target Removal: Phase 1
 * Owner: @jasontalley
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Atom definitions derived from test annotations.
 * Each atom has:
 * - atomId: The IA-XXX identifier
 * - description: Human-readable description of the intent
 * - category: Classification (functional, performance, security, etc.)
 * - tags: Searchable tags
 * - observableOutcomes: Measurable effects of the behavior
 * - falsifiabilityCriteria: Conditions that would disprove the intent
 */
const ATOM_DEFINITIONS = [
  {
    atomId: 'IA-018',
    description: 'AtomsService must be instantiated by NestJS dependency injection container',
    category: 'functional',
    tags: ['service', 'dependency-injection', 'instantiation'],
    observableOutcomes: [
      { description: 'Service instance is defined and not null', measurementCriteria: 'typeof service !== undefined && service !== null' },
      { description: 'Service is instance of AtomsService class', measurementCriteria: 'service instanceof AtomsService' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Service is undefined after module compilation', expectedBehavior: 'Service must be defined' },
    ],
  },
  {
    atomId: 'IA-019',
    description: 'Atom creation must auto-generate sequential IDs in IA-XXX format starting from IA-001',
    category: 'functional',
    tags: ['atom', 'create', 'id-generation', 'sequence'],
    observableOutcomes: [
      { description: 'First atom receives ID IA-001', measurementCriteria: 'atomId === "IA-001" when no atoms exist' },
      { description: 'Subsequent atoms increment from highest existing ID', measurementCriteria: 'newId === previousHighestId + 1' },
      { description: 'ID format is IA-XXX with zero-padded 3-digit number', measurementCriteria: 'atomId.match(/^IA-\\d{3}$/)' },
    ],
    falsifiabilityCriteria: [
      { condition: 'ID is not sequential', expectedBehavior: 'ID must be exactly one higher than previous highest' },
      { condition: 'ID format is malformed', expectedBehavior: 'ID must match IA-XXX pattern' },
    ],
  },
  {
    atomId: 'IA-020',
    description: 'Atom retrieval must return correct atom by UUID or throw NotFoundException',
    category: 'functional',
    tags: ['atom', 'read', 'findOne', 'not-found'],
    observableOutcomes: [
      { description: 'Existing atom is returned with all fields', measurementCriteria: 'returned atom matches stored atom' },
      { description: 'Non-existent UUID throws NotFoundException', measurementCriteria: 'NotFoundException thrown for invalid UUID' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Returns null for non-existent atom', expectedBehavior: 'Must throw NotFoundException' },
      { condition: 'Returns wrong atom', expectedBehavior: 'Must return atom matching provided UUID' },
    ],
  },
  {
    atomId: 'IA-021',
    description: 'Atom update must modify only draft atoms and reject updates to committed atoms',
    category: 'functional',
    tags: ['atom', 'update', 'draft', 'immutability'],
    observableOutcomes: [
      { description: 'Draft atom fields are updated', measurementCriteria: 'atom.description === newDescription' },
      { description: 'Committed atom update throws ForbiddenException', measurementCriteria: 'ForbiddenException for status !== "draft"' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Committed atom can be modified', expectedBehavior: 'Must throw ForbiddenException' },
    ],
  },
  {
    atomId: 'IA-022',
    description: 'Atom deletion must only remove draft atoms and reject deletion of committed atoms',
    category: 'functional',
    tags: ['atom', 'delete', 'draft', 'immutability'],
    observableOutcomes: [
      { description: 'Draft atom is removed from database', measurementCriteria: 'atom no longer exists after deletion' },
      { description: 'Committed atom deletion throws ForbiddenException', measurementCriteria: 'ForbiddenException for status !== "draft"' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Committed atom can be deleted', expectedBehavior: 'Must throw ForbiddenException' },
    ],
  },
  {
    atomId: 'IA-023',
    description: 'Atom commitment must require minimum quality score of 80 and transition status to committed',
    category: 'functional',
    tags: ['atom', 'commit', 'quality-gate', 'status-transition'],
    observableOutcomes: [
      { description: 'Atom with score >= 80 transitions to committed status', measurementCriteria: 'atom.status === "committed" after commit' },
      { description: 'Atom with score < 80 throws BadRequestException', measurementCriteria: 'BadRequestException for qualityScore < 80' },
      { description: 'committedAt timestamp is set on successful commit', measurementCriteria: 'atom.committedAt !== null' },
      { description: 'Already committed atom returns idempotently', measurementCriteria: 'No error for recommitting committed atom' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Atom with score 79 can be committed', expectedBehavior: 'Must throw BadRequestException' },
      { condition: 'Atom with score 80 cannot be committed', expectedBehavior: 'Must succeed (boundary case)' },
    ],
  },
  {
    atomId: 'IA-024',
    description: 'Atom supersession must mark original atom as superseded and link to replacement',
    category: 'functional',
    tags: ['atom', 'supersede', 'status-transition', 'lineage'],
    observableOutcomes: [
      { description: 'Original atom status becomes superseded', measurementCriteria: 'atom.status === "superseded"' },
      { description: 'Original atom supersededBy points to new atom', measurementCriteria: 'atom.supersededBy === newAtom.id' },
      { description: 'New atom must be committed before superseding', measurementCriteria: 'BadRequestException if newAtom.status !== "committed"' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Superseding with draft atom succeeds', expectedBehavior: 'Must throw BadRequestException' },
      { condition: 'Superseded atom status is not updated', expectedBehavior: 'Must be "superseded"' },
    ],
  },
  {
    atomId: 'IA-025',
    description: 'Tag management must add and remove tags from atoms',
    category: 'functional',
    tags: ['atom', 'tags', 'add', 'remove'],
    observableOutcomes: [
      { description: 'Tag is added to atom.tags array', measurementCriteria: 'atom.tags.includes(tag)' },
      { description: 'Tag is removed from atom.tags array', measurementCriteria: '!atom.tags.includes(tag)' },
      { description: 'Duplicate tags are not added', measurementCriteria: 'atom.tags.filter(t => t === tag).length === 1' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Duplicate tag creates multiple entries', expectedBehavior: 'Must be idempotent' },
    ],
  },
  {
    atomId: 'IA-026',
    description: 'Statistics retrieval must return aggregate counts by status and category',
    category: 'functional',
    tags: ['atom', 'statistics', 'aggregation'],
    observableOutcomes: [
      { description: 'Total atom count is returned', measurementCriteria: 'stats.total === actual count' },
      { description: 'Counts by status are accurate', measurementCriteria: 'stats.byStatus[status] === actual' },
      { description: 'Counts by category are accurate', measurementCriteria: 'stats.byCategory[category] === actual' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Counts are inaccurate', expectedBehavior: 'Must match actual database counts' },
    ],
  },
  {
    atomId: 'IA-027',
    description: 'AtomsController must be instantiated by NestJS dependency injection container',
    category: 'functional',
    tags: ['controller', 'dependency-injection', 'instantiation'],
    observableOutcomes: [
      { description: 'Controller instance is defined and not null', measurementCriteria: 'typeof controller !== undefined && controller !== null' },
      { description: 'Controller is instance of AtomsController class', measurementCriteria: 'controller instanceof AtomsController' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Controller is undefined after module compilation', expectedBehavior: 'Controller must be defined' },
    ],
  },
  {
    atomId: 'IA-028',
    description: 'POST /atoms endpoint must delegate atom creation to service and return created atom',
    category: 'functional',
    tags: ['controller', 'endpoint', 'create', 'delegation'],
    observableOutcomes: [
      { description: 'Service.create is called with provided DTO', measurementCriteria: 'service.create.calledWith(dto)' },
      { description: 'Response includes generated atomId', measurementCriteria: 'response.atomId !== undefined' },
      { description: 'Response status is draft', measurementCriteria: 'response.status === "draft"' },
      { description: 'Service errors propagate to caller', measurementCriteria: 'Error thrown by service bubbles up' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Service error is swallowed', expectedBehavior: 'Must propagate error' },
    ],
  },
  {
    atomId: 'IA-029',
    description: 'GET /atoms endpoint must return paginated atoms with filtering support',
    category: 'functional',
    tags: ['controller', 'endpoint', 'list', 'pagination', 'filtering'],
    observableOutcomes: [
      { description: 'Response includes items array', measurementCriteria: 'Array.isArray(response.items)' },
      { description: 'Response includes pagination metadata', measurementCriteria: 'response.total, page, limit, totalPages exist' },
      { description: 'Empty results return empty array not null', measurementCriteria: 'response.items === [] for no matches' },
      { description: 'Filter parameters passed to service', measurementCriteria: 'service.findAll.calledWith(filters)' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Empty result returns null', expectedBehavior: 'Must return empty array' },
      { condition: 'Filters ignored', expectedBehavior: 'Filters must be passed to service' },
    ],
  },
  {
    atomId: 'IA-030',
    description: 'GET /atoms/:id endpoint must return single atom by UUID',
    category: 'functional',
    tags: ['controller', 'endpoint', 'read', 'single'],
    observableOutcomes: [
      { description: 'Service.findOne is called with provided ID', measurementCriteria: 'service.findOne.calledWith(id)' },
      { description: 'Response matches found atom', measurementCriteria: 'response.id === id' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Wrong atom returned', expectedBehavior: 'Must return atom matching ID' },
    ],
  },
  {
    atomId: 'IA-031',
    description: 'PATCH /atoms/:id/commit endpoint must commit draft atom via service',
    category: 'functional',
    tags: ['controller', 'endpoint', 'commit', 'status-transition'],
    observableOutcomes: [
      { description: 'Service.commit is called with provided ID', measurementCriteria: 'service.commit.calledWith(id)' },
      { description: 'Response shows committed status', measurementCriteria: 'response.status === "committed"' },
      { description: 'Response includes committedAt timestamp', measurementCriteria: 'response.committedAt !== null' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Commit not delegated to service', expectedBehavior: 'Service.commit must be called' },
    ],
  },
  {
    atomId: 'IA-032',
    description: 'PATCH /atoms/:id/supersede endpoint must supersede atom with reference to replacement',
    category: 'functional',
    tags: ['controller', 'endpoint', 'supersede', 'status-transition'],
    observableOutcomes: [
      { description: 'Service.supersede is called with both IDs', measurementCriteria: 'service.supersede.calledWith(oldId, newId)' },
      { description: 'Response shows superseded status', measurementCriteria: 'response.status === "superseded"' },
      { description: 'Response includes supersededBy reference', measurementCriteria: 'response.supersededBy === newId' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Supersession not delegated to service', expectedBehavior: 'Service.supersede must be called' },
    ],
  },
  {
    atomId: 'IA-033',
    description: 'Controller must propagate service exceptions to caller without modification',
    category: 'functional',
    tags: ['controller', 'error-handling', 'exception-propagation'],
    observableOutcomes: [
      { description: 'NotFoundException propagates for invalid atom ID', measurementCriteria: 'NotFoundException thrown' },
      { description: 'ForbiddenException propagates for invalid state transitions', measurementCriteria: 'ForbiddenException thrown' },
      { description: 'BadRequestException propagates for validation failures', measurementCriteria: 'BadRequestException thrown' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Exception is swallowed or transformed', expectedBehavior: 'Original exception must propagate' },
    ],
  },
  {
    atomId: 'IA-034',
    description: 'Additional controller endpoints for tags, statistics, and supersession chain',
    category: 'functional',
    tags: ['controller', 'endpoint', 'tags', 'statistics', 'chain'],
    observableOutcomes: [
      { description: 'GET /atoms/tags/popular returns popular tags', measurementCriteria: 'service.getPopularTags called' },
      { description: 'GET /atoms/statistics returns aggregate stats', measurementCriteria: 'service.getStatistics called' },
      { description: 'GET /atoms/:id/chain returns supersession chain', measurementCriteria: 'service.findSupersessionChain called' },
      { description: 'POST /atoms/:id/tags/:tag adds tag', measurementCriteria: 'service.addTag called' },
      { description: 'DELETE /atoms/:id/tags/:tag removes tag', measurementCriteria: 'service.removeTag called' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Endpoint does not delegate to service', expectedBehavior: 'Service method must be called' },
    ],
  },
  {
    atomId: 'IA-035',
    description: 'PATCH /atoms/:id endpoint must update draft atom via service',
    category: 'functional',
    tags: ['controller', 'endpoint', 'update'],
    observableOutcomes: [
      { description: 'Service.update is called with ID and DTO', measurementCriteria: 'service.update.calledWith(id, dto)' },
      { description: 'Response reflects updated values', measurementCriteria: 'response.description === dto.description' },
      { description: 'ForbiddenException propagates for non-draft atoms', measurementCriteria: 'ForbiddenException for committed atoms' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Update not delegated to service', expectedBehavior: 'Service.update must be called' },
    ],
  },
  {
    atomId: 'IA-036',
    description: 'DELETE /atoms/:id endpoint must delete draft atom via service',
    category: 'functional',
    tags: ['controller', 'endpoint', 'delete'],
    observableOutcomes: [
      { description: 'Service.remove is called with ID', measurementCriteria: 'service.remove.calledWith(id)' },
      { description: 'ForbiddenException propagates for non-draft atoms', measurementCriteria: 'ForbiddenException for committed atoms' },
      { description: 'NotFoundException propagates for non-existent atoms', measurementCriteria: 'NotFoundException for invalid ID' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Delete not delegated to service', expectedBehavior: 'Service.remove must be called' },
    ],
  },
  {
    atomId: 'IA-037',
    description: 'Repository must count atoms by status efficiently',
    category: 'functional',
    tags: ['repository', 'count', 'status', 'query'],
    observableOutcomes: [
      { description: 'Count matches actual atoms with status', measurementCriteria: 'count === atoms.filter(a => a.status === status).length' },
      { description: 'Query uses efficient aggregation', measurementCriteria: 'Single query returns count' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Count is inaccurate', expectedBehavior: 'Must match actual count' },
    ],
  },
  {
    atomId: 'IA-038',
    description: 'Repository must retrieve atom with highest atomId for ID generation',
    category: 'functional',
    tags: ['repository', 'findOne', 'ordering', 'id-generation'],
    observableOutcomes: [
      { description: 'Returns atom with highest numeric ID', measurementCriteria: 'result.atomId >= all other atomIds' },
      { description: 'Returns null if no atoms exist', measurementCriteria: 'result === null for empty database' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Returns non-highest ID', expectedBehavior: 'Must return atom with maximum ID' },
    ],
  },
  {
    atomId: 'IA-039',
    description: 'Repository must find atoms by category with filtering',
    category: 'functional',
    tags: ['repository', 'findByCategory', 'filtering'],
    observableOutcomes: [
      { description: 'Returns only atoms matching category', measurementCriteria: 'all results have matching category' },
      { description: 'Returns empty array for no matches', measurementCriteria: 'result === [] for invalid category' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Returns atoms with wrong category', expectedBehavior: 'Must filter by category' },
    ],
  },
  {
    atomId: 'IA-040',
    description: 'Repository search must support text search, status, category, tags, and quality score filtering',
    category: 'functional',
    tags: ['repository', 'search', 'filtering', 'pagination', 'text-search'],
    observableOutcomes: [
      { description: 'Text search matches description and atomId', measurementCriteria: 'results contain search term' },
      { description: 'Status filter returns matching atoms', measurementCriteria: 'all results have matching status' },
      { description: 'Category filter returns matching atoms', measurementCriteria: 'all results have matching category' },
      { description: 'Tag filter returns atoms with all specified tags', measurementCriteria: 'result.tags.includes(each tag)' },
      { description: 'Quality score filter returns atoms in range', measurementCriteria: 'min <= score <= max' },
      { description: 'Pagination metadata is accurate', measurementCriteria: 'totalPages calculated correctly' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Filter does not apply', expectedBehavior: 'Must filter results' },
      { condition: 'Pagination is inaccurate', expectedBehavior: 'Must calculate correctly' },
    ],
  },
  {
    atomId: 'IA-041',
    description: 'Repository must handle boundary conditions for search and filtering',
    category: 'functional',
    tags: ['repository', 'boundary', 'edge-cases'],
    observableOutcomes: [
      { description: 'Empty search returns all atoms', measurementCriteria: 'no filters returns all' },
      { description: 'Single tag filter works', measurementCriteria: 'tag filter with one tag' },
      { description: 'Multiple tags filter with AND logic', measurementCriteria: 'all tags must match' },
      { description: 'Limit 1 returns single result', measurementCriteria: 'result.items.length === 1' },
      { description: 'Large offset returns empty', measurementCriteria: 'offset beyond total returns []' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Boundary condition fails', expectedBehavior: 'Must handle edge cases' },
    ],
  },
  {
    atomId: 'IA-042',
    description: 'WebSocket gateway must emit real-time events for all atom operations',
    category: 'functional',
    tags: ['websocket', 'gateway', 'real-time', 'events'],
    observableOutcomes: [
      { description: 'Gateway initializes with NestJS DI', measurementCriteria: 'gateway instance is defined' },
      { description: 'Client connections are logged', measurementCriteria: 'log message includes client ID' },
      { description: 'atom:created event emitted on create', measurementCriteria: 'server.emit called with atom:created' },
      { description: 'atom:committed event emitted on commit', measurementCriteria: 'server.emit called with atom:committed' },
      { description: 'atom:superseded event emitted on supersede', measurementCriteria: 'server.emit called with atom:superseded' },
      { description: 'atom:updated event emitted on update', measurementCriteria: 'server.emit called with atom:updated' },
      { description: 'atom:deleted event emitted on delete', measurementCriteria: 'server.emit called with atom:deleted' },
      { description: 'Gateway handles undefined server gracefully', measurementCriteria: 'no throw when server is undefined' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Event not emitted on operation', expectedBehavior: 'Must emit corresponding event' },
      { condition: 'Gateway throws on undefined server', expectedBehavior: 'Must handle gracefully' },
    ],
  },
  {
    atomId: 'IA-043',
    description: 'Atomicity checker must evaluate intent descriptions using heuristics for single responsibility, observable outcome, implementation-agnostic, measurable criteria, and reasonable scope',
    category: 'functional',
    tags: ['atomicity', 'heuristics', 'validation', 'intent-analysis'],
    observableOutcomes: [
      { description: 'Returns AtomicityResult with isAtomic flag', measurementCriteria: 'result.isAtomic is boolean' },
      { description: 'Returns confidence score between 0 and 1', measurementCriteria: '0 <= result.confidence <= 1' },
      { description: 'Detects compound conjunctions', measurementCriteria: 'singleResponsibility.passed is false for "and/or" statements' },
      { description: 'Detects observable verbs', measurementCriteria: 'observableOutcome.passed is true for display/show/return' },
      { description: 'Detects technology terms', measurementCriteria: 'implementationAgnostic.passed is false for SQL/API/database' },
      { description: 'Detects measurable criteria', measurementCriteria: 'measurableCriteria.passed is true for time/count constraints' },
      { description: 'Detects scope issues', measurementCriteria: 'reasonableScope.passed is false for all/every/always' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Compound statement passes single responsibility', expectedBehavior: 'Must detect and fail compound intents' },
      { condition: 'Technology term passes implementation-agnostic', expectedBehavior: 'Must detect and fail tech-specific intents' },
      { condition: 'Vague qualifier passes measurable criteria', expectedBehavior: 'Must detect and fail vague intents' },
    ],
  },
  {
    atomId: 'IA-044',
    description: 'Intent refinement service must provide AI-powered iterative refinement with analysis, suggestions, and history tracking',
    category: 'functional',
    tags: ['refinement', 'ai-assisted', 'intent-analysis', 'suggestions'],
    observableOutcomes: [
      { description: 'analyzeIntent returns atomicity classification', measurementCriteria: 'result.atomicity in [atomic, non-atomic, ambiguous]' },
      { description: 'analyzeIntent returns clarifying questions', measurementCriteria: 'result.clarifyingQuestions is array' },
      { description: 'suggestRefinements returns typed suggestions', measurementCriteria: 'each suggestion has id, type, original, suggested, reasoning, confidence' },
      { description: 'refineAtom updates description and history', measurementCriteria: 'atom.refinementHistory includes new record' },
      { description: 'refineAtom re-evaluates quality score', measurementCriteria: 'atomQualityService.validateAtom is called' },
      { description: 'getRefinementHistory returns timeline', measurementCriteria: 'returns array of RefinementRecord' },
      { description: 'acceptSuggestion applies suggested text', measurementCriteria: 'atom.description equals suggestion.suggested' },
    ],
    falsifiabilityCriteria: [
      { condition: 'Refinement allowed on committed atom', expectedBehavior: 'Must reject with error for non-draft atoms' },
      { condition: 'Refinement history not recorded', expectedBehavior: 'Must save refinement record to history' },
      { condition: 'Quality not re-evaluated', expectedBehavior: 'Must call quality service after refinement' },
    ],
  },
];

/**
 * Generate SQL INSERT statements for atoms
 */
function generateInsertSQL() {
  const statements = [];

  for (const atom of ATOM_DEFINITIONS) {
    const id = require('crypto').randomUUID();
    const now = new Date().toISOString();

    const sql = `INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '${id}',
      '${atom.atomId}',
      '${atom.description.replace(/'/g, "''")}',
      '${atom.category}',
      85.00,
      'committed',
      NULL,
      '${now}',
      '${now}',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '${JSON.stringify(atom.observableOutcomes).replace(/'/g, "''")}'::jsonb,
      '${JSON.stringify(atom.falsifiabilityCriteria).replace(/'/g, "''")}'::jsonb,
      '${JSON.stringify(atom.tags).replace(/'/g, "''")}'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;`;

    statements.push(sql);
  }

  return statements.join('\n\n');
}

/**
 * Generate JSON files for filesystem projection
 */
function generateAtomJSON(atom) {
  return {
    atomId: atom.atomId,
    description: atom.description,
    category: atom.category,
    status: 'committed',
    qualityScore: 85.00,
    tags: atom.tags,
    observableOutcomes: atom.observableOutcomes,
    falsifiabilityCriteria: atom.falsifiabilityCriteria,
    metadata: {
      source: 'bootstrap-seed',
      version: '1.0.0',
      projectedAt: new Date().toISOString(),
    },
  };
}

/**
 * Generate markdown file for filesystem projection
 */
function generateAtomMarkdown(atom) {
  const outcomes = atom.observableOutcomes
    .map(o => `- ${o.description}${o.measurementCriteria ? ` (${o.measurementCriteria})` : ''}`)
    .join('\n');

  const criteria = atom.falsifiabilityCriteria
    .map(c => `- **If**: ${c.condition} → **Then**: ${c.expectedBehavior}`)
    .join('\n');

  return `# ${atom.atomId}

## Description

${atom.description}

## Category

${atom.category}

## Status

committed

## Tags

${atom.tags.map(t => `\`${t}\``).join(', ')}

## Observable Outcomes

${outcomes}

## Falsifiability Criteria

${criteria}

---

*Generated by bootstrap seed script*
`;
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'sql':
    console.log('-- Pact Atom Seed SQL');
    console.log('-- Generated:', new Date().toISOString());
    console.log('-- Total atoms:', ATOM_DEFINITIONS.length);
    console.log('');
    console.log(generateInsertSQL());
    break;

  case 'json':
    console.log(JSON.stringify(ATOM_DEFINITIONS.map(generateAtomJSON), null, 2));
    break;

  case 'project': {
    const atomsDir = path.join(process.cwd(), 'atoms');
    if (!fs.existsSync(atomsDir)) {
      fs.mkdirSync(atomsDir, { recursive: true });
    }

    for (const atom of ATOM_DEFINITIONS) {
      const slug = atom.description
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50)
        .replace(/-$/, '');

      const jsonPath = path.join(atomsDir, `${atom.atomId}-${slug}.json`);
      const mdPath = path.join(atomsDir, `${atom.atomId}-${slug}.md`);

      fs.writeFileSync(jsonPath, JSON.stringify(generateAtomJSON(atom), null, 2));
      fs.writeFileSync(mdPath, generateAtomMarkdown(atom));

      console.log(`Projected: ${atom.atomId}`);
    }
    console.log(`\nProjected ${ATOM_DEFINITIONS.length} atoms to ${atomsDir}`);
    break;
  }

  case 'seed': {
    // Generate SQL and execute via docker
    const sql = generateInsertSQL();
    const sqlFile = path.join(__dirname, 'atoms.sql');
    fs.writeFileSync(sqlFile, sql);

    try {
      console.log('Seeding database with atoms...');
      execSync(
        `docker exec -i pact-postgres psql -U pact -d pact_development < "${sqlFile}"`,
        { stdio: 'inherit' }
      );
      console.log(`\nSeeded ${ATOM_DEFINITIONS.length} atoms successfully`);
    } catch (error) {
      console.error('Failed to seed database:', error.message);
      console.log('\nYou can manually run the SQL:');
      console.log(`  cat ${sqlFile} | docker exec -i pact-postgres psql -U pact -d pact_development`);
      process.exit(1);
    }
    break;
  }

  case 'list':
    console.log('Atom Definitions:');
    console.log('=================\n');
    for (const atom of ATOM_DEFINITIONS) {
      console.log(`${atom.atomId}: ${atom.description}`);
      console.log(`  Category: ${atom.category}`);
      console.log(`  Tags: ${atom.tags.join(', ')}`);
      console.log('');
    }
    console.log(`Total: ${ATOM_DEFINITIONS.length} atoms`);
    break;

  default:
    console.log(`
Pact Atom Seed Script
=====================

Usage: node seed-atoms.js <command>

Commands:
  list      List all atom definitions
  sql       Generate SQL INSERT statements
  json      Output atom definitions as JSON
  project   Project atoms to /atoms directory as JSON and markdown
  seed      Seed the database (requires pact-db container)

Examples:
  node seed-atoms.js list
  node seed-atoms.js sql > atoms.sql
  node seed-atoms.js seed
  node seed-atoms.js project
`);
}
