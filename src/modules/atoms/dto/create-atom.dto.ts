import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class CreateAtomDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  qualityScore?: number;

  @IsString()
  @IsOptional()
  createdBy?: string;
}
