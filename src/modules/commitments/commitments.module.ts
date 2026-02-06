import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommitmentArtifact } from './commitment.entity';
import { CommitmentsService } from './commitments.service';
import { CommitmentsController } from './commitments.controller';
import { Atom } from '../atoms/atom.entity';
import { AtomsModule } from '../atoms/atoms.module';
import { InvariantsModule } from '../invariants/invariants.module';
import { CommitmentImmutabilityGuard } from '../../common/guards/commitment-immutability.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommitmentArtifact, Atom]),
    forwardRef(() => AtomsModule),
    InvariantsModule,
  ],
  controllers: [CommitmentsController],
  providers: [CommitmentsService, CommitmentImmutabilityGuard],
  exports: [CommitmentsService, CommitmentImmutabilityGuard],
})
export class CommitmentsModule {}
