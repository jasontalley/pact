import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AtomizeIntentDto {
  @IsString()
  @IsNotEmpty()
  intentDescription: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export interface AtomizationAnalysis {
  isAtomic: boolean;
  confidence: number;
  reasoning: string;
  category: string;
  suggestedDecomposition?: string[];
}

export interface QualityValidationResult {
  totalScore: number;
  decision: 'approve' | 'revise' | 'reject';
  overallFeedback: string;
  actionableImprovements: string[];
}

export interface AtomizationResult {
  success: boolean;
  atom?: {
    id: string;
    atomId: string;
    description: string;
    category: string;
    status: string;
    qualityScore?: number;
  };
  confidence: number;
  analysis: string;
  message?: string;
  qualityValidation?: QualityValidationResult;
}
