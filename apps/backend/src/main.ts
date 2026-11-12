import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import { AppModule } from './app.module';

function resolveCloudDatabaseUrl(): string | undefined {
  const raw = (process.env.DATABASE_URL || process.env.RENDER_DATABASE_URL)?.trim();
  if (!raw) return undefined;
  const match = raw.match(/postgres(?:ql)?:\/\/[^\s'"]+/i);
  return match ? match[0] : raw.replace(/^['"]|['"]$/g, '');
}

async function ensureDatabaseExists() {
  const cloudUrl = resolveCloudDatabaseUrl();
  if (cloudUrl) {
    process.env.EFFECTIVE_DATABASE_URL = cloudUrl;
    // Detectar automáticamente si el servidor PostgreSQL requiere SSL (Neon/Supabase/Render)
    const testSslClient = new Client({
      connectionString: cloudUrl,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await testSslClient.connect();
      process.env.DB_USE_SSL = 'true';
      console.log('✅ Conexión PostgreSQL Cloud (SSL) verificada exitosamente.');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('does not support SSL')) {
        process.env.DB_USE_SSL = 'false';
        console.log('ℹ️ Conexión PostgreSQL Cloud sin SSL detectada.');
      } else {
        process.env.DB_USE_SSL = 'true';
        console.warn('Aviso al verificar PostgreSQL Cloud:', msg);
      }
    } finally {
      await testSslClient.end().catch(() => {});
    }
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    console.error(
      '❌ ERROR CRÍTICO: No se encontró DATABASE_URL ni RENDER_DATABASE_URL en las variables de entorno de Render.',
    );
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

