/**
 * Evidence Extractors
 *
 * Pure regex-based static analysis functions that extract EvidenceItem[]
 * from different source types. No LLM calls, no AST parsing.
 *
 * Used by the discover node to produce evidence from:
 * - Source exports (functions, classes, constants)
 * - UI components (React, Vue, Svelte, Angular)
 * - API endpoints (NestJS, Express, Fastify)
 * - Documentation (Markdown sections)
 *
 * Test evidence is handled separately by the existing orphan test logic.
 */

import {
  EvidenceItem,
  EvidenceType,
  EVIDENCE_CONFIDENCE_WEIGHTS,
} from '../../types/reconciliation-state';

// ============================================================================
// Helpers
// ============================================================================

function getLineNumber(content: string, charIndex: number): number {
  return content.substring(0, charIndex).split('\n').length;
}

function extractSurroundingCode(content: string, charIndex: number, contextLines: number): string {
  const lines = content.split('\n');
  const lineNum = getLineNumber(content, charIndex) - 1; // 0-indexed
  const start = Math.max(0, lineNum - 2);
  const end = Math.min(lines.length, lineNum + contextLines);
  return lines.slice(start, end).join('\n');
}

/**
 * Extract the JSDoc block immediately preceding the given character index.
 * Returns the JSDoc text (without delimiters) or undefined if none found.
 */
function extractPrecedingJSDoc(content: string, charIndex: number): string | undefined {
  // Look backwards from the export for a /** ... */ block
  const preceding = content.substring(Math.max(0, charIndex - 2000), charIndex);
  // Match the last JSDoc block before the export (allowing whitespace/decorators between)
  const jsdocMatch = /\/\*\*([\s\S]*?)\*\/\s*(?:@\w+\([^)]*\)\s*)*$/m.exec(preceding);
  if (!jsdocMatch) return undefined;

  // Clean up: strip leading * and whitespace from each line
  const raw = jsdocMatch[1];
  const cleaned = raw
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return cleaned.length > 10 ? cleaned : undefined;
}

// ============================================================================
// Source Export Evidence
// ============================================================================

export function extractSourceExports(filePath: string, content: string): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const exportRegex = /export\s+(default\s+)?(async\s+)?(function|class|const|interface)\s+(\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = exportRegex.exec(content)) !== null) {
    const [, isDefault, , exportType, name] = match;
    // Skip internal/utility exports
    if (name.startsWith('_') || name.length < 3) continue;
    // Skip test-related exports
    if (name.includes('Mock') || name.includes('Fixture') || name.includes('Stub')) continue;

    const jsdoc = extractPrecedingJSDoc(content, match.index);
    const codeSnippet = extractSurroundingCode(content, match.index, 20);
    // Prepend JSDoc to code if it's not already captured by surrounding context
    const code = jsdoc && !codeSnippet.includes(jsdoc.substring(0, 30))
      ? `/** ${jsdoc} */\n${codeSnippet}`
      : codeSnippet;

    items.push({
      type: 'source_export',
      filePath,
      name,
      code,
      lineNumber: getLineNumber(content, match.index),
      baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.source_export,
      metadata: {
        exportType: exportType as 'function' | 'class' | 'const' | 'interface',
        isDefault: !!isDefault,
        jsdoc: jsdoc || undefined,
      },
    });
  }

  return items;
}

// ============================================================================
// UI Component Evidence
// ============================================================================

export function extractUIComponents(
  filePath: string,
  content: string,
  frameworks: string[],
): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  if (frameworks.includes('react') && (filePath.endsWith('.tsx') || filePath.endsWith('.jsx'))) {
    extractReactComponents(filePath, content, items);
  }
  if (frameworks.includes('vue') && filePath.endsWith('.vue')) {
    extractVueComponents(filePath, content, items);
  }
  if (frameworks.includes('svelte') && filePath.endsWith('.svelte')) {
    extractSvelteComponents(filePath, content, items);
  }

  return items;
}

