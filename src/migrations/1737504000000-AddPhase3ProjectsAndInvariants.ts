import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Phase 3 Projects and Invariants
 *
 * This migration creates:
 * 1. projects table - Top-level organizational unit
 * 2. invariant_configs table - Configurable invariant rules
 *
 * Phase 3 Goal: Implement the Commitment Boundary with configurable
 * invariant checking per project.
 */
export class AddPhase3ProjectsAndInvariants1737504000000 implements MigrationInterface {
  name = 'AddPhase3ProjectsAndInvariants1737504000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================
    // Part 1: Create projects table
    // ========================================

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "description" text,
        "settings" jsonb NOT NULL DEFAULT '{}',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_projects" PRIMARY KEY ("id")
      )
    `);

    // ========================================
    // Part 2: Create invariant_configs table
    // ========================================

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invariant_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "projectId" uuid,
        "invariantId" varchar(20) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "isEnabled" boolean NOT NULL DEFAULT true,
        "isBlocking" boolean NOT NULL DEFAULT true,
        "checkType" varchar(50) NOT NULL DEFAULT 'builtin',
        "checkConfig" jsonb NOT NULL DEFAULT '{}',
        "errorMessage" text NOT NULL,
        "suggestionPrompt" text,
        "isBuiltin" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invariant_configs" PRIMARY KEY ("id")
      )
    `);

    // ========================================
    // Part 3: Create indexes
    // ========================================

    // Index on projects.name for search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_projects_name"
      ON "projects" ("name")
    `);

    // Index on projects.createdAt for ordering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_projects_createdAt"
      ON "projects" ("createdAt" DESC)
    `);

    // Unique composite index on invariant_configs (projectId, invariantId)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invariant_configs_project_invariant"
      ON "invariant_configs" ("projectId", "invariantId")
      WHERE "projectId" IS NOT NULL
    `);

    // Unique index for global defaults (where projectId is null)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invariant_configs_global_invariant"
      ON "invariant_configs" ("invariantId")
      WHERE "projectId" IS NULL
    `);

    // Index on invariant_configs.invariantId for lookup
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_invariant_configs_invariantId"
      ON "invariant_configs" ("invariantId")
    `);

    // Index on invariant_configs.isEnabled for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_invariant_configs_isEnabled"
      ON "invariant_configs" ("isEnabled")
    `);

    // Index on invariant_configs.isBuiltin for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_invariant_configs_isBuiltin"
      ON "invariant_configs" ("isBuiltin")
    `);

    // ========================================
    // Part 4: Add foreign key constraints
    // ========================================

    // Foreign key from invariant_configs.projectId to projects.id
    await queryRunner.query(`
      ALTER TABLE "invariant_configs"
      ADD CONSTRAINT "FK_invariant_configs_projectId"
      FOREIGN KEY ("projectId")
      REFERENCES "projects"("id")
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "invariant_configs"
      DROP CONSTRAINT IF EXISTS "FK_invariant_configs_projectId"
    `);

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invariant_configs_isBuiltin"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invariant_configs_isEnabled"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invariant_configs_invariantId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invariant_configs_global_invariant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invariant_configs_project_invariant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_name"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "invariant_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projects"`);
  }
}
