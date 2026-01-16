#!/usr/bin/env node

/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-004
 * Type: Seed
 * Purpose: Project atoms from database to /.pact/ for human/agent consumption
 * Exit Criterion: Pact provides built-in projection via API/CLI
 * Target Removal: Phase 1
 * Owner: @jasontalley
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACT_DIR = path.join(process.cwd(), '.pact');

/**
 * Execute SQL query against the database via Docker
 */
function queryDatabase(sql) {
  try {
    const result = execSync(
      `docker exec pact-postgres psql -U pact -d pact_development -t -A -F '|||' -c "${sql.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    return result.trim();
  } catch (error) {
    console.error('Database query failed:', error.message);
    return null;
  }
}

/**
 * Parse atoms from database result
 */
function parseAtomsFromDB(result) {
  if (!result) return [];

  const lines = result.split('\n').filter((line) => line.trim());
  return lines.map((line) => {
    const [
      id,
      atomId,
      description,
      category,
      qualityScore,
      status,
      supersededBy,
      createdAt,
      committedAt,
      createdBy,
      metadata,
      observableOutcomes,
      falsifiabilityCriteria,
      tags,
      canvasPosition,
      parentIntent,
      refinementHistory,
    ] = line.split('|||');

    return {
      id,
      atomId,
      description,
      category,
      qualityScore: Number.parseFloat(qualityScore) || null,
      status,
      supersededBy: supersededBy === '' ? null : supersededBy,
      createdAt,
      committedAt: committedAt === '' ? null : committedAt,
      createdBy: createdBy === '' ? null : createdBy,
      metadata: JSON.parse(metadata || '{}'),
      observableOutcomes: JSON.parse(observableOutcomes || '[]'),
      falsifiabilityCriteria: JSON.parse(falsifiabilityCriteria || '[]'),
      tags: JSON.parse(tags || '[]'),
      canvasPosition: canvasPosition ? JSON.parse(canvasPosition) : null,
      parentIntent: parentIntent === '' ? null : parentIntent,
      refinementHistory: JSON.parse(refinementHistory || '[]'),
    };
  });
}

/**
 * Generate consolidated atoms.json
 */
function generateAtomsJSON(atoms) {
  return {
    $schema: 'https://pact.dev/schemas/atoms.json',
    version: '1.0.0',
    projectedAt: new Date().toISOString(),
    source: 'pact_development',
    count: atoms.length,
    atoms: atoms.map((atom) => ({
      id: atom.id,
      atomId: atom.atomId,
      description: atom.description,
      category: atom.category,
      status: atom.status,
      qualityScore: atom.qualityScore,
      supersededBy: atom.supersededBy,
      createdAt: atom.createdAt,
      committedAt: atom.committedAt,
      createdBy: atom.createdBy,
      tags: atom.tags,
      observableOutcomes: atom.observableOutcomes,
      falsifiabilityCriteria: atom.falsifiabilityCriteria,
      canvasPosition: atom.canvasPosition,
      parentIntent: atom.parentIntent,
      refinementHistory: atom.refinementHistory,
      metadata: atom.metadata,
    })),
  };
}

/**
 * Generate consolidated atoms.md
 */
function generateAtomsMD(atoms) {
  const byCategory = {};
  const byStatus = {};

  for (const atom of atoms) {
    if (!byCategory[atom.category]) byCategory[atom.category] = [];
    byCategory[atom.category].push(atom);

    if (!byStatus[atom.status]) byStatus[atom.status] = [];
    byStatus[atom.status].push(atom);
  }

  let content = `# Intent Atoms

> **Read-only projection from database**
> Source: \`pact_development\` | Projected: ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Total Atoms | ${atoms.length} |
${Object.entries(byStatus)
  .map(([status, list]) => `| ${status} | ${list.length} |`)
  .join('\n')}

## By Category

`;

  for (const [category, categoryAtoms] of Object.entries(byCategory).sort()) {
    content += `### ${category.charAt(0).toUpperCase() + category.slice(1)} (${categoryAtoms.length})\n\n`;

    for (const atom of categoryAtoms.sort((a, b) => a.atomId.localeCompare(b.atomId))) {
      const statusBadge =
        atom.status === 'committed' ? '' : ` \`${atom.status}\``;
      content += `#### ${atom.atomId}${statusBadge}\n\n`;
      content += `${atom.description}\n\n`;

      if (atom.tags.length > 0) {
        content += `**Tags**: ${atom.tags.map((t) => `\`${t}\``).join(' ')}\n\n`;
      }

      if (atom.observableOutcomes.length > 0) {
        content += `**Observable Outcomes**:\n`;
        for (const o of atom.observableOutcomes) {
          content += `- ${o.description}`;
          if (o.measurementCriteria) content += ` *(${o.measurementCriteria})*`;
          content += '\n';
        }
        content += '\n';
      }

      if (atom.falsifiabilityCriteria.length > 0) {
        content += `**Falsifiability**:\n`;
        for (const c of atom.falsifiabilityCriteria) {
          content += `- If ${c.condition} → ${c.expectedBehavior}\n`;
        }
        content += '\n';
      }

      content += '---\n\n';
    }
  }

  return content;
}

/**
 * Project atoms to /.pact/ directory
 */
function projectAtoms(atoms) {
  // Ensure .pact directory exists
  if (!fs.existsSync(PACT_DIR)) {
    fs.mkdirSync(PACT_DIR, { recursive: true });
  }

  // Write atoms.json
  const jsonPath = path.join(PACT_DIR, 'atoms.json');
  fs.writeFileSync(jsonPath, JSON.stringify(generateAtomsJSON(atoms), null, 2));
  console.log(`  Written: .pact/atoms.json`);

  // Write atoms.md
  const mdPath = path.join(PACT_DIR, 'atoms.md');
  fs.writeFileSync(mdPath, generateAtomsMD(atoms));
  console.log(`  Written: .pact/atoms.md`);

  return 2; // files written
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'project': {
    console.log('Fetching atoms from database...');

    const sql = `
      SELECT
        id, "atomId", description, category, "qualityScore", status,
        "supersededBy", "createdAt", "committedAt", "createdBy",
        metadata::text, "observableOutcomes"::text, "falsifiabilityCriteria"::text,
        tags::text, "canvasPosition"::text, "parentIntent", "refinementHistory"::text
      FROM atoms
      ORDER BY "atomId"
    `;

    const result = queryDatabase(sql);
    if (result === null) {
      console.error('Failed to fetch atoms from database');
      process.exit(1);
    }

    const atoms = parseAtomsFromDB(result);

    if (atoms.length === 0) {
      console.log('No atoms found in database');
      console.log('\nTo seed the database first, run:');
      console.log('  npm run atoms:seed');
      process.exit(0);
    }

    console.log(`Found ${atoms.length} atoms\n`);
    console.log('Projecting to .pact/...');

    projectAtoms(atoms);

    console.log(`\nProjected ${atoms.length} atoms to ${PACT_DIR}`);
    break;
  }

  case 'count': {
    const sql = 'SELECT COUNT(*) FROM atoms';
    const result = queryDatabase(sql);
    console.log(`Atoms in database: ${result}`);
    break;
  }

  case 'verify': {
    console.log('Verifying atom projection...\n');

    // Count in database
    const dbCountResult = queryDatabase('SELECT COUNT(*) FROM atoms');
    const dbCount = Number.parseInt(dbCountResult, 10);

    // Check .pact/atoms.json
    const jsonPath = path.join(PACT_DIR, 'atoms.json');
    let jsonCount = 0;

    if (fs.existsSync(jsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        jsonCount = data.count || 0;
      } catch {
        console.error('Failed to parse .pact/atoms.json');
      }
    }

    console.log('Database atoms:', dbCount);
    console.log('.pact/atoms.json count:', jsonCount);
    console.log('');

    if (dbCount === jsonCount) {
      console.log('Verification PASSED: Database and projection are in sync');
    } else {
      console.log('Verification FAILED: Counts do not match');
      console.log('Run "npm run pact:project" to resync');
      process.exit(1);
    }
    break;
  }

  default:
    console.log(`
Pact Projection Script
======================

Usage: node project-atoms.js <command>

Commands:
  project   Project atoms from database to /.pact/ directory
  count     Count atoms in database
  verify    Verify database and projection are in sync

Output:
  .pact/atoms.json   Machine-readable consolidated atom list
  .pact/atoms.md     Human-readable atom documentation

Examples:
  node project-atoms.js project
  node project-atoms.js verify
`);
}
