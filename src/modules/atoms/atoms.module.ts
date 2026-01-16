import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtomsController } from './atoms.controller';
import { AtomsService } from './atoms.service';
import { Atom } from './atom.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Atom])],
  controllers: [AtomsController],
  providers: [AtomsService],
  exports: [AtomsService],
})
export class AtomsModule {}
