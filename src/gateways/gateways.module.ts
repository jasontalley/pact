import { Module, Global } from '@nestjs/common';
import { AtomsGateway } from './atoms.gateway';
import { ValidatorsGateway } from './validators.gateway';
import { CommitmentsGateway } from './commitments.gateway';
import { ReconciliationGateway } from './reconciliation.gateway';

/**
 * Module for WebSocket gateways
 *
 * Marked as @Global so the gateways can be injected
 * into services without explicit imports.
 */
@Global()
@Module({
  providers: [AtomsGateway, ValidatorsGateway, CommitmentsGateway, ReconciliationGateway],
  exports: [AtomsGateway, ValidatorsGateway, CommitmentsGateway, ReconciliationGateway],
})
export class GatewaysModule {}
