import { join } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  app.enableCors({
    origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('Pact API')
    .setDescription(
      `## Intent-Driven Development System

Pact captures product intent and translates it into testable behavioral primitives (Intent Atoms).

### Key Concepts

- **Intent Atoms**: Irreducible behavioral requirements that are observable and falsifiable
- **Atomization**: AI-powered analysis to determine if an intent is atomic
- **Quality Gates**: Automated validation ensuring atoms meet quality thresholds
- **Refinement**: Iterative improvement of atom descriptions

### Authentication

Currently, the API does not require authentication. This will change in Phase 2.

### Error Handling

All endpoints return standard HTTP status codes:
- \`200\` - Success
- \`201\` - Created
- \`400\` - Bad Request (validation errors)
- \`403\` - Forbidden (e.g., modifying committed atoms)
- \`404\` - Not Found
- \`500\` - Internal Server Error
- \`503\` - Service Unavailable (LLM not configured)`,
    )
    .setVersion('1.0.0')
    .setContact('Pact Team', 'https://github.com/jasontalley/pact', 'support@pact.dev')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addTag('atoms', 'Intent Atom CRUD and refinement operations')
    .addTag('agents', 'AI-powered atomization and analysis services')
    .addTag('quality', 'Test quality analysis and reporting')
    .addTag('molecules', 'Molecule management (coming in Phase 2)')
    .addTag('validators', 'Validation services')
    .addTag('evidence', 'Evidence artifact management')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    customSiteTitle: 'Pact API Documentation',
    customfavIcon: 'https://swagger.io/favicon-32x32.png',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/api`);

  // Start MCP server (SSE) when app runs so clients can connect via URL with no binary path.
  const mcpPort = process.env.MCP_PORT ?? '3002';
  if (mcpPort !== '0') {
    const mcpPath = join(process.cwd(), 'dist', 'mcp', 'pact-mcp-server.js');
    if (existsSync(mcpPath)) {
      const apiUrl = process.env.PACT_API_URL || `http://localhost:${port}`;
      const child = spawn(process.execPath, [mcpPath], {
        env: { ...process.env, MCP_PORT: mcpPort, PACT_API_URL: apiUrl },
        stdio: 'ignore',
        detached: process.platform !== 'win32',
      });
      child.unref?.();
      console.log(`MCP server (SSE) started; connect at http://localhost:${mcpPort}/sse`);
    }
  }
}

bootstrap();
