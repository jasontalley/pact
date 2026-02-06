import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Molecule } from './molecule.entity';
import { MoleculeAtom } from './molecule-atom.entity';
import { MoleculesController, ChangeSetsController } from './molecules.controller';
import { MoleculesService } from './molecules.service';
import { MoleculesRepository } from './molecules.repository';
import { AtomsModule } from '../atoms/atoms.module';
import { ValidatorsModule } from '../validators/validators.module';
import { Atom } from '../atoms/atom.entity';
import { Validator } from '../validators/validator.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Molecule, MoleculeAtom, Atom, Validator]),
    forwardRef(() => AtomsModule),
    forwardRef(() => ValidatorsModule),
  ],
  controllers: [MoleculesController, ChangeSetsController],
  providers: [MoleculesService, MoleculesRepository],
  exports: [MoleculesService, MoleculesRepository],
})
export class MoleculesModule {}
