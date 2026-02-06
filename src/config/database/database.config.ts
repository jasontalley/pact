import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (): TypeOrmModuleOptions => {
  const isTest = process.env.NODE_ENV === 'test';

  return {
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number.parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'pact',
    password: process.env.DATABASE_PASSWORD || 'pact_dev_password',
    database: process.env.DATABASE_NAME || 'pact_development',
    entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
    synchronize: process.env.DATABASE_SYNCHRONIZE === 'true' || process.env.NODE_ENV === 'development',
    logging: process.env.NODE_ENV === 'development',
    // For tests: configure pg driver to prevent open handles
    // The pg driver keeps connections alive which prevents Jest from exiting
    ...(isTest && {
      extra: {
        max: 1, // Single connection
        idleTimeoutMillis: 0, // Close idle connections immediately
        allowExitOnIdle: true, // Allow process to exit when pool is idle
      },
      poolSize: 1,
      keepConnectionAlive: false, // Don't keep connection alive between requests
    }),
  };
};
