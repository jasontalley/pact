/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-002
 * Type: Tooling
 * Purpose: Register new bootstrap scaffolds in ledger
 * Exit Criterion: No new scaffolds being created (Phase 2)
 * Target Removal: Phase 2
 * Owner: @jasontalley
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const SCAFFOLD_TYPES = ['seed', 'migration', 'tooling', 'runtime'];
const TARGET_PHASES = ['Phase 0', 'Phase 1', 'Phase 2'];

async function registerScaffold(scaffoldData) {
  const {
    scaffoldId,
    scaffoldType,
    purpose,
    exitCriterion,
    targetRemoval,
    owner,
    removalTicket,
  } = scaffoldData;

  // Validate input
  if (!SCAFFOLD_TYPES.includes(scaffoldType)) {
    throw new Error(`Invalid scaffold type: ${scaffoldType}`);
  }

  if (!TARGET_PHASES.includes(targetRemoval)) {
    throw new Error(`Invalid target phase: ${targetRemoval}`);
  }

  // Connect to database
  const client = new Client({
    host: process.env.DATABASE_HOST || 'postgres',
    port: process.env.DATABASE_PORT || 5432,
    user: process.env.DATABASE_USER || 'pact',
    password: process.env.DATABASE_PASSWORD || 'pact_dev_password',
    database: process.env.DATABASE_NAME || 'pact_development',
  });

  await client.connect();

  try {
    // Check if scaffold already exists
    const existing = await client.query(
      'SELECT "scaffoldId" FROM bootstrap_scaffolds WHERE "scaffoldId" = $1',
      [scaffoldId],
    );

    if (existing.rows.length > 0) {
      console.log(`⚠️  Scaffold ${scaffoldId} already exists. Skipping registration.`);
      return;
    }

    // Insert scaffold
    await client.query(
      `INSERT INTO bootstrap_scaffolds
       ("scaffoldId", "scaffoldType", purpose, "exitCriterion", "targetRemoval", owner, "removalTicket", status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
      [scaffoldId, scaffoldType, purpose, exitCriterion, targetRemoval, owner, removalTicket],
    );

    console.log(`✅ Registered scaffold: ${scaffoldId}`);

    // Update ledger markdown
    await updateLedgerMarkdown(client);
  } finally {
    await client.end();
  }
}

async function updateLedgerMarkdown(client) {
  // Get active scaffolds
  const activeResult = await client.query(
    'SELECT * FROM bootstrap_scaffolds WHERE status = $1 ORDER BY "scaffoldId"',
    ['active'],
  );

  // Get demolished scaffolds
  const demolishedResult = await client.query(
    'SELECT * FROM bootstrap_scaffolds WHERE status = $1 ORDER BY "demolishedAt" DESC',
    ['demolished'],
  );

  // Read current README
  const readmePath = path.join(__dirname, '../README.md');
  let readmeContent = fs.readFileSync(readmePath, 'utf-8');

  // Replace active scaffolds table
  const activeTable = generateActiveScaffoldsTable(activeResult.rows);
  readmeContent = readmeContent.replace(
    /## Active Scaffolds\n\n[\s\S]*?\n\n---/,
    `## Active Scaffolds\n\n${activeTable}\n\n---`,
  );

  // Replace demolished scaffolds table
  const demolishedTable = generateDemolishedScaffoldsTable(demolishedResult.rows);
  readmeContent = readmeContent.replace(
    /## Demolished Scaffolds\n\n[\s\S]*?\n\n---/,
    `## Demolished Scaffolds\n\n${demolishedTable}\n\n---`,
  );

  fs.writeFileSync(readmePath, readmeContent);
  console.log('✅ Updated bootstrap/README.md');
}

function generateActiveScaffoldsTable(rows) {
  if (rows.length === 0) {
    return (
      '| ID | Type | Purpose | Exit Criterion | Owner | Removal Ticket | Target Phase |\n' +
      '|----|------|---------|----------------|-------|----------------|--------------|\n' +
      '| *No scaffolds yet* | - | - | - | - | - | - |'
    );
  }

  let table =
    '| ID | Type | Purpose | Exit Criterion | Owner | Removal Ticket | Target Phase |\n';
  table += '|----|------|---------|----------------|-------|----------------|--------------|\n';

  rows.forEach((row) => {
    table += `| ${row.scaffoldId} | ${row.scaffoldType} | ${row.purpose} | ${row.exitCriterion} | ${row.owner || 'TBD'} | ${row.removalTicket || 'TBD'} | ${row.targetRemoval} |\n`;
  });

  return table;
}

function generateDemolishedScaffoldsTable(rows) {
  if (rows.length === 0) {
    return (
      '| ID | Type | Purpose | Demolition Date | Demolished By | Notes |\n' +
      '|----|------|---------|-----------------|---------------|-------|\n' +
      '| *No demolished scaffolds yet* | - | - | - | - | - |'
    );
  }

  let table =
    '| ID | Type | Purpose | Demolition Date | Demolished By | Notes |\n';
  table += '|----|------|---------|-----------------|---------------|-------|\n';

  rows.forEach((row) => {
    const date = new Date(row.demolishedAt).toISOString().split('T')[0];
    table += `| ${row.scaffoldId} | ${row.scaffoldType} | ${row.purpose} | ${date} | ${row.demolishedBy || 'Unknown'} | ${row.notes || '-'} |\n`;
  });

  return table;
}

// CLI interface
if (require.main === module) {
  const action = process.argv[2];

  if (action === 'register') {
    const scaffoldData = {
      scaffoldId: process.argv[3],
      scaffoldType: process.argv[4],
      purpose: process.argv[5],
      exitCriterion: process.argv[6],
      targetRemoval: process.argv[7],
      owner: process.argv[8],
      removalTicket: process.argv[9] || 'TBD',
    };

    if (!scaffoldData.scaffoldId || !scaffoldData.scaffoldType) {
      console.error(
        'Usage: node scaffold-register.js register <id> <type> <purpose> <exit-criterion> <target-removal> <owner> [ticket]',
      );
      console.error(
        '\nExample: node scaffold-register.js register BS-003 tooling "CLI tool" "Pact UI exists" "Phase 1" "@user" "ISSUE-123"',
      );
      process.exit(1);
    }

    registerScaffold(scaffoldData).catch((error) => {
      console.error(`Error registering scaffold: ${error.message}`);
      process.exit(1);
    });
  } else if (action === 'update-ledger') {
    // Update ledger from database
    const client = new Client({
      host: process.env.DATABASE_HOST || 'postgres',
      port: process.env.DATABASE_PORT || 5432,
      user: process.env.DATABASE_USER || 'pact',
      password: process.env.DATABASE_PASSWORD || 'pact_dev_password',
      database: process.env.DATABASE_NAME || 'pact_development',
    });

    client
      .connect()
      .then(() => updateLedgerMarkdown(client))
      .then(() => client.end())
      .catch((error) => {
        console.error(`Error updating ledger: ${error.message}`);
        process.exit(1);
      });
  } else {
    console.error('Usage:');
    console.error(
      '  node scaffold-register.js register <id> <type> <purpose> <exit-criterion> <target-removal> <owner> [ticket]',
    );
    console.error('  node scaffold-register.js update-ledger');
    process.exit(1);
  }
}

module.exports = { registerScaffold, updateLedgerMarkdown };