function extractReactComponents(filePath: string, content: string, items: EvidenceItem[]): void {
  const foundNames = new Set<string>();

  // Pattern 1: export [default] function ComponentName
  const componentRegex = /export\s+(default\s+)?function\s+([A-Z]\w+)/g;
  // Pattern 2: export [default] const ComponentName = ...
  const arrowComponentRegex = /export\s+(default\s+)?const\s+([A-Z]\w+)\s*[=:]/g;
  // Pattern 3: Separate export default ComponentName (common in React)
  const separateDefaultRegex = /export\s+default\s+([A-Z]\w+)\s*;?\s*$/gm;
  // Pattern 4: React.forwardRef / React.memo wrappers
  const wrapperRegex = /export\s+(default\s+)?const\s+([A-Z]\w+)\s*=\s*(?:React\.)?(?:forwardRef|memo)\s*[(<]/g;

  // File-level JSX check: the file likely contains JSX if it has any angle-bracket tags
  const fileHasJSX = /<[A-Z]/.test(content) || /return\s*\(?\s*</.test(content)
    || content.includes('jsx') || content.includes('React');

  const hasForm = /(<form|<input|<textarea|<select|useForm)/i.test(content);
  const hasNavigation = /(<Link|useRouter|useNavigate|usePathname)/i.test(content);

  const addComponent = (name: string, charIndex: number): void => {
    if (foundNames.has(name)) return;
    foundNames.add(name);
    items.push({
      type: 'ui_component',
      filePath,
      name,
      code: extractSurroundingCode(content, charIndex, 30),
      lineNumber: getLineNumber(content, charIndex),
      baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.ui_component,
      metadata: { framework: 'react', hasForm, hasNavigation },
    });
  };

  for (const regex of [componentRegex, arrowComponentRegex, wrapperRegex]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[2];
      const code = extractSurroundingCode(content, match.index, 30);
      // Relaxed JSX check: either snippet has JSX-like content, or the file overall does
      if (!fileHasJSX && !code.includes('<') && !code.includes('jsx') && !code.includes('React')) continue;
      addComponent(name, match.index);
    }
  }

  // Pattern 3: separate `export default ComponentName` — resolve from function/const defined earlier
  let match: RegExpExecArray | null;
  while ((match = separateDefaultRegex.exec(content)) !== null) {
    const name = match[1];
    if (foundNames.has(name)) continue;
    // Verify the name is declared as a function/const in this file
    const declRegex = new RegExp(String.raw`(?:function|const)\s+${name}\b`);
    if (!declRegex.test(content)) continue;
    if (!fileHasJSX) continue;
    addComponent(name, match.index);
  }
}

function extractVueComponents(filePath: string, content: string, items: EvidenceItem[]): void {
  // Vue SFC — the file itself is the component
  const name = filePath.split('/').pop()?.replace('.vue', '') || 'UnknownComponent';
  const hasTemplate = /<template>/i.test(content);
  if (!hasTemplate) return;

  const hasForm = /(<form|<input|<textarea|v-model)/i.test(content);
  const hasNavigation = /(<router-link|useRouter|\$router)/i.test(content);

  items.push({
    type: 'ui_component',
    filePath,
    name,
    code: content.substring(0, 2000), // First 2000 chars as snippet
    lineNumber: 1,
    baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.ui_component,
    metadata: { framework: 'vue', hasForm, hasNavigation },
  });
}

function extractSvelteComponents(filePath: string, content: string, items: EvidenceItem[]): void {
  const name = filePath.split('/').pop()?.replace('.svelte', '') || 'UnknownComponent';
  const hasForm = /(<form|<input|bind:value)/i.test(content);
  const hasNavigation = /(<a\s+href|goto\()/i.test(content);

  items.push({
    type: 'ui_component',
    filePath,
    name,
    code: content.substring(0, 2000),
    lineNumber: 1,
    baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.ui_component,
    metadata: { framework: 'svelte', hasForm, hasNavigation },
  });
}

// ============================================================================
// API Endpoint Evidence
// ============================================================================

export function extractAPIEndpoints(
  filePath: string,
  content: string,
  frameworks: string[],
): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  if (frameworks.includes('nestjs')) {
    extractNestJSEndpoints(filePath, content, items);
  }
  if (frameworks.includes('graphql') || frameworks.includes('nestjs')) {
    extractGraphQLResolvers(filePath, content, items);
  }
  if (frameworks.includes('express') || frameworks.includes('fastify')) {
    extractExpressEndpoints(filePath, content, items);
  }

  return items;
}

function extractNestJSEndpoints(filePath: string, content: string, items: EvidenceItem[]): void {
  const decoratorRegex = /@(Get|Post|Put|Delete|Patch)\(\s*['"]?([^'")\s]*)['"]?\s*\)/g;
  let match: RegExpExecArray | null;

  // Find the controller route prefix
  const controllerMatch = /@Controller\(\s*['"]([^'"]*)['"]\s*\)/.exec(content);
  const controllerPrefix = controllerMatch ? controllerMatch[1] : '';

  while ((match = decoratorRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2] || '/';
    const fullPath = `/${controllerPrefix}/${routePath}`.replace(/\/+/g, '/');

    // Find the method name on the next line
    const afterDecorator = content.substring(match.index + match[0].length, match.index + match[0].length + 200);
    const methodNameMatch = /(?:async\s+)?(\w+)\s*\(/.exec(afterDecorator);
    const methodName = methodNameMatch ? methodNameMatch[1] : `${method} ${fullPath}`;

    items.push({
      type: 'api_endpoint',
      filePath,
      name: methodName,
      code: extractSurroundingCode(content, match.index, 15),
      lineNumber: getLineNumber(content, match.index),
      baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.api_endpoint,
      metadata: { method, path: fullPath },
    });
  }
}

function extractGraphQLResolvers(filePath: string, content: string, items: EvidenceItem[]): void {
  // Match @Query(), @Mutation(), @Subscription(), @ResolveField() decorators
  const gqlDecoratorRegex = /@(Query|Mutation|Subscription|ResolveField)\(\s*(?:[^)]*)\)/g;
  let match: RegExpExecArray | null;

  // Find the resolver type prefix (e.g., @Resolver(() => User))
  const resolverMatch = /@Resolver\(\s*(?:\(\)\s*=>\s*)?['"]?(\w+)['"]?\s*\)/.exec(content);
  const resolverType = resolverMatch ? resolverMatch[1] : '';

  while ((match = gqlDecoratorRegex.exec(content)) !== null) {
    const operation = match[1]; // Query, Mutation, etc.

    // Find the method name on the next line
    const afterDecorator = content.substring(match.index + match[0].length, match.index + match[0].length + 200);
    const methodNameMatch = /(?:async\s+)?(\w+)\s*\(/.exec(afterDecorator);
    const methodName = methodNameMatch ? methodNameMatch[1] : `${operation}`;
    const gqlPath = resolverType ? `${resolverType}.${methodName}` : methodName;

    items.push({
      type: 'api_endpoint',
      filePath,
      name: methodName,
      code: extractSurroundingCode(content, match.index, 15),
      lineNumber: getLineNumber(content, match.index),
      baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.api_endpoint,
      metadata: { method: `GRAPHQL_${operation.toUpperCase()}`, path: gqlPath },
    });
  }
}

function extractExpressEndpoints(filePath: string, content: string, items: EvidenceItem[]): void {
  const routerRegex = /\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = routerRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];

    items.push({
      type: 'api_endpoint',
      filePath,
      name: `${method} ${routePath}`,
      code: extractSurroundingCode(content, match.index, 10),
      lineNumber: getLineNumber(content, match.index),
      baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.api_endpoint,
      metadata: { method, path: routePath },
    });
  }
}

// ============================================================================
// Documentation Evidence
// ============================================================================

export function extractDocumentationEvidence(filePath: string, content: string): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  // Split into sections by headings (# or ##)
  const sections = content.split(/^(#{1,2}\s+.+)$/m);

  // Boilerplate headings to skip
  const boilerplate = /^(table of contents|license|changelog|contributing|installation|getting started)/i;

  let currentHeading = '';
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    if (/^#{1,2}\s+/.test(section)) {
      currentHeading = section.replace(/^#{1,2}\s+/, '').trim();
      continue;
    }

    // Skip boilerplate sections
    if (boilerplate.test(currentHeading)) continue;

    // Only include sections with substantive content (>80 chars, not just links)
    const textContent = section.replace(/\[.*?\]\(.*?\)/g, '').trim();
    if (textContent.length < 80) continue;

    items.push({
      type: 'documentation',
      filePath,
      name: currentHeading || filePath.split('/').pop() || 'Documentation',
      code: section.substring(0, 1500), // Cap at 1500 chars
      lineNumber: 1, // Approximate — markdown sections don't map cleanly
      baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.documentation,
      metadata: { section: currentHeading },
    });
  }

  return items;
}

// ============================================================================
// Code Comment Evidence
// ============================================================================

/**
 * Extract evidence from inline code comments:
 * - Standalone JSDoc blocks (not already captured by export extraction)
 * - Task annotations (e.g. lines starting with "// " followed by keywords)
 * - Business logic comments explaining rules or constraints
 * - @atom references in source files (coupling signals)
 */
export function extractCodeComments(filePath: string, content: string): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  extractStandaloneJSDoc(filePath, content, items);
  extractTaskAnnotations(filePath, content, items);
  extractBusinessLogicComments(filePath, content, items);
  extractAtomReferences(filePath, content, items);

  return items;
}

/**
 * Find JSDoc blocks that describe modules, types, or files — not attached to exports.
 * These often contain high-level behavioral descriptions.
 */
function extractStandaloneJSDoc(filePath: string, content: string, items: EvidenceItem[]): void {
  const jsdocRegex = /\/\*\*([\s\S]*?)\*\//g;

  let match: RegExpExecArray | null;
  while ((match = jsdocRegex.exec(content)) !== null) {
    const raw = match[1];
    const cleaned = raw
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .filter((line) => line.length > 0)
      .join('\n');

    // Skip short or trivial JSDoc (parameter-only docs, etc.)
    if (cleaned.length < 40) continue;

    // Skip if it's immediately followed by an export (already captured)
    const afterBlock = content.substring(match.index + match[0].length, match.index + match[0].length + 200);
    if (/^\s*(?:@\w+\([^)]*\)\s*)*export\s/.test(afterBlock)) continue;

    // Extract meaningful tags
    const tags: string[] = [];
    const tagMatches = cleaned.matchAll(/@(\w+)/g);
    for (const tm of tagMatches) {
      if (!['param', 'returns', 'return', 'type', 'typedef'].includes(tm[1])) {
        tags.push(`@${tm[1]}`);
      }
    }

    // Only include JSDoc with descriptive content (not just @param lists)
    const descriptionLines = cleaned.split('\n').filter((l) => !l.startsWith('@'));
    const description = descriptionLines.join('\n').trim();
    if (description.length < 30) continue;

    const lineNum = getLineNumber(content, match.index);
    items.push({
      type: 'code_comment',
      filePath,
      name: descriptionLines[0].substring(0, 80),
      code: cleaned.substring(0, 1000),
      lineNumber: lineNum,
      baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.code_comment,
      metadata: { commentType: 'jsdoc', tags: tags.length > 0 ? tags : undefined },
    });
  }
}

/**
 * Find task annotation comments that signal incomplete or provisional behavior.
 * Matches patterns like: // [keyword]: description
 */
function extractTaskAnnotations(filePath: string, content: string, items: EvidenceItem[]): void {
  // Match common task annotation patterns in single-line comments
  const annotationRegex = /\/\/\s*((?:needs|hack|bug|note|important|warning|workaround|refactor|deprecated|security)[:\s].{15,})/gi;
  let match: RegExpExecArray | null;

  while ((match = annotationRegex.exec(content)) !== null) {
    const annotation = match[1].trim();
    const lineNum = getLineNumber(content, match.index);

    items.push({
      type: 'code_comment',
      filePath,
      name: annotation.substring(0, 80),
      code: extractSurroundingCode(content, match.index, 5),
      lineNumber: lineNum,
      baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.code_comment * 0.8,
      metadata: { commentType: 'task_annotation' },
    });
  }
}

/**
 * Find inline comments that describe business rules or behavioral constraints.
 * Looks for comments containing keywords that suggest intent specification.
 */
function extractBusinessLogicComments(
  filePath: string,
  content: string,
  items: EvidenceItem[],
): void {
  const lines = content.split('\n');
  const businessKeywords = /\b(must|shall|should|require|ensure|validate|verify|allow|deny|prevent|restrict|limit|enforce|guarantee|expect|always|never)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match single-line comments with business logic keywords
    const commentMatch = /^\/\/\s*(.{20,})$/.exec(line);
    if (!commentMatch) continue;

    const commentText = commentMatch[1].trim();
    if (!businessKeywords.test(commentText)) continue;

    // Skip generic or noise comments
    if (/eslint|prettier|istanbul|webpack|typescript|noinspection/i.test(commentText)) continue;

    items.push({
      type: 'code_comment',
      filePath,
      name: commentText.substring(0, 80),
      code: lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 5)).join('\n'),
      lineNumber: i + 1,
      baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.code_comment * 0.7,
      metadata: { commentType: 'business_logic' },
    });
  }
}

