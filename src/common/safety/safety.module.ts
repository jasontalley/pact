/**
 * Safety Module
 *
 * Provides agent safety services to the application.
 * Import this module to enable safety checks in your feature modules.
 */

import { Module, Global } from '@nestjs/common';
import { AgentSafetyService } from './agent-safety.service';
import { InputSanitizerService } from './input-sanitizer.service';
import { OutputValidatorService } from './output-validator.service';
import { ToolPermissionsService } from './tool-permissions.service';
import { AgentSafetyGuard, AgentSafetyInterceptor } from './agent-safety.guard';

@Global()
@Module({
  providers: [
    // Core services
    InputSanitizerService,
    OutputValidatorService,
    ToolPermissionsService,
    AgentSafetyService,

    // Guard and interceptor
    AgentSafetyGuard,
    AgentSafetyInterceptor,
  ],
  exports: [
    // Export all services for use in other modules
    InputSanitizerService,
    OutputValidatorService,
    ToolPermissionsService,
    AgentSafetyService,
    AgentSafetyGuard,
    AgentSafetyInterceptor,
  ],
})
export class SafetyModule {}
