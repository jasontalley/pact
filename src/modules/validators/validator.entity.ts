import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Atom } from '../atoms/atom.entity';

/**
 * Validator types define how the validator is executed
 */
export type ValidatorType = 'gherkin' | 'executable' | 'declarative';

/**
 * Validator formats define the syntax of the validator content
 */
export type ValidatorFormat = 'gherkin' | 'natural_language' | 'typescript' | 'json';

/**
 * Cached translations to other formats
 */
export interface TranslatedContent {
  gherkin?: string;
  natural_language?: string;
  typescript?: string;
  json?: string;
  translatedAt?: Record<string, Date>;
  confidenceScores?: Record<string, number>;
}

/**
 * Validator entity represents a testable validation rule associated with an Intent Atom.
 * Validators give atoms enforceable meaning by defining specific checks that must pass.
 *
 * Per UX spec: "Tests are the coupling mechanism" - validators bridge atoms and tests.
 */
@Entity('validators')
export class Validator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  atomId: string;

  @ManyToOne(() => Atom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'atomId' })
  atom: Atom;

  /**
   * Human-readable name for the validator
   */
  @Column({ length: 255 })
  name: string;

  /**
   * Detailed explanation of what this validator checks
   */
  @Column('text', { nullable: true })
  description: string | null;

  /**
   * Type of validator execution (gherkin, executable, declarative)
   */
  @Column({ length: 50 })
  validatorType: ValidatorType;

  /**
   * The actual validator content/rules
   */
  @Column('text')
  content: string;

  /**
   * Current format of the content (gherkin, natural_language, typescript, json)
   */
  @Column({ length: 50 })
  format: ValidatorFormat;

  /**
   * The original format the user wrote the validator in
   * Preserved for translation accuracy tracking
   */
  @Column({ length: 50 })
  originalFormat: ValidatorFormat;

  /**
   * Cached translations to other formats
   * Avoids repeated LLM calls for format conversion
   */
  @Column('jsonb', { default: {} })
  translatedContent: TranslatedContent;

  /**
   * Reference to template if this validator was created from one
   */
  @Column({ type: 'uuid', nullable: true })
  templateId: string | null;

  /**
   * Parameters used when instantiating from a template
   */
  @Column('jsonb', { default: {} })
  parameters: Record<string, unknown>;

  /**
   * Whether this validator is currently active
   * Allows soft-disable without deletion
   */
  @Column({ default: true })
  isActive: boolean;

  /**
   * Number of times this validator has been executed
   */
  @Column({ default: 0 })
  executionCount: number;

  /**
   * Timestamp of last execution (null if never executed)
   */
  @Column({ type: 'timestamp', nullable: true })
  lastExecutedAt: Date | null;

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
