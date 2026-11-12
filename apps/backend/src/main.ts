import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import { AppModule } from './app.module';

function extractCleanUrl(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/postgres(?:ql)?:\/\/[^\s'"]+/i);
  return match ? match[0] : trimmed.replace(/^['"]|['"]$/g, '');
}

async function resolveAndVerifyDatabase() {
  // Priorizar RENDER_DATABASE_URL (montana-redonda-db interna de Render) y luego DATABASE_URL
  const candidates = [
    { label: 'RENDER_DATABASE_URL', url: extractCleanUrl(process.env.RENDER_DATABASE_URL) },
    { label: 'DATABASE_URL', url: extractCleanUrl(process.env.DATABASE_URL) },
  ].filter((c): c is { label: string; url: string } => Boolean(c.url));

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate.url);
      const baseConfig = {
        host: parsed.hostname,
        port: Number(parsed.port || 5432),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, '') || 'montana_redonda_db',
      };

      // Si es red interna de Render (dpg-...), probar primero sin SSL y luego con SSL
      const isInternalRender = parsed.hostname.startsWith('dpg-') && !parsed.hostname.includes('.');
      const sslModes: Array<boolean | { rejectUnauthorized: boolean }> = isInternalRender
        ? [false, { rejectUnauthorized: false }]
        : [{ rejectUnauthorized: false }, false];

      for (const sslMode of sslModes) {
        const client = new Client({
          ...baseConfig,
          ssl: sslMode,
          connectionTimeoutMillis: 6000,
        });
        try {
          await client.connect();
          await client.query('SELECT 1');
          await client.end().catch(() => {});

          (global as any).__MRP_VERIFIED_DB_CONFIG__ = {
            type: 'postgres',
            host: baseConfig.host,
            port: baseConfig.port,
            username: baseConfig.user,
            password: baseConfig.password,
            database: baseConfig.database,
            ssl: sslMode,
          };
          console.log(
            `✅ Conectado exitosamente a PostgreSQL usando ${candidate.label} (${baseConfig.host}, ssl=${Boolean(sslMode)})`,
          );
          return;
        } catch (innerErr: any) {
          await client.end().catch(() => {});
          console.warn(
            `Intento ${candidate.label} (${baseConfig.host}, ssl=${Boolean(sslMode)}) falló: ${innerErr?.message || innerErr}`,
          );
        }
      }
    } catch (parseErr: any) {
      console.warn(`URL inválida en ${candidate.label}:`, parseErr?.message);
    }
  }

  if (process.env.NODE_ENV === 'production') {
    console.error(
      '❌ Ninguna URL de base de datos (RENDER_DATABASE_URL / DATABASE_URL) pudo conectar.',
    );
    return;
  }

  // Modo desarrollo local
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
    console.warn('Aviso al verificar base de datos local:', (err as Error).message);
  } finally {
    await client.end().catch(() => {});
  }
}

async function bootstrap() {
  await resolveAndVerifyDatabase();
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
