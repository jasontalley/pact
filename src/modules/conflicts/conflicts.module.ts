import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConflictRecord } from './conflict-record.entity';
import { ConflictsService } from './conflicts.service';
import { ConflictsController } from './conflicts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ConflictRecord])],
  controllers: [ConflictsController],
  providers: [ConflictsService],
  exports: [ConflictsService],
})
export class ConflictsModule {}
