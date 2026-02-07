import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './project.entity';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { RepositoryAdminController } from './repository-admin.controller';
import { RepositoryConfigService } from './repository-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project])],
  controllers: [ProjectsController, RepositoryAdminController],
  providers: [ProjectsService, RepositoryConfigService],
  exports: [ProjectsService, RepositoryConfigService],
})
export class ProjectsModule {}
