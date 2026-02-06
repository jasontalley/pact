import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AtomizeIntentDto {
  @ApiProperty({
    description: 'Raw intent description to be atomized',
    example: 'Users should be able to log in with their email and password securely',
  })
  @IsString()
  @IsNotEmpty()
  intentDescription: string;

  @ApiPropertyOptional({
    description: 'Optional category hint for the atom',
    example: 'security',
    enum: ['functional', 'performance', 'security', 'reliability', 'usability', 'maintainability'],
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    description: 'User ID creating the atom',
    example: 'user-123',
  })
  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class AtomizationAnalysis {
  @ApiProperty({ description: 'Whether the intent is atomic', example: true })
  isAtomic: boolean;

  @ApiProperty({ description: 'Confidence score 0-1', example: 0.85 })
  confidence: number;

  @ApiProperty({ description: 'Reasoning for the atomicity assessment' })
  reasoning: string;

  @ApiProperty({ description: 'Detected category', example: 'security' })
  category: string;

  @ApiPropertyOptional({ description: 'Suggested decomposition if not atomic', type: [String] })
  suggestedDecomposition?: string[];
}

export class QualityValidationResult {
  @ApiProperty({ description: 'Quality score 0-100', example: 85 })
  totalScore: number;

  @ApiProperty({ description: 'Decision based on score', enum: ['approve', 'revise', 'reject'] })
  decision: 'approve' | 'revise' | 'reject';

  @ApiProperty({ description: 'Overall feedback message' })
  overallFeedback: string;

  @ApiProperty({ description: 'Specific improvements to make', type: [String] })
  actionableImprovements: string[];
}

export class AtomizationResult {
  @ApiProperty({ description: 'Whether atomization succeeded', example: true })
  success: boolean;

  @ApiPropertyOptional({
    description: 'Created atom details',
    example: {
      id: 'uuid-here',
      atomId: 'IA-001',
      description: 'User authentication must complete within 2 seconds',
      category: 'performance',
      status: 'draft',
      qualityScore: 85,
    },
  })
  atom?: {
    id: string;
    atomId: string;
    description: string;
    category: string;
    status: string;
    qualityScore?: number;
  };

  @ApiProperty({ description: 'Confidence in the atomization', example: 0.92 })
  confidence: number;

  @ApiProperty({ description: 'Analysis reasoning' })
  analysis: string;

  @ApiPropertyOptional({ description: 'Additional message' })
  message?: string;

  @ApiPropertyOptional({ description: 'Quality validation results', type: QualityValidationResult })
  qualityValidation?: QualityValidationResult;
}
