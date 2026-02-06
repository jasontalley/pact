import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ValidatorFormat } from './validator.entity';

/**
 * Template categories for organizing validator patterns
 */
export type TemplateCategory =
  | 'authentication'
  | 'authorization'
  | 'data-integrity'
  | 'performance'
  | 'state-transition'
  | 'error-handling'
  | 'custom';

/**
 * JSON Schema definition for template parameters
 */
export interface ParameterSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'array';
      description: string;
      default?: unknown;
      enum?: unknown[];
      items?: { type: string };
    }
  >;
  required?: string[];
}

/**
 * ValidatorTemplate entity represents a reusable pattern for creating validators.
 * Templates provide pre-built validators for common validation scenarios,
 * allowing users to quickly instantiate validators with custom parameters.
 *
 * Templates support:
 * - Parameter substitution via {{placeholder}} syntax
 * - JSON Schema validation for parameters
 * - Category organization for discoverability
 * - Built-in vs user-created distinction
 */
@Entity('validator_templates')
export class ValidatorTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Human-readable name for the template
   */
  @Column({ length: 255 })
  name: string;

  /**
   * Detailed description of what this template validates
   */
  @Column('text')
  description: string;

  /**
   * Category for organization and filtering
   */
  @Column({ length: 50 })
  category: TemplateCategory;

  /**
   * The format of the template content
   */
  @Column({ length: 50 })
  format: ValidatorFormat;

  /**
   * Template content with {{placeholder}} substitution markers
   * Example: "Given a user with role {{roleName}}\nWhen they access {{resource}}\nThen access is granted"
   */
  @Column('text')
  templateContent: string;

  /**
   * JSON Schema defining the parameters this template accepts
   * Used for validation and UI form generation
   */
  @Column('jsonb')
  parametersSchema: ParameterSchema;

  /**
   * Example of how to use this template with sample parameters
   */
  @Column('text', { nullable: true })
  exampleUsage: string | null;

  /**
   * Searchable tags for discovery
   */
  @Column('jsonb', { default: [] })
  tags: string[];

  /**
   * Whether this is a system-provided template (immutable) or user-created
   */
  @Column({ default: false })
  isBuiltin: boolean;

  /**
   * Number of validators created from this template
   * Used for popularity ranking
   */
  @Column({ default: 0 })
  usageCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Additional metadata for extensibility
   */
  @Column('jsonb', { default: {} })
  metadata: Record<string, unknown>;
}
