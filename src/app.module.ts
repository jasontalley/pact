import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { databaseConfig } from './config/database/database.config';
import { AtomsModule } from './modules/atoms/atoms.module';
import { AgentsModule } from './modules/agents/agents.module';
import { LLMModule } from './modules/llm/llm.module';
import { QualityModule } from './modules/quality/quality.module';
import { GatewaysModule } from './gateways/gateways.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
    }),
    TypeOrmModule.forRoot(databaseConfig()),
    GatewaysModule,
    LLMModule,
    AtomsModule,
    AgentsModule,
    QualityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
