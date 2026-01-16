INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '36ee4b37-0cf5-4187-9ab2-7c87129a293d',
      'IA-018',
      'AtomsService must be instantiated by NestJS dependency injection container',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.360Z',
      '2026-01-16T16:18:02.360Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Service instance is defined and not null","measurementCriteria":"typeof service !== undefined && service !== null"},{"description":"Service is instance of AtomsService class","measurementCriteria":"service instanceof AtomsService"}]'::jsonb,
      '[{"condition":"Service is undefined after module compilation","expectedBehavior":"Service must be defined"}]'::jsonb,
      '["service","dependency-injection","instantiation"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      'e865622e-bb6b-48ed-b200-51e776672c01',
      'IA-019',
      'Atom creation must auto-generate sequential IDs in IA-XXX format starting from IA-001',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"First atom receives ID IA-001","measurementCriteria":"atomId === \"IA-001\" when no atoms exist"},{"description":"Subsequent atoms increment from highest existing ID","measurementCriteria":"newId === previousHighestId + 1"},{"description":"ID format is IA-XXX with zero-padded 3-digit number","measurementCriteria":"atomId.match(/^IA-\\d{3}$/)"}]'::jsonb,
      '[{"condition":"ID is not sequential","expectedBehavior":"ID must be exactly one higher than previous highest"},{"condition":"ID format is malformed","expectedBehavior":"ID must match IA-XXX pattern"}]'::jsonb,
      '["atom","create","id-generation","sequence"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '2d7768a5-ad1e-4470-9307-045aef626e12',
      'IA-020',
      'Atom retrieval must return correct atom by UUID or throw NotFoundException',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Existing atom is returned with all fields","measurementCriteria":"returned atom matches stored atom"},{"description":"Non-existent UUID throws NotFoundException","measurementCriteria":"NotFoundException thrown for invalid UUID"}]'::jsonb,
      '[{"condition":"Returns null for non-existent atom","expectedBehavior":"Must throw NotFoundException"},{"condition":"Returns wrong atom","expectedBehavior":"Must return atom matching provided UUID"}]'::jsonb,
      '["atom","read","findOne","not-found"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      'b7c788fe-dcea-431f-9772-2d48cb13567c',
      'IA-021',
      'Atom update must modify only draft atoms and reject updates to committed atoms',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Draft atom fields are updated","measurementCriteria":"atom.description === newDescription"},{"description":"Committed atom update throws ForbiddenException","measurementCriteria":"ForbiddenException for status !== \"draft\""}]'::jsonb,
      '[{"condition":"Committed atom can be modified","expectedBehavior":"Must throw ForbiddenException"}]'::jsonb,
      '["atom","update","draft","immutability"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '849d7b9c-7293-4b66-9d0d-db1ca80f7366',
      'IA-022',
      'Atom deletion must only remove draft atoms and reject deletion of committed atoms',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Draft atom is removed from database","measurementCriteria":"atom no longer exists after deletion"},{"description":"Committed atom deletion throws ForbiddenException","measurementCriteria":"ForbiddenException for status !== \"draft\""}]'::jsonb,
      '[{"condition":"Committed atom can be deleted","expectedBehavior":"Must throw ForbiddenException"}]'::jsonb,
      '["atom","delete","draft","immutability"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      'c0144c98-907d-4815-b979-a0f6ecd5ac79',
      'IA-023',
      'Atom commitment must require minimum quality score of 80 and transition status to committed',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Atom with score >= 80 transitions to committed status","measurementCriteria":"atom.status === \"committed\" after commit"},{"description":"Atom with score < 80 throws BadRequestException","measurementCriteria":"BadRequestException for qualityScore < 80"},{"description":"committedAt timestamp is set on successful commit","measurementCriteria":"atom.committedAt !== null"},{"description":"Already committed atom returns idempotently","measurementCriteria":"No error for recommitting committed atom"}]'::jsonb,
      '[{"condition":"Atom with score 79 can be committed","expectedBehavior":"Must throw BadRequestException"},{"condition":"Atom with score 80 cannot be committed","expectedBehavior":"Must succeed (boundary case)"}]'::jsonb,
      '["atom","commit","quality-gate","status-transition"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '7ee4f212-5013-4bc9-9610-48415ca4fb95',
      'IA-024',
      'Atom supersession must mark original atom as superseded and link to replacement',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Original atom status becomes superseded","measurementCriteria":"atom.status === \"superseded\""},{"description":"Original atom supersededBy points to new atom","measurementCriteria":"atom.supersededBy === newAtom.id"},{"description":"New atom must be committed before superseding","measurementCriteria":"BadRequestException if newAtom.status !== \"committed\""}]'::jsonb,
      '[{"condition":"Superseding with draft atom succeeds","expectedBehavior":"Must throw BadRequestException"},{"condition":"Superseded atom status is not updated","expectedBehavior":"Must be \"superseded\""}]'::jsonb,
      '["atom","supersede","status-transition","lineage"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      'cae19be1-bd44-4026-bc9c-3c11d2072abe',
      'IA-025',
      'Tag management must add and remove tags from atoms',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Tag is added to atom.tags array","measurementCriteria":"atom.tags.includes(tag)"},{"description":"Tag is removed from atom.tags array","measurementCriteria":"!atom.tags.includes(tag)"},{"description":"Duplicate tags are not added","measurementCriteria":"atom.tags.filter(t => t === tag).length === 1"}]'::jsonb,
      '[{"condition":"Duplicate tag creates multiple entries","expectedBehavior":"Must be idempotent"}]'::jsonb,
      '["atom","tags","add","remove"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      'bd596242-e80a-4785-8b68-d1304d359d10',
      'IA-026',
      'Statistics retrieval must return aggregate counts by status and category',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Total atom count is returned","measurementCriteria":"stats.total === actual count"},{"description":"Counts by status are accurate","measurementCriteria":"stats.byStatus[status] === actual"},{"description":"Counts by category are accurate","measurementCriteria":"stats.byCategory[category] === actual"}]'::jsonb,
      '[{"condition":"Counts are inaccurate","expectedBehavior":"Must match actual database counts"}]'::jsonb,
      '["atom","statistics","aggregation"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '5b4e6bef-2def-4429-adbc-c63f4e7eb9d5',
      'IA-027',
      'AtomsController must be instantiated by NestJS dependency injection container',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Controller instance is defined and not null","measurementCriteria":"typeof controller !== undefined && controller !== null"},{"description":"Controller is instance of AtomsController class","measurementCriteria":"controller instanceof AtomsController"}]'::jsonb,
      '[{"condition":"Controller is undefined after module compilation","expectedBehavior":"Controller must be defined"}]'::jsonb,
      '["controller","dependency-injection","instantiation"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '275e0c3f-a7a5-4ee9-b442-500d01dfb1d3',
      'IA-028',
      'POST /atoms endpoint must delegate atom creation to service and return created atom',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Service.create is called with provided DTO","measurementCriteria":"service.create.calledWith(dto)"},{"description":"Response includes generated atomId","measurementCriteria":"response.atomId !== undefined"},{"description":"Response status is draft","measurementCriteria":"response.status === \"draft\""},{"description":"Service errors propagate to caller","measurementCriteria":"Error thrown by service bubbles up"}]'::jsonb,
      '[{"condition":"Service error is swallowed","expectedBehavior":"Must propagate error"}]'::jsonb,
      '["controller","endpoint","create","delegation"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '2b82299c-f688-4fc9-8b73-56b65bacb0c1',
      'IA-029',
      'GET /atoms endpoint must return paginated atoms with filtering support',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Response includes items array","measurementCriteria":"Array.isArray(response.items)"},{"description":"Response includes pagination metadata","measurementCriteria":"response.total, page, limit, totalPages exist"},{"description":"Empty results return empty array not null","measurementCriteria":"response.items === [] for no matches"},{"description":"Filter parameters passed to service","measurementCriteria":"service.findAll.calledWith(filters)"}]'::jsonb,
      '[{"condition":"Empty result returns null","expectedBehavior":"Must return empty array"},{"condition":"Filters ignored","expectedBehavior":"Filters must be passed to service"}]'::jsonb,
      '["controller","endpoint","list","pagination","filtering"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '2d73d999-d566-4d8e-a742-35ea0b6619d5',
      'IA-030',
      'GET /atoms/:id endpoint must return single atom by UUID',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Service.findOne is called with provided ID","measurementCriteria":"service.findOne.calledWith(id)"},{"description":"Response matches found atom","measurementCriteria":"response.id === id"}]'::jsonb,
      '[{"condition":"Wrong atom returned","expectedBehavior":"Must return atom matching ID"}]'::jsonb,
      '["controller","endpoint","read","single"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '6e3975f9-2fef-4212-b4c2-dcc0abc4f3a3',
      'IA-031',
      'PATCH /atoms/:id/commit endpoint must commit draft atom via service',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Service.commit is called with provided ID","measurementCriteria":"service.commit.calledWith(id)"},{"description":"Response shows committed status","measurementCriteria":"response.status === \"committed\""},{"description":"Response includes committedAt timestamp","measurementCriteria":"response.committedAt !== null"}]'::jsonb,
      '[{"condition":"Commit not delegated to service","expectedBehavior":"Service.commit must be called"}]'::jsonb,
      '["controller","endpoint","commit","status-transition"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '338b0756-d887-4ab9-b663-b136a88929f6',
      'IA-032',
      'PATCH /atoms/:id/supersede endpoint must supersede atom with reference to replacement',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Service.supersede is called with both IDs","measurementCriteria":"service.supersede.calledWith(oldId, newId)"},{"description":"Response shows superseded status","measurementCriteria":"response.status === \"superseded\""},{"description":"Response includes supersededBy reference","measurementCriteria":"response.supersededBy === newId"}]'::jsonb,
      '[{"condition":"Supersession not delegated to service","expectedBehavior":"Service.supersede must be called"}]'::jsonb,
      '["controller","endpoint","supersede","status-transition"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '257a6f6d-fc80-4179-86f1-912cbda2e267',
      'IA-033',
      'Controller must propagate service exceptions to caller without modification',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"NotFoundException propagates for invalid atom ID","measurementCriteria":"NotFoundException thrown"},{"description":"ForbiddenException propagates for invalid state transitions","measurementCriteria":"ForbiddenException thrown"},{"description":"BadRequestException propagates for validation failures","measurementCriteria":"BadRequestException thrown"}]'::jsonb,
      '[{"condition":"Exception is swallowed or transformed","expectedBehavior":"Original exception must propagate"}]'::jsonb,
      '["controller","error-handling","exception-propagation"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '1e0242f1-a92e-403e-9b22-5595c66460e3',
      'IA-034',
      'Additional controller endpoints for tags, statistics, and supersession chain',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"GET /atoms/tags/popular returns popular tags","measurementCriteria":"service.getPopularTags called"},{"description":"GET /atoms/statistics returns aggregate stats","measurementCriteria":"service.getStatistics called"},{"description":"GET /atoms/:id/chain returns supersession chain","measurementCriteria":"service.findSupersessionChain called"},{"description":"POST /atoms/:id/tags/:tag adds tag","measurementCriteria":"service.addTag called"},{"description":"DELETE /atoms/:id/tags/:tag removes tag","measurementCriteria":"service.removeTag called"}]'::jsonb,
      '[{"condition":"Endpoint does not delegate to service","expectedBehavior":"Service method must be called"}]'::jsonb,
      '["controller","endpoint","tags","statistics","chain"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      'd54c6edd-1df0-4924-b227-13fd1aeca2b6',
      'IA-035',
      'PATCH /atoms/:id endpoint must update draft atom via service',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Service.update is called with ID and DTO","measurementCriteria":"service.update.calledWith(id, dto)"},{"description":"Response reflects updated values","measurementCriteria":"response.description === dto.description"},{"description":"ForbiddenException propagates for non-draft atoms","measurementCriteria":"ForbiddenException for committed atoms"}]'::jsonb,
      '[{"condition":"Update not delegated to service","expectedBehavior":"Service.update must be called"}]'::jsonb,
      '["controller","endpoint","update"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '33f4e31f-b19b-4431-b0d6-265a4e987f85',
      'IA-036',
      'DELETE /atoms/:id endpoint must delete draft atom via service',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Service.remove is called with ID","measurementCriteria":"service.remove.calledWith(id)"},{"description":"ForbiddenException propagates for non-draft atoms","measurementCriteria":"ForbiddenException for committed atoms"},{"description":"NotFoundException propagates for non-existent atoms","measurementCriteria":"NotFoundException for invalid ID"}]'::jsonb,
      '[{"condition":"Delete not delegated to service","expectedBehavior":"Service.remove must be called"}]'::jsonb,
      '["controller","endpoint","delete"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      'fe406211-8086-4cea-b5d8-19577b51188e',
      'IA-037',
      'Repository must count atoms by status efficiently',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Count matches actual atoms with status","measurementCriteria":"count === atoms.filter(a => a.status === status).length"},{"description":"Query uses efficient aggregation","measurementCriteria":"Single query returns count"}]'::jsonb,
      '[{"condition":"Count is inaccurate","expectedBehavior":"Must match actual count"}]'::jsonb,
      '["repository","count","status","query"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '206b7355-35dd-4060-b297-017def14ec38',
      'IA-038',
      'Repository must retrieve atom with highest atomId for ID generation',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Returns atom with highest numeric ID","measurementCriteria":"result.atomId >= all other atomIds"},{"description":"Returns null if no atoms exist","measurementCriteria":"result === null for empty database"}]'::jsonb,
      '[{"condition":"Returns non-highest ID","expectedBehavior":"Must return atom with maximum ID"}]'::jsonb,
      '["repository","findOne","ordering","id-generation"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      'f6659cb0-6ccc-405d-b488-468b8a1c5065',
      'IA-039',
      'Repository must find atoms by category with filtering',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Returns only atoms matching category","measurementCriteria":"all results have matching category"},{"description":"Returns empty array for no matches","measurementCriteria":"result === [] for invalid category"}]'::jsonb,
      '[{"condition":"Returns atoms with wrong category","expectedBehavior":"Must filter by category"}]'::jsonb,
      '["repository","findByCategory","filtering"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '368f6030-4f9c-4d81-8c05-2439e0eb2519',
      'IA-040',
      'Repository search must support text search, status, category, tags, and quality score filtering',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Text search matches description and atomId","measurementCriteria":"results contain search term"},{"description":"Status filter returns matching atoms","measurementCriteria":"all results have matching status"},{"description":"Category filter returns matching atoms","measurementCriteria":"all results have matching category"},{"description":"Tag filter returns atoms with all specified tags","measurementCriteria":"result.tags.includes(each tag)"},{"description":"Quality score filter returns atoms in range","measurementCriteria":"min <= score <= max"},{"description":"Pagination metadata is accurate","measurementCriteria":"totalPages calculated correctly"}]'::jsonb,
      '[{"condition":"Filter does not apply","expectedBehavior":"Must filter results"},{"condition":"Pagination is inaccurate","expectedBehavior":"Must calculate correctly"}]'::jsonb,
      '["repository","search","filtering","pagination","text-search"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '1e76e13f-bc41-49bc-b0a3-465bc9f47658',
      'IA-041',
      'Repository must handle boundary conditions for search and filtering',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Empty search returns all atoms","measurementCriteria":"no filters returns all"},{"description":"Single tag filter works","measurementCriteria":"tag filter with one tag"},{"description":"Multiple tags filter with AND logic","measurementCriteria":"all tags must match"},{"description":"Limit 1 returns single result","measurementCriteria":"result.items.length === 1"},{"description":"Large offset returns empty","measurementCriteria":"offset beyond total returns []"}]'::jsonb,
      '[{"condition":"Boundary condition fails","expectedBehavior":"Must handle edge cases"}]'::jsonb,
      '["repository","boundary","edge-cases"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '8fbbee6c-91ec-4ffc-a178-74309998f012',
      'IA-042',
      'WebSocket gateway must emit real-time events for all atom operations',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Gateway initializes with NestJS DI","measurementCriteria":"gateway instance is defined"},{"description":"Client connections are logged","measurementCriteria":"log message includes client ID"},{"description":"atom:created event emitted on create","measurementCriteria":"server.emit called with atom:created"},{"description":"atom:committed event emitted on commit","measurementCriteria":"server.emit called with atom:committed"},{"description":"atom:superseded event emitted on supersede","measurementCriteria":"server.emit called with atom:superseded"},{"description":"atom:updated event emitted on update","measurementCriteria":"server.emit called with atom:updated"},{"description":"atom:deleted event emitted on delete","measurementCriteria":"server.emit called with atom:deleted"},{"description":"Gateway handles undefined server gracefully","measurementCriteria":"no throw when server is undefined"}]'::jsonb,
      '[{"condition":"Event not emitted on operation","expectedBehavior":"Must emit corresponding event"},{"condition":"Gateway throws on undefined server","expectedBehavior":"Must handle gracefully"}]'::jsonb,
      '["websocket","gateway","real-time","events"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '32e52f86-ac05-4902-9155-76dae197ee53',
      'IA-043',
      'Atomicity checker must evaluate intent descriptions using heuristics for single responsibility, observable outcome, implementation-agnostic, measurable criteria, and reasonable scope',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"Returns AtomicityResult with isAtomic flag","measurementCriteria":"result.isAtomic is boolean"},{"description":"Returns confidence score between 0 and 1","measurementCriteria":"0 <= result.confidence <= 1"},{"description":"Detects compound conjunctions","measurementCriteria":"singleResponsibility.passed is false for \"and/or\" statements"},{"description":"Detects observable verbs","measurementCriteria":"observableOutcome.passed is true for display/show/return"},{"description":"Detects technology terms","measurementCriteria":"implementationAgnostic.passed is false for SQL/API/database"},{"description":"Detects measurable criteria","measurementCriteria":"measurableCriteria.passed is true for time/count constraints"},{"description":"Detects scope issues","measurementCriteria":"reasonableScope.passed is false for all/every/always"}]'::jsonb,
      '[{"condition":"Compound statement passes single responsibility","expectedBehavior":"Must detect and fail compound intents"},{"condition":"Technology term passes implementation-agnostic","expectedBehavior":"Must detect and fail tech-specific intents"},{"condition":"Vague qualifier passes measurable criteria","expectedBehavior":"Must detect and fail vague intents"}]'::jsonb,
      '["atomicity","heuristics","validation","intent-analysis"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;

