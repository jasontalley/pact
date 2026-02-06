import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Phase 2 Validator Enhancements
 *
 * This migration:
 * 1. Enhances the validators table with new fields for Phase 2
 * 2. Creates the validator_templates table for reusable validation patterns
 *
 * Phase 2 Goal: Users can define validators that give Intent Atoms
 * testable, enforceable meaning.
 */
export class AddPhase2ValidatorFields1737475200000 implements MigrationInterface {
  name = 'AddPhase2ValidatorFields1737475200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================
    // Part 1: Enhance validators table
    // ========================================

    // Add name column (human-readable validator name)
    await queryRunner.query(`
      ALTER TABLE "validators"
      ADD COLUMN IF NOT EXISTS "name" varchar(255)
    `);

    // Update existing validators to have a default name
    await queryRunner.query(`
      UPDATE "validators"
      SET "name" = 'Validator ' || SUBSTRING("id"::text, 1, 8)
      WHERE "name" IS NULL
    `);

    // Make name non-nullable after setting defaults
    await queryRunner.query(`
      ALTER TABLE "validators"
      ALTER COLUMN "name" SET NOT NULL
    `);

    // Add description column
    await queryRunner.query(`
      ALTER TABLE "validators"
      ADD COLUMN IF NOT EXISTS "description" text
    `);

    // Add originalFormat column
    await queryRunner.query(`
      ALTER TABLE "validators"
      ADD COLUMN IF NOT EXISTS "originalFormat" varchar(50)
    `);

    // Set originalFormat to match format for existing validators
    await queryRunner.query(`
      UPDATE "validators"
      SET "originalFormat" = "format"
      WHERE "originalFormat" IS NULL
    `);

    // Make originalFormat non-nullable
    await queryRunner.query(`
      ALTER TABLE "validators"
      ALTER COLUMN "originalFormat" SET NOT NULL
    `);

    // Add translatedContent column (cached translations)
    await queryRunner.query(`
      ALTER TABLE "validators"
      ADD COLUMN IF NOT EXISTS "translatedContent" jsonb NOT NULL DEFAULT '{}'
    `);

    // Add templateId column (reference to template if derived from one)
    await queryRunner.query(`
      ALTER TABLE "validators"
      ADD COLUMN IF NOT EXISTS "templateId" uuid
    `);

    // Add parameters column (template parameters)
    await queryRunner.query(`
      ALTER TABLE "validators"
      ADD COLUMN IF NOT EXISTS "parameters" jsonb NOT NULL DEFAULT '{}'
    `);

    // Add isActive column (soft disable)
    await queryRunner.query(`
      ALTER TABLE "validators"
      ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true
    `);

    // Add executionCount column
    await queryRunner.query(`
      ALTER TABLE "validators"
      ADD COLUMN IF NOT EXISTS "executionCount" integer NOT NULL DEFAULT 0
    `);

    // Add lastExecutedAt column
    await queryRunner.query(`
      ALTER TABLE "validators"
      ADD COLUMN IF NOT EXISTS "lastExecutedAt" timestamp
    `);

    // Add updatedAt column
    await queryRunner.query(`
      ALTER TABLE "validators"
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now()
    `);

    // Widen format column to accommodate new formats
    await queryRunner.query(`
      ALTER TABLE "validators"
      ALTER COLUMN "format" TYPE varchar(50)
    `);

    // ========================================
    // Part 2: Create validator_templates table
    // ========================================

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "validator_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "category" varchar(50) NOT NULL,
        "format" varchar(50) NOT NULL,
        "templateContent" text NOT NULL,
        "parametersSchema" jsonb NOT NULL,
        "exampleUsage" text,
        "tags" jsonb NOT NULL DEFAULT '[]',
        "isBuiltin" boolean NOT NULL DEFAULT false,
        "usageCount" integer NOT NULL DEFAULT 0,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_validator_templates" PRIMARY KEY ("id")
      )
    `);

    // ========================================
    // Part 3: Create indexes
    // ========================================

    // Index on validators.atomId for efficient lookup
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_validators_atomId"
      ON "validators" ("atomId")
    `);

    // Index on validators.templateId for template usage tracking
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_validators_templateId"
      ON "validators" ("templateId")
      WHERE "templateId" IS NOT NULL
    `);

    // Index on validators.isActive for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_validators_isActive"
      ON "validators" ("isActive")
    `);

    // Index on validators.validatorType for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_validators_validatorType"
      ON "validators" ("validatorType")
    `);

    // Index on validators.format for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_validators_format"
      ON "validators" ("format")
    `);

    // GIN index on validator_templates.tags for tag filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_validator_templates_tags"
      ON "validator_templates" USING GIN ("tags")
    `);

    // Index on validator_templates.category for category browsing
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_validator_templates_category"
      ON "validator_templates" ("category")
    `);

    // Index on validator_templates.isBuiltin for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_validator_templates_isBuiltin"
      ON "validator_templates" ("isBuiltin")
    `);

    // Index on validator_templates.usageCount for popularity sorting
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_validator_templates_usageCount"
      ON "validator_templates" ("usageCount" DESC)
    `);

    // ========================================
    // Part 4: Add foreign key constraint
    // ========================================

    // Add foreign key from validators.templateId to validator_templates.id
    await queryRunner.query(`
      ALTER TABLE "validators"
      ADD CONSTRAINT "FK_validators_templateId"
      FOREIGN KEY ("templateId")
      REFERENCES "validator_templates"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "validators"
      DROP CONSTRAINT IF EXISTS "FK_validators_templateId"
    `);

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_validator_templates_usageCount"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_validator_templates_isBuiltin"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_validator_templates_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_validator_templates_tags"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_validators_format"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_validators_validatorType"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_validators_isActive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_validators_templateId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_validators_atomId"`);

    // Drop validator_templates table
    await queryRunner.query(`DROP TABLE IF EXISTS "validator_templates"`);

    // Remove columns from validators table
    await queryRunner.query(`ALTER TABLE "validators" DROP COLUMN IF EXISTS "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "validators" DROP COLUMN IF EXISTS "lastExecutedAt"`);
    await queryRunner.query(`ALTER TABLE "validators" DROP COLUMN IF EXISTS "executionCount"`);
    await queryRunner.query(`ALTER TABLE "validators" DROP COLUMN IF EXISTS "isActive"`);
    await queryRunner.query(`ALTER TABLE "validators" DROP COLUMN IF EXISTS "parameters"`);
    await queryRunner.query(`ALTER TABLE "validators" DROP COLUMN IF EXISTS "templateId"`);
    await queryRunner.query(`ALTER TABLE "validators" DROP COLUMN IF EXISTS "translatedContent"`);
    await queryRunner.query(`ALTER TABLE "validators" DROP COLUMN IF EXISTS "originalFormat"`);
    await queryRunner.query(`ALTER TABLE "validators" DROP COLUMN IF EXISTS "description"`);
    await queryRunner.query(`ALTER TABLE "validators" DROP COLUMN IF EXISTS "name"`);

    // Revert format column width
    await queryRunner.query(`
      ALTER TABLE "validators"
      ALTER COLUMN "format" TYPE varchar(20)
    `);
  }
}
