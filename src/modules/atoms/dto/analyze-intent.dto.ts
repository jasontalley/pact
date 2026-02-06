import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for analyzing raw intent for atomicity
 */
export class AnalyzeIntentDto {
  @ApiProperty({
    description: 'The raw intent description to analyze',
    example: 'User can log in with email and password and view their dashboard',
    minLength: 10,
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(1000)
  intent: string;
}
