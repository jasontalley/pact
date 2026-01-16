import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for refining an existing atom with feedback
 */
export class RefineAtomDto {
  @ApiProperty({
    description: 'User feedback or new description for the atom',
    example: 'Make it more specific about the authentication method',
    minLength: 5,
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(1000)
  feedback: string;
}
