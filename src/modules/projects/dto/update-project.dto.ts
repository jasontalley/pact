import { PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';

/**
 * DTO for updating an existing Project
 * All fields are optional
 */
export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