INSERT INTO atoms (
      id, "atomId", description, category, "qualityScore", status,
      "supersededBy", "createdAt", "committedAt", "createdBy",
      metadata, "observableOutcomes", "falsifiabilityCriteria",
      tags, "canvasPosition", "parentIntent", "refinementHistory"
    ) VALUES (
      '7e958bfe-3309-41ea-9e2a-28179dd438d7',
      'IA-044',
      'Intent refinement service must provide AI-powered iterative refinement with analysis, suggestions, and history tracking',
      'functional',
      85.00,
      'committed',
      NULL,
      '2026-01-16T16:18:02.361Z',
      '2026-01-16T16:18:02.361Z',
      'bootstrap-seed',
      '{"source": "bootstrap-seed", "version": "1.0.0"}'::jsonb,
      '[{"description":"analyzeIntent returns atomicity classification","measurementCriteria":"result.atomicity in [atomic, non-atomic, ambiguous]"},{"description":"analyzeIntent returns clarifying questions","measurementCriteria":"result.clarifyingQuestions is array"},{"description":"suggestRefinements returns typed suggestions","measurementCriteria":"each suggestion has id, type, original, suggested, reasoning, confidence"},{"description":"refineAtom updates description and history","measurementCriteria":"atom.refinementHistory includes new record"},{"description":"refineAtom re-evaluates quality score","measurementCriteria":"atomQualityService.validateAtom is called"},{"description":"getRefinementHistory returns timeline","measurementCriteria":"returns array of RefinementRecord"},{"description":"acceptSuggestion applies suggested text","measurementCriteria":"atom.description equals suggestion.suggested"}]'::jsonb,
      '[{"condition":"Refinement allowed on committed atom","expectedBehavior":"Must reject with error for non-draft atoms"},{"condition":"Refinement history not recorded","expectedBehavior":"Must save refinement record to history"},{"condition":"Quality not re-evaluated","expectedBehavior":"Must call quality service after refinement"}]'::jsonb,
      '["refinement","ai-assisted","intent-analysis","suggestions"]'::jsonb,
      NULL,
      'Extracted from test annotations during Pact bootstrap',
      '[]'::jsonb
    ) ON CONFLICT ("atomId") DO UPDATE SET
      description = EXCLUDED.description,
      "observableOutcomes" = EXCLUDED."observableOutcomes",
      "falsifiabilityCriteria" = EXCLUDED."falsifiabilityCriteria",
      tags = EXCLUDED.tags;