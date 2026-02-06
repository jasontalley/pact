import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvariantConfig } from './invariant-config.entity';
import { InvariantsService } from './invariants.service';
import { InvariantsController } from './invariants.controller';
import { InvariantCheckingService } from './invariant-checking.service';
import { CheckerRegistry } from './checkers/checker-registry';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [TypeOrmModule.forFeature([InvariantConfig]), forwardRef(() => ProjectsModule)],
  controllers: [InvariantsController],
  providers: [InvariantsService, CheckerRegistry, InvariantCheckingService],
  exports: [InvariantsService, InvariantCheckingService, CheckerRegistry],
})
export class InvariantsModule {}
