import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  Permission,
  Role,
  User,
  Employee,
  CompanySetting,
  TaxSetting,
  ServiceCategory,
  Service,
  ServicePrice,
  TourPackage,
  PackageItem,
  CashRegister,
  CashSession,
  CashMovement,
  PaymentMethod,
  FiscalSequence,
} from './entities';
import {
  RoleCode,
  CurrencyCode,
  PaymentMethodCode,
  NcfType,
  RateType,
  CashSessionStatus,
  CashMovementType,
} from '@mrp/shared';

@Injectable()
export class DatabaseInitializerService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseInitializerService.name);

  constructor(private readonly dataSource: DataSource) { }

  async onModuleInit() {
    await this.installPostgreSqlConstraintsAndTriggers();
    await this.seedInitialData();
  }

  /**
   * Instala en PostgreSQL:
   * 1. Índice único parcial en ticket_validations para garantizar como máximo 1 validación APPROVED por ticket.
   * 2. Trigger de inmutabilidad histórica que prohíbe DELETE físico en sales, sale_items, payments, tickets, ticket_validations y audit_logs.
   */
  async installPostgreSqlConstraintsAndTriggers() {
    const qr = this.dataSource.createQueryRunner();
    try {
      await qr.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_approved_ticket_validation
        ON ticket_validations (ticket_id)
        WHERE validation_result = 'APPROVED' AND ticket_id IS NOT NULL;
      `);

      await qr.query(`
        CREATE OR REPLACE FUNCTION prevent_historical_deletion()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'Inmutabilidad histórica Montaña Redonda: No se permite eliminar físicamente registros de la tabla %. Utilice anulación auditada.', TG_TABLE_NAME;
        END;
        $$ LANGUAGE plpgsql;
      `);

      const protectedTables = [
        'sales',
        'sale_items',
        'payments',
        'tickets',
        'ticket_validations',
        'cash_sessions',
        'cash_movements',
        'audit_logs',
      ];

      for (const table of protectedTables) {
        const triggerName = `trg_no_delete_${table}`;
        await qr.query(`
          DROP TRIGGER IF EXISTS ${triggerName} ON ${table};
          CREATE TRIGGER ${triggerName}
          BEFORE DELETE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION prevent_historical_deletion();
        `);
      }

      this.logger.log('Triggers de inmutabilidad histórica e índice de validación única QR verificados en PostgreSQL.');
    } catch (err) {
      this.logger.warn(`Aviso al configurar triggers nativos: ${(err as Error).message}`);
    } finally {
      await qr.release();
    }
  }

  async seedInitialData() {
    const roleRepo = this.dataSource.getRepository(Role);
    const existingRoles = await roleRepo.count();
    if (existingRoles > 0) {
      this.logger.log('Datos iniciales de Montaña Redonda Paradise ya existen en PostgreSQL.');
      return;
    }

    this.logger.log('Sembrando catálogo, roles, usuarios, impuestos, cajas y paquetes de Montaña Redonda Paradise...');

    // 1. Permisos del sistema
    const permRepo = this.dataSource.getRepository(Permission);
    const permissionDefinitions = [
      { code: 'pos:sell', module: 'POS', description: 'Crear ventas y cobrar en POS' },
      { code: 'pos:discount', module: 'POS', description: 'Aplicar descuentos autorizados' },
      { code: 'sale:void', module: 'SALES', description: 'Anular facturas y emitir notas de crédito' },
      { code: 'ticket:print', module: 'TICKETS', description: 'Imprimir y reimprimir tickets QR' },
      { code: 'ticket:validate', module: 'VALIDATION', description: 'Escanear y validar códigos QR en actividades' },
      { code: 'ticket:override_unpaid', module: 'TICKETS', description: 'Autorizar uso de tickets sin pago completado' },
      { code: 'cash:manage', module: 'CASH', description: 'Abrir, operar y cerrar sesiones de caja' },
      { code: 'catalog:manage', module: 'CATALOG', description: 'Crear y modificar servicios, precios y paquetes' },
      { code: 'reports:view', module: 'REPORTS', description: 'Consultar dashboard y exportar los 13 reportes' },
      { code: 'settings:manage', module: 'SETTINGS', description: 'Configurar empresa, tasas, NCF, usuarios y roles' },
    ];

    const savedPerms = await permRepo.save(permissionDefinitions.map((p) => permRepo.create(p)));
    const byCode = (codes: string[]) => savedPerms.filter((p) => codes.includes(p.code));

    // 2. Los 5 Roles obligatorios
    const adminRole = await roleRepo.save(
      roleRepo.create({
        code: RoleCode.ADMIN,
        name: 'Administrador General',
        description: 'Acceso completo a todos los módulos, auditoría, precios y configuración fiscal.',
        permissions: savedPerms,
      })
    );

    const managerRole = await roleRepo.save(
      roleRepo.create({
        code: RoleCode.MANAGER,
        name: 'Gerente de Operaciones',
        description: 'Ventas, reportes, catálogo de servicios, paquetes, anulaciones y operaciones.',
        permissions: byCode([
          'pos:sell',
          'pos:discount',
          'sale:void',
          'ticket:print',
          'ticket:validate',
          'ticket:override_unpaid',
          'cash:manage',
          'catalog:manage',
          'reports:view',
        ]),
      })
    );

    const cashierRole = await roleRepo.save(
      roleRepo.create({
        code: RoleCode.CASHIER,
        name: 'Cajero de Recepción',
        description: 'Ventas rápidas POS, cobros multimoneda DOP/USD y control de su sesión de caja.',
        permissions: byCode(['pos:sell', 'ticket:print', 'cash:manage']),
      })
    );

    const receptionRole = await roleRepo.save(
      roleRepo.create({
        code: RoleCode.RECEPTION,
        name: 'Agente de Recepción',
        description: 'Registro de ventas, asignación de visitantes, consulta de facturas y tickets.',
        permissions: byCode(['pos:sell', 'ticket:print']),
      })
    );

    const operatorRole = await roleRepo.save(
      roleRepo.create({
        code: RoleCode.OPERATOR,
        name: 'Operador de Actividad',
        description: 'Escaneo y validación de tickets QR, controles de seguridad y registro de incidencias.',
        permissions: byCode(['ticket:validate']),
      })
    );

    // 3. Configuración de Empresa e Impuestos (RD)
    const companyRepo = this.dataSource.getRepository(CompanySetting);
    await companyRepo.save(
      companyRepo.create({
        commercialName: 'Montaña Redonda Paradise',
        legalName: 'Montaña Redonda Paradise SRL',
        rnc: '131-89452-1',
        address: 'Carretera Michés - Nisibón Km 14, Michés, El Seibo, República Dominicana',
        phone: '+1 (809) 553-5959',
        email: 'recepcion@montanaredondaparadise.com',
        primaryCurrency: CurrencyCode.DOP,
        secondaryCurrency: CurrencyCode.USD,
        exchangeRateUsdToDop: 60.5,
        allowUnpaidTicketOverride: false,
        ecfPreparationMode: true,
      })
    );

    const taxRepo = this.dataSource.getRepository(TaxSetting);
    const itbis18 = await taxRepo.save(
      taxRepo.create({
        code: 'ITBIS_18',
        name: 'ITBIS 18% (DGII)',
        ratePercentage: 18,
        isDefault: true,
        isInclusive: false,
      })
    );
    const itbis0 = await taxRepo.save(
      taxRepo.create({
        code: 'ITBIS_0',
        name: 'Exento de ITBIS (0%)',
        ratePercentage: 0,
        isDefault: false,
        isInclusive: false,
      })
    );

    // Secuencias NCF (República Dominicana)
    const ncfRepo = this.dataSource.getRepository(FiscalSequence);
    await ncfRepo.save([
      ncfRepo.create({ ncfType: NcfType.B02, description: 'Factura de Consumo Final', prefix: 'B02', currentNumber: 1, maxNumber: 50000 }),
      ncfRepo.create({ ncfType: NcfType.B01, description: 'Factura de Crédito Fiscal', prefix: 'B01', currentNumber: 1, maxNumber: 10000 }),
      ncfRepo.create({ ncfType: NcfType.B04, description: 'Nota de Crédito', prefix: 'B04', currentNumber: 1, maxNumber: 5000 }),
      ncfRepo.create({ ncfType: NcfType.B14, description: 'Regímenes Especiales de Tributación', prefix: 'B14', currentNumber: 1, maxNumber: 5000 }),
      ncfRepo.create({ ncfType: NcfType.B15, description: 'Comprobante Gubernamental', prefix: 'B15', currentNumber: 1, maxNumber: 5000 }),
      ncfRepo.create({ ncfType: NcfType.E31, description: 'e-CF Crédito Fiscal Electrónico (Prep.)', prefix: 'E31', currentNumber: 1, maxNumber: 50000 }),
      ncfRepo.create({ ncfType: NcfType.E32, description: 'e-CF Consumo Electrónico (Prep.)', prefix: 'E32', currentNumber: 1, maxNumber: 50000 }),
    ]);

    // 4. Las 8 Categorías Iniciales
    const catRepo = this.dataSource.getRepository(ServiceCategory);
    const categories = await catRepo.save([
      catRepo.create({ code: 'ENTRADA', name: 'Entrada general', icon: 'Ticket', colorHex: '#15803d', sortOrder: 1 }),
      catRepo.create({ code: 'ZIP_LINE', name: 'Zip Line', icon: 'Zap', colorHex: '#1e40af', sortOrder: 2 }),
      catRepo.create({ code: 'BUGGIES', name: 'Buggies', icon: 'Car', colorHex: '#b45309', sortOrder: 3 }),
      catRepo.create({ code: 'SAFARI', name: 'Transporte safari', icon: 'Truck', colorHex: '#166534', sortOrder: 4 }),
      catRepo.create({ code: 'EXCURSIONES', name: 'Excursiones', icon: 'Compass', colorHex: '#0f766e', sortOrder: 5 }),
      catRepo.create({ code: 'FOTOGRAFIA', name: 'Experiencias fotográficas', icon: 'Camera', colorHex: '#7c2d12', sortOrder: 6 }),
      catRepo.create({ code: 'RECREACION', name: 'Actividades recreativas', icon: 'Smile', colorHex: '#4338ca', sortOrder: 7 }),
      catRepo.create({ code: 'OTROS', name: 'Otros servicios', icon: 'Sparkles', colorHex: '#4b5563', sortOrder: 8 }),
    ]);
    const catMap = Object.fromEntries(categories.map((c) => [c.code, c]));

    // 5. Catálogo de Servicios de Montaña Redonda Paradise
    const serviceRepo = this.dataSource.getRepository(Service);
    const priceRepo = this.dataSource.getRepository(ServicePrice);

    const createServiceWithPrices = async (data: {
      categoryCode: string;
      code: string;
      name: string;
      description: string;
      priceDop: number;
      priceUsd: number;
      childDop?: number;
      requiresSafetyCheck?: boolean;
      durationMinutes?: number;
      capacityPerShift?: number;
      accessPointName: string;
      restrictionsText: string;
      instructionsText: string;
      taxSetting: TaxSetting;
    }) => {
      const svc = await serviceRepo.save(
        serviceRepo.create({
          categoryId: catMap[data.categoryCode].id,
          code: data.code,
          name: data.name,
          description: data.description,
          taxSettingId: data.taxSetting.id,
          requiresSafetyCheck: !!data.requiresSafetyCheck,
          durationMinutes: data.durationMinutes || 45,
          capacityPerShift: data.capacityPerShift || 30,
          accessPointName: data.accessPointName,
          restrictionsText: data.restrictionsText,
          instructionsText: data.instructionsText,
          status: 'ACTIVE',
        })
      );

      await priceRepo.save([
        priceRepo.create({ serviceId: svc.id, rateType: RateType.GENERAL, currency: CurrencyCode.DOP, unitPrice: data.priceDop }),
        priceRepo.create({ serviceId: svc.id, rateType: RateType.GENERAL, currency: CurrencyCode.USD, unitPrice: data.priceUsd }),
        priceRepo.create({
          serviceId: svc.id,
          rateType: RateType.CHILD,
          currency: CurrencyCode.DOP,
          unitPrice: data.childDop ?? Math.round(data.priceDop * 0.6),
        }),
      ]);
      return svc;
    };

    const svcEntrada = await createServiceWithPrices({
      categoryCode: 'ENTRADA',
      code: 'ENT-GEN',
      name: 'Entrada General Montaña Redonda',
      description: 'Acceso panorámico 360° a la cima de Montaña Redonda, columpios gigantes, hamacas y miradores.',
      priceDop: 250,
      priceUsd: 5,
      childDop: 150,
      requiresSafetyCheck: false,
      durationMinutes: 180,
      capacityPerShift: 200,
      accessPointName: 'Garita Principal de Acceso',
      restrictionsText: 'Niños menores de 12 años deben estar acompañados por un adulto.',
      instructionsText: 'Presente este código QR en la entrada principal antes de abordar o subir a la montaña.',
      taxSetting: itbis18,
    });

    const svcZipLine = await createServiceWithPrices({
      categoryCode: 'ZIP_LINE',
      code: 'ACT-ZIP',
      name: 'Zip Line Canopy Extremo',
      description: 'Circuito de tirolesas panorámicas con vista a la Laguna Redonda, Laguna Limón y Bahía de Samaná.',
      priceDop: 1500,
      priceUsd: 25,
      childDop: 1200,
      requiresSafetyCheck: true,
      durationMinutes: 45,
      capacityPerShift: 20,
      accessPointName: 'Torre de Salida Zip Line #1',
      restrictionsText: 'Peso máx: 250 lbs (113 kg). Edad mínima: 6 años. No apto para embarazadas ni afecciones cardíacas.',
      instructionsText: 'Obligatorio asistir a la charla breve de seguridad y revisión de casco, guantes y arnés por el operador.',
      taxSetting: itbis18,
    });

    const svcBuggies = await createServiceWithPrices({
      categoryCode: 'BUGGIES',
      code: 'ACT-BUG',
      name: 'Experiencia en Buggies Todoterreno',
      description: 'Ruta guiada de aventura ecológica por senderos tropicales y faldas de Montaña Redonda.',
      priceDop: 2800,
      priceUsd: 48,
      childDop: 2200,
      requiresSafetyCheck: true,
      durationMinutes: 60,
      capacityPerShift: 15,
      accessPointName: 'Estación Base Buggies',
      restrictionsText: 'Conductores mayores de 18 años. Uso obligatorio de casco y gafas protectoras.',
      instructionsText: 'Presentarse 10 minutos antes en la estación de Buggies para verificación de seguridad.',
      taxSetting: itbis18,
    });

    const svcSafari = await createServiceWithPrices({
      categoryCode: 'SAFARI',
      code: 'TRP-SAF',
      name: 'Transporte Camión Safari (Ida y Vuelta)',
      description: 'Ascenso y descenso seguro en camiones tipo Safari 4x4 desde la base hasta la cima.',
      priceDop: 350,
      priceUsd: 6,
      childDop: 200,
      requiresSafetyCheck: false,
      durationMinutes: 30,
      capacityPerShift: 40,
      accessPointName: 'Andén de Abordaje Safari',
      restrictionsText: 'Permanecer sentado y sujetarse del pasamanos durante todo el ascenso y descenso.',
      instructionsText: 'Presente este QR al abordar el camión Safari en la base.',
      taxSetting: itbis18,
    });

    const svcFoto = await createServiceWithPrices({
      categoryCode: 'FOTOGRAFIA',
      code: 'EXP-FOTO',
      name: 'Experiencia Fotográfica Escoba Voladora & Columpio',
      description: 'Sesión fotográfica profesional en los columpios del cielo y efecto de escoba voladora con entrega digital.',
      priceDop: 900,
      priceUsd: 15,
      requiresSafetyCheck: false,
      durationMinutes: 20,
      capacityPerShift: 25,
      accessPointName: 'Mirador Fotográfico Norte',
      restrictionsText: 'Respetar la fila del mirador y las indicaciones del fotógrafo.',
      instructionsText: 'Entregue este QR al fotógrafo oficial en el mirador para iniciar su sesión.',
      taxSetting: itbis18,
    });

    const svcCaballo = await createServiceWithPrices({
      categoryCode: 'EXCURSIONES',
      code: 'EXC-CAB',
      name: 'Excursión a Caballo por el Sendero Real',
      description: 'Cabalgata guiada por los senderos naturales de Michés con vistas panorámicas.',
      priceDop: 1800,
      priceUsd: 30,
      requiresSafetyCheck: true,
      durationMinutes: 50,
      capacityPerShift: 12,
      accessPointName: 'Corral de Excursiones',
      restrictionsText: 'Peso máx: 230 lbs. Seguir instrucciones del guía ecuestre.',
      instructionsText: 'Presentar ticket en el punto de salida de excursiones.',
      taxSetting: itbis18,
    });

    const svcColumpio = await createServiceWithPrices({
      categoryCode: 'RECREACION',
      code: 'REC-COL',
      name: 'Pase VIP Columpios Gigantes & Hamacas del Cielo',
      description: 'Acceso prioritario a las estaciones de columpios extremos con arnés de seguridad.',
      priceDop: 500,
      priceUsd: 9,
      requiresSafetyCheck: true,
      durationMinutes: 30,
      capacityPerShift: 30,
      accessPointName: 'Plataforma Columpios Gigantes',
      restrictionsText: 'Uso obligatorio de cinturón de sujeción verificado por el operador.',
      instructionsText: 'Muestre su código QR al operador del columpio antes de subir.',
      taxSetting: itbis18,
    });

    const svcAlmuerzo = await createServiceWithPrices({
      categoryCode: 'OTROS',
      code: 'OTR-ALM',
      name: 'Almuerzo Buffet Criollo en la Cima',
      description: 'Buffet típico dominicano en el restaurante panorámico (moro de guandules con coco, pescado de Michés, carnes y postre).',
      priceDop: 950,
      priceUsd: 16,
      childDop: 600,
      requiresSafetyCheck: false,
      durationMinutes: 60,
      capacityPerShift: 100,
      accessPointName: 'Restaurante Panorámico El Cielo',
      restrictionsText: 'Válido para un servicio de buffet y bebida natural.',
      instructionsText: 'Presente este QR en la entrada del restaurante en la cima.',
      taxSetting: itbis18,
    });

    // 6. Paquetes Turísticos Compuestos
    const pkgRepo = this.dataSource.getRepository(TourPackage);
    const pkgItemRepo = this.dataSource.getRepository(PackageItem);

    const pkgAventura = await pkgRepo.save(
      pkgRepo.create({
        code: 'PKG-AVENTURA',
        name: 'Paquete Aventura Total (Entrada + Zip Line + Buggies)',
        description: 'Incluye Entrada General, Circuito Zip Line Canopy y Experiencia en Buggies con tarifa preferencial.',
        priceDop: 3950,
        priceUsd: 66,
        taxSettingId: itbis18.id,
        status: 'ACTIVE',
      })
    );

    await pkgItemRepo.save([
      pkgItemRepo.create({ packageId: pkgAventura.id, serviceId: svcEntrada.id, quantityPerPackage: 1, allocatedPriceRatio: 0.1 }),
      pkgItemRepo.create({ packageId: pkgAventura.id, serviceId: svcZipLine.id, quantityPerPackage: 1, allocatedPriceRatio: 0.35 }),
      pkgItemRepo.create({ packageId: pkgAventura.id, serviceId: svcBuggies.id, quantityPerPackage: 1, allocatedPriceRatio: 0.55 }),
    ]);

    const pkgPanoramico = await pkgRepo.save(
      pkgRepo.create({
        code: 'PKG-PANORAMICO',
        name: 'Paquete Cumbre Familiar (Entrada + Safari + Almuerzo + Fotos)',
        description: 'Subida en Camión Safari, Entrada General, Experiencia Fotográfica y Almuerzo Buffet Criollo.',
        priceDop: 2100,
        priceUsd: 35,
        taxSettingId: itbis18.id,
        status: 'ACTIVE',
      })
    );

    await pkgItemRepo.save([
      pkgItemRepo.create({ packageId: pkgPanoramico.id, serviceId: svcEntrada.id, quantityPerPackage: 1, allocatedPriceRatio: 0.12 }),
      pkgItemRepo.create({ packageId: pkgPanoramico.id, serviceId: svcSafari.id, quantityPerPackage: 1, allocatedPriceRatio: 0.18 }),
      pkgItemRepo.create({ packageId: pkgPanoramico.id, serviceId: svcFoto.id, quantityPerPackage: 1, allocatedPriceRatio: 0.3 }),
      pkgItemRepo.create({ packageId: pkgPanoramico.id, serviceId: svcAlmuerzo.id, quantityPerPackage: 1, allocatedPriceRatio: 0.4 }),
    ]);

    // 7. Usuarios y Empleados para los 5 Roles
    const userRepo = this.dataSource.getRepository(User);
    const empRepo = this.dataSource.getRepository(Employee);
    const passwordHash = await bcrypt.hash('Montana2026*', 10);

    const createUserAndEmployee = async (u: {
      username: string;
      email: string;
      role: Role;
      empCode: string;
      firstName: string;
      lastName: string;
      documentId: string;
      position: string;
      assignedActivityId?: string | null;
    }) => {
      const savedUser = await userRepo.save(
        userRepo.create({
          username: u.username,
          email: u.email,
          passwordHash,
          roleId: u.role.id,
          isActive: true,
        })
      );
      const savedEmp = await empRepo.save(
        empRepo.create({
          userId: savedUser.id,
          employeeCode: u.empCode,
          firstName: u.firstName,
          lastName: u.lastName,
          documentId: u.documentId,
          phone: '809-553-0000',
          position: u.position,
          assignedActivityId: u.assignedActivityId ?? null,
          isActive: true,
        })
      );
      return { user: savedUser, employee: savedEmp };
    };

    const adminPair = await createUserAndEmployee({
      username: 'admin',
      email: 'admin@montanaredonda.do',
      role: adminRole,
      empCode: 'EMP-001',
      firstName: 'Rafael',
      lastName: 'Tavárez',
      documentId: '001-1458921-3',
      position: 'Administrador General',
    });

    await createUserAndEmployee({
      username: 'gerente',
      email: 'gerente@montanaredonda.do',
      role: managerRole,
      empCode: 'EMP-002',
      firstName: 'Carolina',
      lastName: 'Peguero',
      documentId: '025-0048192-7',
      position: 'Gerente de Operaciones',
    });

    const cashierPair = await createUserAndEmployee({
      username: 'cajero',
      email: 'caja1@montanaredonda.do',
      role: cashierRole,
      empCode: 'EMP-003',
      firstName: 'Yohanna',
      lastName: 'Mercedes',
      documentId: '025-0081234-1',
      position: 'Cajera Principal Recepción',
    });

    await createUserAndEmployee({
      username: 'recepcion',
      email: 'recepcion1@montanaredonda.do',
      role: receptionRole,
      empCode: 'EMP-004',
      firstName: 'Luis Miguel',
      lastName: 'Santana',
      documentId: '025-0094512-5',
      position: 'Oficial de Recepción y Boletería',
    });

    await createUserAndEmployee({
      username: 'operador',
      email: 'zipline@montanaredonda.do',
      role: operatorRole,
      empCode: 'EMP-005',
      firstName: 'Kelvin',
      lastName: 'Castillo',
      documentId: '025-0077319-0',
      position: 'Operador Jefe de Zip Line & Buggies',
      assignedActivityId: svcZipLine.id,
    });

    // 8. Métodos de Pago y Cajas Registradoras
    const pmRepo = this.dataSource.getRepository(PaymentMethod);
    await pmRepo.save([
      pmRepo.create({ code: PaymentMethodCode.CASH_DOP, name: 'Efectivo Pesos (DOP)', currency: CurrencyCode.DOP, requiresReference: false }),
      pmRepo.create({ code: PaymentMethodCode.CASH_USD, name: 'Efectivo Dólares (USD)', currency: CurrencyCode.USD, requiresReference: false }),
      pmRepo.create({ code: PaymentMethodCode.CARD, name: 'Tarjeta Crédito / Débito (Verifone)', currency: CurrencyCode.DOP, requiresReference: true }),
      pmRepo.create({ code: PaymentMethodCode.TRANSFER, name: 'Transferencia Bancaria (Popular/Banreservas)', currency: CurrencyCode.DOP, requiresReference: true }),
    ]);

    const regRepo = this.dataSource.getRepository(CashRegister);
    await regRepo.save([
      regRepo.create({ code: 'CAJA-REC-01', name: 'Caja Recepción #1 (Principal)', location: 'Boletería Entrada Michés' }),
      regRepo.create({ code: 'CAJA-REC-02', name: 'Caja Recepción #2 (Excursiones)', location: 'Boletería Entrada Michés' }),
    ]);

    this.logger.log('Semilla de Montaña Redonda Paradise completada exitosamente.');
  }
}

