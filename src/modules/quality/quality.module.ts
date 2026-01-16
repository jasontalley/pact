import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestQualitySnapshot } from './test-quality-snapshot.entity';
import { TestQualityService } from './test-quality.service';
import { QualityController } from './quality.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TestQualitySnapshot])],
  controllers: [QualityController],
  providers: [TestQualityService],
  exports: [TestQualityService],
})
export class QualityModule {}