/**
 * Find @atom references in source files (not test files).
 * These indicate existing coupling between code and intent atoms.
 */
function extractAtomReferences(filePath: string, content: string, items: EvidenceItem[]): void {
  // Skip test files — orphan test detection handles those
  if (/\.(spec|test)\.(ts|js|tsx|jsx)$/.test(filePath)) return;

  const atomRefRegex = /\/\/\s*@atom\s+(IA-\d+(?:\s*,\s*IA-\d+)*)/g;
  let match: RegExpExecArray | null;

  while ((match = atomRefRegex.exec(content)) !== null) {
    const atomIds = match[1].split(',').map((id) => id.trim());
    const lineNum = getLineNumber(content, match.index);

    items.push({
      type: 'code_comment',
      filePath,
      name: `@atom ${atomIds.join(', ')}`,
      code: extractSurroundingCode(content, match.index, 10),
      lineNumber: lineNum,
      baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.code_comment,
      metadata: { commentType: 'atom_reference', tags: atomIds },
    });
  }
}

// ============================================================================
// Orchestrator: Extract all evidence from a file
// ============================================================================

export function extractEvidenceFromFile(
  filePath: string,
  content: string,
  frameworks: string[],
  fileType: 'source' | 'ui' | 'doc' | 'config',
): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  switch (fileType) {
    case 'source':
      items.push(...extractSourceExports(filePath, content));
      items.push(...extractAPIEndpoints(filePath, content, frameworks));
      items.push(...extractCodeComments(filePath, content));
      break;
    case 'ui':
      items.push(...extractUIComponents(filePath, content, frameworks));
      // Also extract exports from UI files (they may export hooks, utils)
      items.push(...extractSourceExports(filePath, content));
      items.push(...extractCodeComments(filePath, content));
      break;
    case 'doc':
      items.push(...extractDocumentationEvidence(filePath, content));
      break;
    case 'config':
      // Config files don't produce evidence items directly
      // (their info is captured in RepoStructure.packageInfo)
      break;
  }

  return items;
}
