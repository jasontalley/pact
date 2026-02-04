import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Coverage Ingestion & Quality Enhancement
 *
 * Creates:
 * - coverage_reports table (coverage ingestion)
 * - quality_profiles table (configurable quality dimensions)
 *
 * Extends:
 * - test_records table with testSourceCode and quality fields (ingestion boundary)
 *
 * Note: Uses IF NOT EXISTS to handle cases where entities were auto-synced
 * before migrations ran.
 */
export class AddCoverageAndQuality1738396800000 implements MigrationInterface {
  name = 'AddCoverageAndQuality1738396800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================================================
    // Create coverage_reports table
    // ========================================================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "coverage_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "projectId" uuid,
        "reconciliationRunId" uuid,
        "format" varchar(20) NOT NULL,
        "commitHash" varchar(64),
        "branchName" varchar(255),
        "summary" jsonb NOT NULL,
        "fileDetails" jsonb NOT NULL DEFAULT '[]',
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coverage_reports" PRIMARY KEY ("id")
      )
    `);

    // Add foreign keys only if they don't exist
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_coverage_reports_project'
        ) THEN
          ALTER TABLE "coverage_reports"
            ADD CONSTRAINT "FK_coverage_reports_project"
            FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_coverage_reports_run'
        ) THEN
          ALTER TABLE "coverage_reports"
            ADD CONSTRAINT "FK_coverage_reports_run"
            FOREIGN KEY ("reconciliationRunId") REFERENCES "reconciliation_runs"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_coverage_reports_projectId" ON "coverage_reports" ("projectId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_coverage_reports_createdAt" ON "coverage_reports" ("createdAt")`,
    );

    // ========================================================================
    // Create quality_profiles table
    // ========================================================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quality_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(100) NOT NULL,
        "description" text,
        "projectId" uuid,
        "dimensions" jsonb NOT NULL,
        "isDefault" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quality_profiles" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_quality_profiles_project'
        ) THEN
          ALTER TABLE "quality_profiles"
            ADD CONSTRAINT "FK_quality_profiles_project"
            FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quality_profiles_projectId" ON "quality_profiles" ("projectId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quality_profiles_isDefault" ON "quality_profiles" ("isDefault")`,
    );

    // ========================================================================
    // Extend test_records with testSourceCode and quality fields
    // ========================================================================

    // Ingestion Boundary: Store test source code for analysis without filesystem access
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'test_records' AND column_name = 'testSourceCode'
        ) THEN
          ALTER TABLE "test_records" ADD COLUMN "testSourceCode" text;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'test_records' AND column_name = 'qualityScore'
        ) THEN
          ALTER TABLE "test_records" ADD COLUMN "qualityScore" decimal(5,2);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'test_records' AND column_name = 'qualityDimensions'
        ) THEN
          ALTER TABLE "test_records" ADD COLUMN "qualityDimensions" jsonb;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'test_records' AND column_name = 'qualityGrade'
        ) THEN
          ALTER TABLE "test_records" ADD COLUMN "qualityGrade" varchar(2);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'test_records' AND column_name = 'qualityAnalyzedAt'
        ) THEN
          ALTER TABLE "test_records" ADD COLUMN "qualityAnalyzedAt" TIMESTAMP;
        END IF;
      END $$
    `);

    // Index for quality queries
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_test_records_qualityGrade" ON "test_records" ("qualityGrade")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove test_records extensions
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_test_records_qualityGrade"`);
    await queryRunner.query(`ALTER TABLE "test_records" DROP COLUMN IF EXISTS "qualityAnalyzedAt"`);
    await queryRunner.query(`ALTER TABLE "test_records" DROP COLUMN IF EXISTS "qualityGrade"`);
    await queryRunner.query(`ALTER TABLE "test_records" DROP COLUMN IF EXISTS "qualityDimensions"`);
    await queryRunner.query(`ALTER TABLE "test_records" DROP COLUMN IF EXISTS "qualityScore"`);
    await queryRunner.query(`ALTER TABLE "test_records" DROP COLUMN IF EXISTS "testSourceCode"`);

    // Drop quality_profiles
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quality_profiles_isDefault"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quality_profiles_projectId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quality_profiles"`);

    // Drop coverage_reports
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coverage_reports_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coverage_reports_projectId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coverage_reports"`);
  }
}
