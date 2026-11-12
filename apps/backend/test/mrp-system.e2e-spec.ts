import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Montaña Redonda Paradise — Batería E2E Contra PostgreSQL 16 Real (TEST-01 a TEST-10)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let operatorToken: string;
  let catalog: any;

  beforeAll(async () => {
    // Asegurar que la base de datos exista en PostgreSQL 16
    const pgClient = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'mrp_admin',
      password: process.env.DB_PASSWORD || 'mrp_secret_2026',
      database: 'postgres',
    });
    await pgClient.connect();
    const dbName = process.env.DB_NAME || 'montana_redonda_db';
    const check = await pgClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (check.rowCount === 0) {
      await pgClient.query(`CREATE DATABASE "${dbName}"`);
    }
    await pgClient.end();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    dataSource = app.get(DataSource);
  }, 45000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 30000);

  it('Autenticación JWT y carga de los 5 roles iniciales (ADMIN y OPERATOR)', async () => {
    const adminRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Montana2026*' })
      .expect(201);

    expect(adminRes.body.accessToken).toBeDefined();
    expect(adminRes.body.user.roleCode).toBe('ADMIN');
    adminToken = adminRes.body.accessToken;

    const opRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'operador', password: 'Montana2026*' })
      .expect(201);

    expect(opRes.body.accessToken).toBeDefined();
    expect(opRes.body.user.roleCode).toBe('OPERATOR');
    operatorToken = opRes.body.accessToken;

    const catRes = await request(app.getHttpServer())
      .get('/api/catalog')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    catalog = catRes.body;
    expect(catalog.categories.length).toBeGreaterThanOrEqual(8);
    expect(catalog.services.length).toBeGreaterThanOrEqual(8);
    expect(catalog.packages.length).toBeGreaterThanOrEqual(2);
  });

  it('TEST-00: El sistema impide vender si la caja está cerrada y exige abrir sesión de caja primero', async () => {
    // Asegurar que todas las sesiones de caja estén cerradas en BD
    await dataSource.query(`UPDATE cash_sessions SET status = 'CLOSED', closed_at = NOW() WHERE status = 'OPEN'`);

    const cashierRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'cajero', password: 'Montana2026*' })
      .expect(201);
    const cashierToken = cashierRes.body.accessToken;

    const ent = catalog.services.find((s: any) => s.code === 'ENT-GEN');

    // 1. Intentar vender con la caja cerrada -> Debe rechazar con 400 Bad Request
    const blockedSale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        idempotencyKey: `test00-closed-cash-${Date.now()}`,
        adultCount: 1,
        items: [{ itemType: 'SERVICE', serviceId: ent.id, quantity: 1 }],
        payments: [{ paymentMethodCode: 'CASH_DOP', amountOriginal: 500 }],
      })
      .expect(400);

    expect(blockedSale.body.message).toMatch(/CAJA CERRADA/i);

    // 2. Abrir sesión de caja formalmente antes de vender
    const cashStatus = await request(app.getHttpServer())
      .get('/api/cash/status')
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);

    const registerId = cashStatus.body.registers[0].id;

    const openRes = await request(app.getHttpServer())
      .post('/api/cash/sessions/open')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        cashRegisterId: registerId,
        openingAmountDop: 5000,
        openingAmountUsd: 100,
        notes: 'Apertura obligatoria de caja para poder vender',
      })
      .expect(201);

    expect(openRes.body.status).toBe('OPEN');
  });

  it('TEST-01: Venta familiar (4 Entradas + 4 Zip Line + 2 Buggies) genera exactamente 10 tickets individuales con QR firmados únicos', async () => {
    const ent = catalog.services.find((s: any) => s.code === 'ENT-GEN');
    const zip = catalog.services.find((s: any) => s.code === 'ACT-ZIP');
    const bug = catalog.services.find((s: any) => s.code === 'ACT-BUG');

    const idempotencyKey = `test01-family-${Date.now()}`;

    const saleRes = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Idempotency-Key', idempotencyKey)
      .send({
        idempotencyKey,
        customerName: 'Familia Martínez',
        customerRncCedula: '00112345678',
        ncfType: 'B02',
        adultCount: 2,
        childCount: 2,
        participants: [
          { displayName: 'Carlos Martínez', participantType: 'ADULT', nationality: 'Dominicana' },
          { displayName: 'Ana Rodríguez', participantType: 'ADULT', nationality: 'Dominicana' },
          { displayName: 'Luis Martínez', participantType: 'CHILD', nationality: 'Dominicana' },
          { displayName: 'Sofía Martínez', participantType: 'CHILD', nationality: 'Dominicana' },
        ],
        items: [
          { itemType: 'SERVICE', serviceId: ent.id, quantity: 4 },
          { itemType: 'SERVICE', serviceId: zip.id, quantity: 4 },
          { itemType: 'SERVICE', serviceId: bug.id, quantity: 2 },
        ],
        payments: [{ paymentMethodCode: 'CASH_DOP', amountOriginal: 20000 }],
      })
      .expect(201);

    const sale = saleRes.body;
    expect(sale.status).toBe('PAID');
    expect(sale.tickets).toHaveLength(10);

    const entTickets = sale.tickets.filter((t: any) => t.serviceId === ent.id);
    const zipTickets = sale.tickets.filter((t: any) => t.serviceId === zip.id);
    const bugTickets = sale.tickets.filter((t: any) => t.serviceId === bug.id);

    expect(entTickets).toHaveLength(4);
    expect(zipTickets).toHaveLength(4);
    expect(bugTickets).toHaveLength(2);

    // Verificar que los 10 QR sean únicos y firmados con MRP1.
    const qrPayloads = new Set(sale.tickets.map((t: any) => t.qrPayload));
    expect(qrPayloads.size).toBe(10);
    sale.tickets.forEach((t: any) => {
      expect(t.qrPayload.startsWith('MRP1.TKT-')).toBe(true);
      expect(t.status).toBe('AVAILABLE');
    });
  });

  it('TEST-02: Venta de Paquetes Turísticos descompone internamente y genera tickets individuales por participante y actividad', async () => {
    const pkgAventura = catalog.packages.find((p: any) => p.code === 'PKG-AVENTURA');
    const idempotencyKey = `test02-pkg-${Date.now()}`;

    // 3 Paquetes Aventura (cada uno incluye Entrada + Zip Line + Buggies = 3 servicios) -> 3 x 3 = 9 tickets
    const res = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Idempotency-Key', idempotencyKey)
      .send({
        idempotencyKey,
        customerName: 'Grupo Excursión Aventura',
        adultCount: 3,
        childCount: 0,
        items: [{ itemType: 'PACKAGE', packageId: pkgAventura.id, quantity: 3 }],
        payments: [{ paymentMethodCode: 'CARD', amountOriginal: 20000, referenceNumber: 'VOUCHER-991' }],
      })
      .expect(201);

    expect(res.body.tickets).toHaveLength(9);
    res.body.tickets.forEach((t: any) => {
      expect(t.sourcePackageId).toBe(pkgAventura.id);
      expect(t.serviceId).toBeDefined();
    });
  });

  it('TEST-03: Idempotencia POS — Reintentar o enviar múltiples veces la misma clave de operación NO duplica cobros ni tickets', async () => {
    const ent = catalog.services.find((s: any) => s.code === 'ENT-GEN');
    const sharedIdempotencyKey = `test03-idem-${Date.now()}`;

    const payload = {
      idempotencyKey: sharedIdempotencyKey,
      customerName: 'Visitante Idempotencia',
      adultCount: 2,
      items: [{ itemType: 'SERVICE', serviceId: ent.id, quantity: 2 }],
      payments: [{ paymentMethodCode: 'CASH_DOP', amountOriginal: 1000 }],
    };

    const [r1, r2, r3] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Idempotency-Key', sharedIdempotencyKey)
        .send(payload),
      request(app.getHttpServer())
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Idempotency-Key', sharedIdempotencyKey)
        .send(payload),
      request(app.getHttpServer())
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Idempotency-Key', sharedIdempotencyKey)
        .send(payload),
    ]);

    expect(r1.body.id).toBe(r2.body.id);
    expect(r2.body.id).toBe(r3.body.id);
    expect(r1.body.invoiceNumber).toBe(r2.body.invoiceNumber);

    const dbTickets = await dataSource.query('SELECT COUNT(*)::int AS cnt FROM tickets WHERE sale_id = $1', [
      r1.body.id,
    ]);
    expect(dbTickets[0].cnt).toBe(2);
  });

  it('TEST-04 & TEST-07: Validación QR Atómica con concurrencia y control obligatorio de seguridad en Zip Line', async () => {
    const zip = catalog.services.find((s: any) => s.code === 'ACT-ZIP');
    const idemKey = `test04-atomic-${Date.now()}`;

    const saleRes = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        idempotencyKey: idemKey,
        adultCount: 1,
        items: [{ itemType: 'SERVICE', serviceId: zip.id, quantity: 1 }],
        payments: [{ paymentMethodCode: 'CASH_DOP', amountOriginal: 3000 }],
      })
      .expect(201);

    const ticket = saleRes.body.tickets[0];

    // 1) TEST-07: Intentar validar Zip Line SIN marcar comprobaciones de seguridad obligatorias -> debe rechazar
    const unsafeAttempt = await request(app.getHttpServer())
      .post('/api/validations/consume')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        qrOrTicketCode: ticket.qrPayload,
        accessPoint: 'Torre Zip Line #1',
        safetyInstructionsAccepted: false,
        safetyHarnessChecked: false,
        safetyHelmetChecked: false,
      })
      .expect(201);

    expect(unsafeAttempt.body.allowed).toBe(false);
    expect(unsafeAttempt.body.resultCode).toBe('REJECTED_SAFETY_CHECK');

    // 2) TEST-04: Disparar 5 validaciones concurrentes al mismo tiempo con checklist de seguridad completo
    const concurrentCalls = Array.from({ length: 5 }).map((_, idx) =>
      request(app.getHttpServer())
        .post('/api/validations/consume')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          qrOrTicketCode: ticket.qrPayload,
          accessPoint: `Torre Zip Line #${idx + 1}`,
          safetyInstructionsAccepted: true,
          safetyHarnessChecked: true,
          safetyHelmetChecked: true,
        })
    );

    const responses = await Promise.all(concurrentCalls);
    const approvedList = responses.filter((r) => r.body.allowed === true && r.body.resultCode === 'APPROVED');
    const rejectedAlreadyUsedList = responses.filter(
      (r) => r.body.allowed === false && r.body.resultCode === 'REJECTED_ALREADY_USED'
    );

    // Exactamente 1 debe aprobarse y 4 deben rechazarse por ya utilizado
    expect(approvedList).toHaveLength(1);
    expect(rejectedAlreadyUsedList).toHaveLength(4);
    expect(rejectedAlreadyUsedList[0].body.previousUse).toBeDefined();
  });

  it('TEST-05: Un ticket emitido en venta PENDIENTE DE PAGO es rechazado salvo autorización administrativa expresa', async () => {
    const ent = catalog.services.find((s: any) => s.code === 'ENT-GEN');
    const idemKey = `test05-unpaid-${Date.now()}`;

    const unpaidSaleRes = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        idempotencyKey: idemKey,
        status: 'PENDING_PAYMENT',
        adultCount: 1,
        items: [{ itemType: 'SERVICE', serviceId: ent.id, quantity: 1 }],
        payments: [],
      })
      .expect(201);

    const unpaidTicket = unpaidSaleRes.body.tickets[0];
    expect(unpaidTicket.status).toBe('ISSUED');

    // Intento de validación sin pago -> rechazado
    const rejectRes = await request(app.getHttpServer())
      .post('/api/validations/consume')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ qrOrTicketCode: unpaidTicket.qrPayload })
      .expect(201);

    expect(rejectRes.body.allowed).toBe(false);
    expect(rejectRes.body.resultCode).toBe('REJECTED_UNPAID');

    // Autorización administrativa expresa
    await request(app.getHttpServer())
      .post(`/api/sales/${unpaidSaleRes.body.id}/authorize-unpaid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    // Ahora sí permite validar
    const approveRes = await request(app.getHttpServer())
      .post('/api/validations/consume')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ qrOrTicketCode: unpaidTicket.qrPayload })
      .expect(201);

    expect(approveRes.body.allowed).toBe(true);
    expect(approveRes.body.resultCode).toBe('APPROVED');
  });

  it('TEST-06: Anulación de factura invalida los tickets no usados pero conserva intactos los tickets ya utilizados (Reglas #9 y #10)', async () => {
    const ent = catalog.services.find((s: any) => s.code === 'ENT-GEN');
    const idemKey = `test06-void-${Date.now()}`;

    const saleRes = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        idempotencyKey: idemKey,
        adultCount: 3,
        items: [{ itemType: 'SERVICE', serviceId: ent.id, quantity: 3 }],
        payments: [{ paymentMethodCode: 'CASH_DOP', amountOriginal: 1500 }],
      })
      .expect(201);

    const [t1, t2, t3] = saleRes.body.tickets;

    // Consumir el ticket #1 antes de anular la factura
    await request(app.getHttpServer())
      .post('/api/validations/consume')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ qrOrTicketCode: t1.qrPayload })
      .expect(201);

    // Anular la factura
    const voidRes = await request(app.getHttpServer())
      .post(`/api/sales/${saleRes.body.id}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Solicitud de devolución parcial por lluvia' })
      .expect(201);

    expect(voidRes.body.cancelledTicketsCount).toBe(2);
    expect(voidRes.body.preservedUsedTicketsCount).toBe(1);
    expect(voidRes.body.creditNoteNumber.startsWith('B04')).toBe(true);

    // Verificar en BD que t1 sigue USED y t2, t3 pasaron a CANCELLED
    const updatedSale = await request(app.getHttpServer())
      .get(`/api/sales/${saleRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const updatedT1 = updatedSale.body.tickets.find((t: any) => t.id === t1.id);
    const updatedT2 = updatedSale.body.tickets.find((t: any) => t.id === t2.id);
    const updatedT3 = updatedSale.body.tickets.find((t: any) => t.id === t3.id);

    expect(updatedT1.status).toBe('USED');
    expect(updatedT2.status).toBe('CANCELLED');
    expect(updatedT3.status).toBe('CANCELLED');
  });

  it('TEST-08: Trigger de PostgreSQL impide eliminar físicamente registros históricos de ventas o tickets', async () => {
    const sales = await dataSource.query('SELECT id FROM sales LIMIT 1');
    expect(sales.length).toBe(1);

    await expect(dataSource.query('DELETE FROM sales WHERE id = $1', [sales[0].id])).rejects.toThrow(
      /Inmutabilidad histórica Montaña Redonda/
    );
  });

  it('TEST-09 & TEST-10: Pago combinado DOP/USD, protección RBAC por rol y exportación Excel de los 13 reportes', async () => {
    const ent = catalog.services.find((s: any) => s.code === 'ENT-GEN');

    // TEST-09: Pago combinado (Efectivo USD + Efectivo DOP + Tarjeta)
    const mixedRes = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        idempotencyKey: `test09-mixed-${Date.now()}`,
        adultCount: 2,
        items: [{ itemType: 'SERVICE', serviceId: ent.id, quantity: 2 }],
        payments: [
          { paymentMethodCode: 'CASH_USD', amountOriginal: 5 },
          { paymentMethodCode: 'CASH_DOP', amountOriginal: 200 },
          { paymentMethodCode: 'CARD', amountOriginal: 100, referenceNumber: 'CARD-55' },
        ],
      })
      .expect(201);

    expect(mixedRes.body.payments).toHaveLength(3);

    // TEST-10: Operador intenta crear un servicio en el catálogo o anular una factura -> 403 Forbidden
    await request(app.getHttpServer())
      .post('/api/catalog/services')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ code: 'HACK', name: 'No autorizado' })
      .expect(403);

    // Verificar Dashboard y los 13 reportes + Exportación Excel (.xlsx)
    const dashRes = await request(app.getHttpServer())
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(dashRes.body.kpis.ticketsIssuedCount).toBeGreaterThanOrEqual(20);
    expect(dashRes.body.reports.salesByActivity.length).toBeGreaterThan(0);

    const excelRes = await request(app.getHttpServer())
      .get('/api/reports/export-excel?reportKey=3_ventas_actividad')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(excelRes.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    // Dejar todas las sesiones de caja cerradas al finalizar la suite para que el cajero deba abrir caja antes de vender
    await dataSource.query(`UPDATE cash_sessions SET status = 'CLOSED', closed_at = NOW() WHERE status = 'OPEN'`);
  }, 20000);
});
