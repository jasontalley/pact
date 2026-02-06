import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Validator } from './validator.entity';
import { ValidatorTemplate } from './validator-template.entity';
import { ValidatorsController } from './validators.controller';
import { TemplatesController } from './templates.controller';
import { ValidatorsService } from './validators.service';
import { TemplatesService } from './templates.service';
import { ValidatorTranslationService } from './validator-translation.service';
import { TemplateSeedService } from './template-seed.service';
import { ValidatorsRepository } from './validators.repository';
import { TemplatesRepository } from './templates.repository';
import { AtomsModule } from '../atoms/atoms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Validator, ValidatorTemplate]),
    forwardRef(() => AtomsModule),
  ],
  controllers: [ValidatorsController, TemplatesController],
  providers: [
    ValidatorsService,
    TemplatesService,
    ValidatorTranslationService,
    TemplateSeedService,
    ValidatorsRepository,
    TemplatesRepository,
  ],
  exports: [
    ValidatorsService,
    TemplatesService,
    ValidatorTranslationService,
    TemplateSeedService,
    ValidatorsRepository,
    TemplatesRepository,
  ],
})
export class ValidatorsModule {}
