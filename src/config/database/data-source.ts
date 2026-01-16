import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'pact',
  password: process.env.DATABASE_PASSWORD || 'pact_dev_password',
  database: process.env.DATABASE_NAME || 'pact_development',
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
  synchronize: false, // Never synchronize in production/migrations
  logging: process.env.NODE_ENV === 'development',
};

// DataSource instance for CLI commands
const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
