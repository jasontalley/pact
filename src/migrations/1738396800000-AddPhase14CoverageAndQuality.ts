import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Phase 14 - Coverage Ingestion & Quality Enhancement
 *
 * Creates:
 * - coverage_reports table (14A: coverage ingestion)
 * - quality_profiles table (14B: configurable quality dimensions)
 *
 * Extends:
 * - test_records table with testSourceCode and quality fields (14B: ingestion boundary)
 */
export class AddPhase14CoverageAndQuality1738396800000 implements MigrationInterface {
  name = 'AddPhase14CoverageAndQuality1738396800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================================================
    // 14A: Create coverage_reports table
    // ========================================================================
    await queryRunner.query(`
      CREATE TABLE "coverage_reports" (
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
        CONSTRAINT "PK_coverage_reports" PRIMARY KEY ("id"),
        CONSTRAINT "FK_coverage_reports_project" FOREIGN KEY ("projectId")
          REFERENCES "projects"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_coverage_reports_run" FOREIGN KEY ("reconciliationRunId")
          REFERENCES "reconciliation_runs"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_coverage_reports_projectId" ON "coverage_reports" ("projectId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_coverage_reports_createdAt" ON "coverage_reports" ("createdAt")`,
    );

    // ========================================================================
    // 14B: Create quality_profiles table
    // ========================================================================
    await queryRunner.query(`
      CREATE TABLE "quality_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(100) NOT NULL,
        "description" text,
        "projectId" uuid,
        "dimensions" jsonb NOT NULL,
        "isDefault" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quality_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_quality_profiles_project" FOREIGN KEY ("projectId")
          REFERENCES "projects"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_quality_profiles_projectId" ON "quality_profiles" ("projectId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_quality_profiles_isDefault" ON "quality_profiles" ("isDefault")`,
    );

    // ========================================================================
    // 14B: Extend test_records with testSourceCode and quality fields
    // ========================================================================

    // Ingestion Boundary: Store test source code for analysis without filesystem access
    await queryRunner.query(`
      ALTER TABLE "test_records" ADD COLUMN "testSourceCode" text
    `);

    // Quality analysis results
    await queryRunner.query(`
      ALTER TABLE "test_records" ADD COLUMN "qualityScore" decimal(5,2)
    `);

    await queryRunner.query(`
      ALTER TABLE "test_records" ADD COLUMN "qualityDimensions" jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "test_records" ADD COLUMN "qualityGrade" varchar(2)
    `);

    await queryRunner.query(`
      ALTER TABLE "test_records" ADD COLUMN "qualityAnalyzedAt" TIMESTAMP
    `);

    // Index for quality queries
    await queryRunner.query(
      `CREATE INDEX "IDX_test_records_qualityGrade" ON "test_records" ("qualityGrade")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove test_records extensions
    await queryRunner.query(`DROP INDEX "IDX_test_records_qualityGrade"`);
    await queryRunner.query(`ALTER TABLE "test_records" DROP COLUMN "qualityAnalyzedAt"`);
    await queryRunner.query(`ALTER TABLE "test_records" DROP COLUMN "qualityGrade"`);
    await queryRunner.query(`ALTER TABLE "test_records" DROP COLUMN "qualityDimensions"`);
    await queryRunner.query(`ALTER TABLE "test_records" DROP COLUMN "qualityScore"`);
    await queryRunner.query(`ALTER TABLE "test_records" DROP COLUMN "testSourceCode"`);

    // Drop quality_profiles
    await queryRunner.query(`DROP INDEX "IDX_quality_profiles_isDefault"`);
    await queryRunner.query(`DROP INDEX "IDX_quality_profiles_projectId"`);
    await queryRunner.query(`DROP TABLE "quality_profiles"`);

    // Drop coverage_reports
    await queryRunner.query(`DROP INDEX "IDX_coverage_reports_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_coverage_reports_projectId"`);
    await queryRunner.query(`DROP TABLE "coverage_reports"`);
  }
}
