import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import { AppModule } from './app.module';

async function ensureDatabaseExists() {
  if (process.env.DATABASE_URL) {
    // En bases de datos cloud (Neon.tech, Supabase, Render PostgreSQL) la base ya viene creada
    return;
  }
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'mrp_admin',
    password: process.env.DB_PASSWORD || 'mrp_secret_2026',
    database: 'postgres',
  });
  try {
    await client.connect();
    const dbName = process.env.DB_NAME || 'montana_redonda_db';
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Base de datos PostgreSQL "${dbName}" creada exitosamente.`);
    }
  } catch (err) {
    console.warn('Aviso al verificar base de datos inicial:', (err as Error).message);
  } finally {
    await client.end().catch(() => {});
  }
}

async function bootstrap() {
  await ensureDatabaseExists();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, X-Idempotency-Key',
  });

  const port = Number(process.env.PORT || process.env.BACKEND_PORT || 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Backend Montaña Redonda Paradise activo en puerto ${port} (/api)`);
}

bootstrap();

