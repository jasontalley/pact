import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtomsController } from './atoms.controller';
import { AtomsService } from './atoms.service';
import { AtomsRepository } from './atoms.repository';
import { Atom } from './atom.entity';
import { AgentsModule } from '../agents/agents.module';
import { ValidatorsModule } from '../validators/validators.module';
import { MoleculesModule } from '../molecules/molecules.module';
import { CommittedAtomGuard } from '../../common/guards/committed-atom.guard';
import { SemanticDiffService } from './semantic-diff.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Atom]),
    forwardRef(() => AgentsModule),
    forwardRef(() => ValidatorsModule),
    forwardRef(() => MoleculesModule),
  ],
  controllers: [AtomsController],
  providers: [AtomsService, AtomsRepository, CommittedAtomGuard, SemanticDiffService],
  exports: [AtomsService, AtomsRepository, CommittedAtomGuard, SemanticDiffService],
})
export class AtomsModule {}
