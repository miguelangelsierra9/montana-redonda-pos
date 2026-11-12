import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { ALL_ENTITIES } from './database/entities';
import { DatabaseInitializerService } from './database/database-initializer.service';
import { CoreDomainController, CoreDomainService, JwtStrategy } from './modules/core-domain';
import { JwtAuthGuard, RolesGuard } from './common/auth-guards';

function getCleanDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;
  // Si el usuario pegó el comando completo de Neon (ej: psql 'postgresql://...')
  const match = raw.match(/postgres(?:ql)?:\/\/[^\s'"]+/i);
  return match ? match[0] : raw.replace(/^['"]|['"]$/g, '');
}

const cleanDbUrl = getCleanDatabaseUrl();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    TypeOrmModule.forRoot(
      cleanDbUrl
        ? {
            type: 'postgres',
            url: cleanDbUrl,
            ssl: { rejectUnauthorized: false },
            entities: ALL_ENTITIES,
            synchronize: true,
            logging: false,
          }
        : {
            type: 'postgres',
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT || 5432),
            username: process.env.DB_USER || 'mrp_admin',
            password: process.env.DB_PASSWORD || 'mrp_secret_2026',
            database: process.env.DB_NAME || 'montana_redonda_db',
            entities: ALL_ENTITIES,
            synchronize: true,
            logging: false,
          },
    ),
    TypeOrmModule.forFeature(ALL_ENTITIES),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'mrp_jwt_super_secret_key_miches_rd_2026_production_ready',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [CoreDomainController],
  providers: [
    DatabaseInitializerService,
    CoreDomainService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}

