import { PartialType } from '@nestjs/swagger';
import { CreateAtomDto } from './create-atom.dto';

/**
 * DTO for updating an existing Intent Atom
 *
 * All fields are optional since this is a partial update.
 * Note: Only draft atoms can be updated. Committed atoms are immutable.
 */
export class UpdateAtomDto extends PartialType(CreateAtomDto) {}
