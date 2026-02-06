import { PartialType } from '@nestjs/swagger';
import { CreateMoleculeDto } from './create-molecule.dto';

/**
 * DTO for updating an existing molecule.
 * All fields are optional - only provided fields will be updated.
 */
export class UpdateMoleculeDto extends PartialType(CreateMoleculeDto) {}
