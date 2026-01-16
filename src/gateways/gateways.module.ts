import { Module, Global } from '@nestjs/common';
import { AtomsGateway } from './atoms.gateway';

/**
 * Module for WebSocket gateways
 *
 * Marked as @Global so the AtomsGateway can be injected
 * into services without explicit imports.
 */
@Global()
@Module({
  providers: [AtomsGateway],
  exports: [AtomsGateway],
})
export class GatewaysModule {}
