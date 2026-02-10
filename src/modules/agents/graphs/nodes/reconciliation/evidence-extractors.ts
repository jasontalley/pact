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

    items.push({
      type: 'source_export',
      filePath,
      name,
      code: extractSurroundingCode(content, match.index, 20),
      lineNumber: getLineNumber(content, match.index),
      baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.source_export,
      metadata: {
        exportType: exportType as 'function' | 'class' | 'const' | 'interface',
        isDefault: !!isDefault,
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
  // Match exported function components (function Name() or const Name = ...)
  const componentRegex = /export\s+(default\s+)?function\s+([A-Z]\w+)/g;
  const arrowComponentRegex = /export\s+(default\s+)?const\s+([A-Z]\w+)\s*[=:]/g;

  for (const regex of [componentRegex, arrowComponentRegex]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[2];
      // Verify it's likely a component (returns JSX)
      const code = extractSurroundingCode(content, match.index, 30);
      if (!code.includes('<') && !code.includes('jsx') && !code.includes('React')) continue;

      const hasForm = /(<form|<input|<textarea|<select|useForm)/i.test(content);
      const hasNavigation = /(<Link|useRouter|useNavigate|usePathname)/i.test(content);

      items.push({
        type: 'ui_component',
        filePath,
        name,
        code,
        lineNumber: getLineNumber(content, match.index),
        baseConfidence: EVIDENCE_CONFIDENCE_WEIGHTS.ui_component,
        metadata: {
          framework: 'react',
          hasForm,
          hasNavigation,
        },
      });
    }
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
      break;
    case 'ui':
      items.push(...extractUIComponents(filePath, content, frameworks));
      // Also extract exports from UI files (they may export hooks, utils)
      items.push(...extractSourceExports(filePath, content));
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
