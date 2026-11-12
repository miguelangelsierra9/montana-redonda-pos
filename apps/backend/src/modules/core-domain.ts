import {
  Injectable,
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Headers,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as QRCode from 'qrcode';
import * as ExcelJS from 'exceljs';
import {
  User,
  Role,
  Permission,
  Employee,
  CompanySetting,
  TaxSetting,
  ServiceCategory,
  Service,
  ServicePrice,
  TourPackage,
  PackageItem,
  Visitor,
  CashRegister,
  CashSession,
  CashMovement,
  Sale,
  SaleItem,
  SaleParticipant,
  PaymentMethod,
  Payment,
  Ticket,
  TicketValidation,
  ActivityIncident,
  AuditLog,
  FiscalSequence,
} from '../database/entities';
import {
  RoleCode,
  CurrencyCode,
  TicketStatus,
  SaleStatus,
  PaymentMethodCode,
  ValidationResultCode,
  NcfType,
  RateType,
  VisitorType,
  CashSessionStatus,
  CashMovementType,
  IncidentSeverity,
} from '@mrp/shared';
import { Public, Roles, CurrentUser, AuthUserPayload } from '../common/auth-guards';
import { buildSignedQrPayload, verifySignedQrPayload, sha256Hash } from '../common/qr-crypto';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'mrp_jwt_super_secret_key_miches_rd_2026_production_ready',
    });
  }

  async validate(payload: AuthUserPayload): Promise<AuthUserPayload> {
    return payload;
  }
}

@Injectable()
export class CoreDomainService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService
  ) {}

  private getTodayRdString(): string {
    const now = new Date();
    const rdTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    return rdTime.toISOString().slice(0, 10);
  }

  async logAudit(
    user: AuthUserPayload | null,
    action: string,
    entityName: string,
    entityId: string | null,
    detailsJson: Record<string, any>,
    manager = this.dataSource.manager
  ) {
    const repo = manager.getRepository(AuditLog);
    await repo.save(
      repo.create({
        userId: user?.id ?? null,
        username: user?.username ?? 'SYSTEM',
        action,
        entityName,
        entityId,
        detailsJson,
      })
    );
  }

  // ==================== FASE 2: AUTH & RBAC ====================
  async login(usernameOrEmail: string, passwordPlain: string) {
    const userRepo = this.dataSource.getRepository(User);
    const empRepo = this.dataSource.getRepository(Employee);

    const user = await userRepo.findOne({
      where: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
      relations: ['role', 'role.permissions'],
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo.');
    }

    const match = await bcrypt.compare(passwordPlain, user.passwordHash);
    if (!match) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    user.lastLoginAt = new Date();
    await userRepo.save(user);

    const employee = await empRepo.findOne({ where: { userId: user.id } });
    const permissions = (user.role?.permissions || []).map((p) => p.code);

    const payload: AuthUserPayload = {
      id: user.id,
      username: user.username,
      email: user.email,
      roleCode: user.role.code,
      employeeId: employee?.id,
      employeeName: employee ? `${employee.firstName} ${employee.lastName}` : user.username,
      assignedActivityId: employee?.assignedActivityId ?? null,
      permissions,
    };

    await this.logAudit(payload, 'USER_LOGIN', 'users', user.id, { role: user.role.code });

    return {
      accessToken: this.jwtService.sign(payload),
      user: payload,
    };
  }

  async getSystemBootstrap(user: AuthUserPayload) {
    const company = await this.dataSource.getRepository(CompanySetting).findOne({ where: {} });
    const taxes = await this.dataSource.getRepository(TaxSetting).find({ where: { isActive: true } });
    const categories = await this.dataSource.getRepository(ServiceCategory).find({ order: { sortOrder: 'ASC' } });
    const services = await this.dataSource.getRepository(Service).find({ order: { code: 'ASC' } });
    const packages = await this.dataSource.getRepository(TourPackage).find({ order: { code: 'ASC' } });
    const paymentMethods = await this.dataSource.getRepository(PaymentMethod).find({ where: { isActive: true } });
    const cashRegisters = await this.dataSource.getRepository(CashRegister).find({ where: { isActive: true } });
    const openSessions = await this.dataSource.getRepository(CashSession).find({
      where: { status: CashSessionStatus.OPEN },
      order: { openedAt: 'DESC' },
    });
    const fiscalSequences = await this.dataSource.getRepository(FiscalSequence).find();

    const userOpenSession =
      openSessions.find((s) => s.openedByUserId === user.id || (user.employeeId && s.employeeId === user.employeeId)) ||
      (user.roleCode === RoleCode.ADMIN || user.roleCode === RoleCode.MANAGER ? openSessions[0] : null) ||
      null;

    return {
      user,
      company,
      taxes,
      categories,
      services,
      packages,
      paymentMethods,
      cashRegisters,
      activeSession: userOpenSession,
      fiscalSequences,
    };
  }

  // ==================== FASE 4: CATÁLOGO DE SERVICIOS Y PAQUETES ====================
  async createOrUpdateService(dto: any, user: AuthUserPayload) {
    const serviceRepo = this.dataSource.getRepository(Service);
    const priceRepo = this.dataSource.getRepository(ServicePrice);
    const taxRepo = this.dataSource.getRepository(TaxSetting);

    let defaultTax = await taxRepo.findOne({ where: { isDefault: true } });
    if (!defaultTax) {
      defaultTax = await taxRepo.findOne({ where: {} });
    }

    const isUpdate = !!dto.id;
    let service: Service;

    if (isUpdate) {
      service = await serviceRepo.findOne({ where: { id: dto.id } });
      if (!service) throw new NotFoundException('Servicio no encontrado.');
      const oldPrice = service.prices;
      Object.assign(service, {
        categoryId: dto.categoryId ?? service.categoryId,
        code: dto.code ?? service.code,
        name: dto.name ?? service.name,
        description: dto.description ?? service.description,
        taxSettingId: dto.taxSettingId ?? service.taxSettingId,
        durationMinutes: dto.durationMinutes !== undefined ? Number(dto.durationMinutes) : service.durationMinutes,
        capacityPerShift: dto.capacityPerShift !== undefined ? Number(dto.capacityPerShift) : service.capacityPerShift,
        requiresSafetyCheck: dto.requiresSafetyCheck !== undefined ? !!dto.requiresSafetyCheck : service.requiresSafetyCheck,
        accessPointName: dto.accessPointName ?? service.accessPointName,
        restrictionsText: dto.restrictionsText ?? service.restrictionsText,
        instructionsText: dto.instructionsText ?? service.instructionsText,
        status: dto.status ?? service.status,
      });
      service = await serviceRepo.save(service);

      if (dto.priceDop !== undefined || dto.priceUsd !== undefined) {
        await priceRepo.delete({ serviceId: service.id });
        await priceRepo.save([
          priceRepo.create({
            serviceId: service.id,
            rateType: RateType.GENERAL,
            currency: CurrencyCode.DOP,
            unitPrice: Number(dto.priceDop || 0),
          }),
          priceRepo.create({
            serviceId: service.id,
            rateType: RateType.GENERAL,
            currency: CurrencyCode.USD,
            unitPrice: Number(dto.priceUsd || 0),
          }),
          priceRepo.create({
            serviceId: service.id,
            rateType: RateType.CHILD,
            currency: CurrencyCode.DOP,
            unitPrice: Number(dto.childPriceDop ?? Math.round(Number(dto.priceDop || 0) * 0.6)),
          }),
        ]);
        await this.logAudit(user, 'PRICE_CHANGED', 'services', service.id, {
          oldPrice,
          newPriceDop: dto.priceDop,
          newPriceUsd: dto.priceUsd,
        });
      }

      await this.logAudit(user, 'SERVICE_MODIFIED', 'services', service.id, { code: service.code, name: service.name });
    } else {
      service = await serviceRepo.save(
        serviceRepo.create({
          categoryId: dto.categoryId,
          code: dto.code,
          name: dto.name,
          description: dto.description || '',
          taxSettingId: dto.taxSettingId || defaultTax?.id,
          durationMinutes: Number(dto.durationMinutes || 45),
          capacityPerShift: Number(dto.capacityPerShift || 30),
          requiresSafetyCheck: !!dto.requiresSafetyCheck,
          accessPointName: dto.accessPointName || 'Control de Actividad',
          restrictionsText: dto.restrictionsText || 'Seguir instrucciones del operador.',
          instructionsText: dto.instructionsText || 'Presente este código QR en el punto de control.',
          status: dto.status || 'ACTIVE',
        })
      );

      await priceRepo.save([
        priceRepo.create({
          serviceId: service.id,
          rateType: RateType.GENERAL,
          currency: CurrencyCode.DOP,
          unitPrice: Number(dto.priceDop || 500),
        }),
        priceRepo.create({
          serviceId: service.id,
          rateType: RateType.GENERAL,
          currency: CurrencyCode.USD,
          unitPrice: Number(dto.priceUsd || 10),
        }),
        priceRepo.create({
          serviceId: service.id,
          rateType: RateType.CHILD,
          currency: CurrencyCode.DOP,
          unitPrice: Number(dto.childPriceDop ?? Math.round(Number(dto.priceDop || 500) * 0.6)),
        }),
      ]);

      await this.logAudit(user, 'SERVICE_CREATED', 'services', service.id, {
        code: service.code,
        name: service.name,
        priceDop: dto.priceDop,
      });
    }

    return serviceRepo.findOne({ where: { id: service.id } });
  }

  async createOrUpdatePackage(dto: any, user: AuthUserPayload) {
    const pkgRepo = this.dataSource.getRepository(TourPackage);
    const pkgItemRepo = this.dataSource.getRepository(PackageItem);
    const taxRepo = this.dataSource.getRepository(TaxSetting);
    const defaultTax = await taxRepo.findOne({ where: { isDefault: true } });

    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('El paquete turístico debe incluir al menos una actividad.');
    }

    let pkg: TourPackage;
    if (dto.id) {
      pkg = await pkgRepo.findOne({ where: { id: dto.id } });
      if (!pkg) throw new NotFoundException('Paquete no encontrado.');
      Object.assign(pkg, {
        code: dto.code ?? pkg.code,
        name: dto.name ?? pkg.name,
        description: dto.description ?? pkg.description,
        priceDop: Number(dto.priceDop ?? pkg.priceDop),
        priceUsd: Number(dto.priceUsd ?? pkg.priceUsd),
        status: dto.status ?? pkg.status,
      });
      pkg = await pkgRepo.save(pkg);
      await pkgItemRepo.delete({ packageId: pkg.id });
    } else {
      pkg = await pkgRepo.save(
        pkgRepo.create({
          code: dto.code,
          name: dto.name,
          description: dto.description || '',
          priceDop: Number(dto.priceDop),
          priceUsd: Number(dto.priceUsd),
          taxSettingId: dto.taxSettingId || defaultTax?.id,
          status: dto.status || 'ACTIVE',
        })
      );
    }

    const ratio = Number((1 / dto.items.length).toFixed(4));
    await pkgItemRepo.save(
      dto.items.map((item: { serviceId: string; quantityPerPackage?: number }) =>
        pkgItemRepo.create({
          packageId: pkg.id,
          serviceId: item.serviceId,
          quantityPerPackage: Number(item.quantityPerPackage || 1),
          allocatedPriceRatio: ratio,
        })
      )
    );

    await this.logAudit(user, 'PACKAGE_SAVED', 'packages', pkg.id, { code: pkg.code, name: pkg.name });
    return pkgRepo.findOne({ where: { id: pkg.id } });
  }

  // ==================== FASE 5, 6, 7, 8: POS, FACTURACIÓN, PAGOS Y TICKETS QR ====================
  async createPosSaleAndTickets(dto: any, user: AuthUserPayload, idempotencyHeader?: string) {
    const idempotencyKey = (idempotencyHeader || dto.idempotencyKey || '').trim();
    if (!idempotencyKey) {
      throw new BadRequestException('Falta clave de idempotencia (idempotencyKey) para proteger contra cobros duplicados.');
    }

    // 1. Verificar idempotencia antes de abrir transacción
    const existingSale = await this.dataSource.getRepository(Sale).findOne({
      where: { idempotencyKey },
      relations: ['items', 'participants', 'payments', 'tickets'],
    });
    if (existingSale) {
      return existingSale;
    }

    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('La venta debe contener al menos un servicio o paquete.');
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Re-verificar dentro de la transacción
        const doubleCheck = await manager.getRepository(Sale).findOne({
          where: { idempotencyKey },
          relations: ['items', 'participants', 'payments', 'tickets'],
        });
        if (doubleCheck) return doubleCheck;

        const company = await manager.getRepository(CompanySetting).findOne({ where: {} });
        const exchangeRate = Number(dto.exchangeRate || company?.exchangeRateUsdToDop || 60.5);

        // Obtener empleado
        let employee = user.employeeId
          ? await manager.getRepository(Employee).findOne({ where: { id: user.employeeId } })
          : null;
        if (!employee) {
          employee = await manager.getRepository(Employee).findOne({ where: {} });
        }

        // Obtener y validar obligatoriamente sesión de caja abierta antes de permitir vender
        const openSessions = await manager.getRepository(CashSession).find({
          where: { status: CashSessionStatus.OPEN },
          order: { openedAt: 'DESC' },
        });

        const openSession =
          openSessions.find(
            (s) => s.openedByUserId === user.id || (employee && s.employeeId === employee.id)
          ) ||
          (user.roleCode === RoleCode.ADMIN || user.roleCode === RoleCode.MANAGER
            ? openSessions[0]
            : null);

        if (!openSession) {
          throw new BadRequestException(
            'CAJA CERRADA: No se puede realizar ninguna venta sin antes abrir la caja. Diríjase al módulo "Caja DOP/USD" y realice la apertura de su turno.'
          );
        }

        // Numeración consecutiva de factura
        const salesCount = await manager.getRepository(Sale).count();
        const invoiceNumber = `FAC-2026-${String(salesCount + 1).padStart(6, '0')}`;

        // Numeración NCF (Módulo Fiscal RD)
        const ncfType: NcfType = dto.ncfType || NcfType.B02;
        let ncfNumber: string | null = null;
        if (ncfType !== NcfType.NONE) {
          const seq = await manager
            .getRepository(FiscalSequence)
            .createQueryBuilder('seq')
            .setLock('pessimistic_write')
            .where('seq.ncf_type = :ncfType', { ncfType })
            .getOne();
          if (seq) {
            ncfNumber = `${seq.prefix}${String(seq.currentNumber).padStart(8, '0')}`;
            seq.currentNumber += 1;
            await manager.save(FiscalSequence, seq);
          }
        }

        // Procesar líneas y calcular importes + cantidad esperada de tickets
        let subtotalDop = 0;
        let totalTaxDop = 0;
        const saleItemsToSave: Partial<SaleItem>[] = [];
        const lineTicketPlans: Array<{
          itemIndex: number;
          service: Service;
          sourcePackageId: string | null;
          quantity: number;
          assignedParticipantIndices?: number[];
        }> = [];

        for (let idx = 0; idx < dto.items.length; idx++) {
          const rawItem = dto.items[idx];
          const quantity = Math.max(1, Number(rawItem.quantity || 1));
          const itemType: 'SERVICE' | 'PACKAGE' = rawItem.itemType === 'PACKAGE' ? 'PACKAGE' : 'SERVICE';
          const rateType: RateType = rawItem.rateType || RateType.GENERAL;

          if (itemType === 'SERVICE') {
            const service = await manager.getRepository(Service).findOne({ where: { id: rawItem.serviceId } });
            if (!service) throw new NotFoundException(`Servicio no encontrado: ${rawItem.serviceId}`);

            const priceRecord =
              service.prices?.find((p) => p.currency === CurrencyCode.DOP && p.rateType === rateType) ||
              service.prices?.find((p) => p.currency === CurrencyCode.DOP);

            const unitPriceDop =
              rawItem.unitPriceDop !== undefined ? Number(rawItem.unitPriceDop) : Number(priceRecord?.unitPrice || 0);
            const unitPriceUsd = Number((unitPriceDop / exchangeRate).toFixed(2));
            const lineSub = unitPriceDop * quantity;
            const taxRate = Number(service.taxSetting?.ratePercentage ?? 18);
            const lineTax = Number(((lineSub * taxRate) / 100).toFixed(2));
            const lineTotal = Number((lineSub + lineTax).toFixed(2));

            subtotalDop += lineSub;
            totalTaxDop += lineTax;

            saleItemsToSave.push({
              itemType: 'SERVICE',
              serviceId: service.id,
              packageId: null,
              rateType,
              descriptionSnapshot: service.name,
              quantity,
              unitPriceDop,
              unitPriceUsd,
              discountAmountDop: 0,
              taxRateApplied: taxRate,
              taxAmountDop: lineTax,
              lineTotalDop: lineTotal,
              ticketsExpectedCount: quantity,
            });

            lineTicketPlans.push({
              itemIndex: idx,
              service,
              sourcePackageId: null,
              quantity,
              assignedParticipantIndices: rawItem.assignedParticipantIndices,
            });
          } else {
            const pkg = await manager.getRepository(TourPackage).findOne({
              where: { id: rawItem.packageId },
              relations: ['items', 'items.service', 'taxSetting'],
            });
            if (!pkg) throw new NotFoundException(`Paquete turístico no encontrado: ${rawItem.packageId}`);

            const unitPriceDop = Number(pkg.priceDop);
            const unitPriceUsd = Number(pkg.priceUsd || (unitPriceDop / exchangeRate).toFixed(2));
            const lineSub = unitPriceDop * quantity;
            const taxRate = Number(pkg.taxSetting?.ratePercentage ?? 18);
            const lineTax = Number(((lineSub * taxRate) / 100).toFixed(2));
            const lineTotal = Number((lineSub + lineTax).toFixed(2));

            const ticketsPerPkg = pkg.items.reduce((acc, pi) => acc + Number(pi.quantityPerPackage || 1), 0);
            const expectedTickets = quantity * ticketsPerPkg;

            subtotalDop += lineSub;
            totalTaxDop += lineTax;

            saleItemsToSave.push({
              itemType: 'PACKAGE',
              serviceId: null,
              packageId: pkg.id,
              rateType,
              descriptionSnapshot: pkg.name,
              quantity,
              unitPriceDop,
              unitPriceUsd,
              discountAmountDop: 0,
              taxRateApplied: taxRate,
              taxAmountDop: lineTax,
              lineTotalDop: lineTotal,
              ticketsExpectedCount: expectedTickets,
            });

            for (const pkgItem of pkg.items) {
              lineTicketPlans.push({
                itemIndex: idx,
                service: pkgItem.service,
                sourcePackageId: pkg.id,
                quantity: quantity * Number(pkgItem.quantityPerPackage || 1),
                assignedParticipantIndices: rawItem.assignedParticipantIndices,
              });
            }
          }
        }

        // Descuento autorizado
        const discountAmountDop = Math.max(0, Number(dto.discountAmountDop || 0));
        if (discountAmountDop > 0) {
          const netRatio = Math.max(0, (subtotalDop - discountAmountDop) / (subtotalDop || 1));
          totalTaxDop = Number((totalTaxDop * netRatio).toFixed(2));
        }

        const totalDop = Number(Math.max(0, subtotalDop - discountAmountDop + totalTaxDop).toFixed(2));
        const totalUsd = Number((totalDop / exchangeRate).toFixed(2));

        // Evaluar pagos recibidos
        const rawPayments: Array<{
          paymentMethodCode: PaymentMethodCode;
          amountOriginal: number;
          referenceNumber?: string;
        }> = Array.isArray(dto.payments) ? dto.payments : [];

        const paymentMethods = await manager.getRepository(PaymentMethod).find();
        const pmByCode = Object.fromEntries(paymentMethods.map((pm) => [pm.code, pm]));

        let paidAmountDop = 0;
        const paymentsToCreate: Partial<Payment>[] = [];

        for (const p of rawPayments) {
          const amt = Number(p.amountOriginal || 0);
          if (amt <= 0) continue;
          const pm = pmByCode[p.paymentMethodCode];
          if (!pm) throw new BadRequestException(`Método de pago inválido: ${p.paymentMethodCode}`);

          const isUsd = pm.currency === CurrencyCode.USD || p.paymentMethodCode === PaymentMethodCode.CASH_USD;
          const rate = isUsd ? exchangeRate : 1;
          const dopEquiv = Number((amt * rate).toFixed(2));
          paidAmountDop += dopEquiv;

          paymentsToCreate.push({
            cashSessionId: openSession?.id ?? null,
            paymentMethodId: pm.id,
            currency: isUsd ? CurrencyCode.USD : CurrencyCode.DOP,
            amountOriginal: amt,
            exchangeRate: rate,
            amountDopEquivalent: dopEquiv,
            referenceNumber: p.referenceNumber || null,
            status: 'COMPLETED',
            createdByUserId: user.id,
          });
        }

        paidAmountDop = Number(paidAmountDop.toFixed(2));
        const changeGivenDop = paidAmountDop > totalDop ? Number((paidAmountDop - totalDop).toFixed(2)) : 0;

        let saleStatus: SaleStatus = SaleStatus.PAID;
        if (dto.status === SaleStatus.PENDING_PAYMENT || paidAmountDop === 0) {
          saleStatus = SaleStatus.PENDING_PAYMENT;
        } else if (paidAmountDop + 0.5 < totalDop) {
          saleStatus = SaleStatus.PARTIALLY_PAID;
        }

        const adminAccessOverride = !!dto.adminAccessOverride && (
          user.roleCode === RoleCode.ADMIN ||
          user.roleCode === RoleCode.MANAGER ||
          user.permissions?.includes('ticket:override_unpaid')
        );

        // Guardar Venta / Factura
        const saleRepo = manager.getRepository(Sale);
        const savedSale = await saleRepo.save(
          saleRepo.create({
            invoiceNumber,
            idempotencyKey,
            cashSessionId: openSession?.id ?? null,
            employeeId: employee.id,
            customerName: dto.customerName || null,
            customerRncCedula: dto.customerRncCedula || null,
            customerPhone: dto.customerPhone || null,
            customerEmail: dto.customerEmail || null,
            ncfType,
            ncfNumber,
            currency: dto.currency || CurrencyCode.DOP,
            exchangeRateApplied: exchangeRate,
            adultCount: Number(dto.adultCount ?? 1),
            childCount: Number(dto.childCount ?? 0),
            subtotalDop: Number(subtotalDop.toFixed(2)),
            discountAmountDop,
            discountReason: dto.discountReason || null,
            taxAmountDop: totalTaxDop,
            totalDop,
            totalUsd,
            paidAmountDop,
            changeGivenDop,
            status: saleStatus,
            adminAccessOverride,
          })
        );

        // Guardar SaleItems
        const saleItemRepo = manager.getRepository(SaleItem);
        const savedItems: SaleItem[] = [];
        for (const itemData of saleItemsToSave) {
          const savedItem = await saleItemRepo.save(
            saleItemRepo.create({
              ...itemData,
              saleId: savedSale.id,
            })
          );
          savedItems.push(savedItem);
        }

        // Guardar Participantes (Nominales o Rápidos sin nombre)
        const participantRepo = manager.getRepository(SaleParticipant);
        const visitorRepo = manager.getRepository(Visitor);
        const savedParticipants: SaleParticipant[] = [];

        const rawParticipants: Array<{
          displayName?: string;
          participantType?: VisitorType;
          nationality?: string;
          documentNumber?: string;
        }> = Array.isArray(dto.participants) ? dto.participants : [];

        const totalDeclaredVisitors = Math.max(
          rawParticipants.length,
          Number(dto.adultCount || 0) + Number(dto.childCount || 0),
          1
        );

        for (let pIdx = 0; pIdx < totalDeclaredVisitors; pIdx++) {
          const rawP = rawParticipants[pIdx];
          const cleanName = rawP?.displayName?.trim() || null;
          const pType =
            rawP?.participantType ||
            (pIdx < Number(dto.adultCount ?? 1) ? VisitorType.ADULT : VisitorType.CHILD);

          let visitorId: string | null = null;
          if (cleanName) {
            const savedVisitor = await visitorRepo.save(
              visitorRepo.create({
                fullName: cleanName,
                nationality: rawP?.nationality || 'Dominicana',
                documentNumber: rawP?.documentNumber || null,
                visitorType: pType,
              })
            );
            visitorId = savedVisitor.id;
          }

          const savedP = await participantRepo.save(
            participantRepo.create({
              saleId: savedSale.id,
              visitorId,
              participantIndex: pIdx + 1,
              displayName: cleanName,
              participantType: pType,
              nationality: rawP?.nationality || null,
            })
          );
          savedParticipants.push(savedP);
        }

        // Guardar Pagos y Actualizar Sesión de Caja
        const paymentRepo = manager.getRepository(Payment);
        const cashMovRepo = manager.getRepository(CashMovement);

        for (const pData of paymentsToCreate) {
          const savedPay = await paymentRepo.save(
            paymentRepo.create({
              ...pData,
              saleId: savedSale.id,
            })
          );

          if (openSession) {
            const pm = paymentMethods.find((m) => m.id === pData.paymentMethodId);
            if (pm?.code === PaymentMethodCode.CASH_DOP) {
              const netCashDop = Number(pData.amountOriginal) - changeGivenDop;
              openSession.expectedCashDop = Number((Number(openSession.expectedCashDop) + netCashDop).toFixed(2));
            } else if (pm?.code === PaymentMethodCode.CASH_USD) {
              openSession.expectedCashUsd = Number(
                (Number(openSession.expectedCashUsd) + Number(pData.amountOriginal)).toFixed(2)
              );
              if (changeGivenDop > 0) {
                openSession.expectedCashDop = Number(
                  (Number(openSession.expectedCashDop) - changeGivenDop).toFixed(2)
                );
              }
            } else if (pm?.code === PaymentMethodCode.CARD) {
              openSession.expectedCardDop = Number(
                (Number(openSession.expectedCardDop) + Number(pData.amountDopEquivalent)).toFixed(2)
              );
            } else if (pm?.code === PaymentMethodCode.TRANSFER) {
              openSession.expectedTransferDop = Number(
                (Number(openSession.expectedTransferDop) + Number(pData.amountDopEquivalent)).toFixed(2)
              );
            }

            await cashMovRepo.save(
              cashMovRepo.create({
                cashSessionId: openSession.id,
                saleId: savedSale.id,
                paymentId: savedPay.id,
                movementType: CashMovementType.SALE_IN,
                currency: pData.currency,
                amount: Number(pData.amountOriginal),
                amountDopEquivalent: Number(pData.amountDopEquivalent),
                reason: `Cobro Factura ${invoiceNumber} (${pm?.name})`,
                authorizedByUserId: user.id,
              })
            );
          }
        }

        if (openSession) {
          await manager.save(CashSession, openSession);
        }

        // ==================== FASE 7 & 8: GENERACIÓN AUTOMÁTICA DE TICKETS INDIVIDUALES QR ====================
        const ticketStatus =
          saleStatus === SaleStatus.PAID || adminAccessOverride ? TicketStatus.AVAILABLE : TicketStatus.ISSUED;

        const todayStr = this.getTodayRdString();
        const validUntilStr = dto.validUntil || todayStr;
        const existingTicketCount = await manager.getRepository(Ticket).count();
        const totalExpectedTickets = savedItems.reduce((acc, it) => acc + Number(it.ticketsExpectedCount), 0);

        const ticketsToCreate: Ticket[] = [];
        const ticketRepo = manager.getRepository(Ticket);
        let sequenceInSale = 1;

        for (const plan of lineTicketPlans) {
          const parentSaleItem = savedItems[plan.itemIndex];
          for (let unitIdx = 0; unitIdx < plan.quantity; unitIdx++) {
            const globalSeq = existingTicketCount + sequenceInSale;
            const dateCompact = todayStr.replace(/-/g, '');
            const ticketNumber = `TKT-${dateCompact}-${String(globalSeq).padStart(6, '0')}`;
            const { qrPayload, qrTokenHash } = buildSignedQrPayload(ticketNumber);

            // Resolver participante asignado a este ticket individual
            let participant: SaleParticipant | null = null;
            if (Array.isArray(plan.assignedParticipantIndices) && plan.assignedParticipantIndices[unitIdx] !== undefined) {
              const targetIdx = plan.assignedParticipantIndices[unitIdx];
              participant = savedParticipants[targetIdx] || null;
            } else if (savedParticipants.length > 0) {
              participant = savedParticipants[unitIdx % savedParticipants.length] || null;
            }

            const visitorLabel =
              participant?.displayName ||
              (savedSale.customerName
                ? `${savedSale.customerName} (Visitante #${(unitIdx % savedParticipants.length) + 1})`
                : null);

            ticketsToCreate.push(
              ticketRepo.create({
                ticketNumber,
                qrTokenHash,
                qrPayload,
                saleId: savedSale.id,
                saleItemId: parentSaleItem.id,
                serviceId: plan.service.id,
                sourcePackageId: plan.sourcePackageId,
                saleParticipantId: participant?.id ?? null,
                visitorNameSnapshot: visitorLabel,
                participantType: participant?.participantType ?? VisitorType.ADULT,
                sequenceInSale,
                totalInSale: totalExpectedTickets,
                status: ticketStatus,
                validFrom: todayStr,
                validUntil: validUntilStr,
                instructionsSnapshot: plan.service.instructionsText || company?.ticketFooterInstructions,
                restrictionsSnapshot: plan.service.restrictionsText,
              })
            );
            sequenceInSale++;
          }
        }

        // Regla de control estricto: no emitir ni más ni menos tickets que los adquiridos
        if (ticketsToCreate.length !== totalExpectedTickets) {
          throw new ConflictException(
            `Error de integridad transaccional: se esperaban ${totalExpectedTickets} tickets y se generaron ${ticketsToCreate.length}.`
          );
        }

        await ticketRepo.save(ticketsToCreate);

        await this.logAudit(
          user,
          'SALE_CREATED',
          'sales',
          savedSale.id,
          {
            invoiceNumber: savedSale.invoiceNumber,
            ncfNumber: savedSale.ncfNumber,
            totalDop: savedSale.totalDop,
            ticketsGenerated: ticketsToCreate.length,
            status: savedSale.status,
          },
          manager
        );

        return await manager.getRepository(Sale).findOne({
          where: { id: savedSale.id },
          relations: ['items', 'participants', 'payments', 'tickets'],
        });
      });
    } catch (err: any) {
      // Si hubo carrera de idempotencia concurrente en PostgreSQL (código 23505 unique_violation), devolver la venta creada
      if (err?.code === '23505' && idempotencyKey) {
        const concurrentSale = await this.dataSource.getRepository(Sale).findOne({
          where: { idempotencyKey },
          relations: ['items', 'participants', 'payments', 'tickets'],
        });
        if (concurrentSale) return concurrentSale;
      }
      throw err;
    }
  }

  // ==================== ANULACIÓN DE FACTURAS Y NOTAS DE CRÉDITO (REGLAS #9 Y #10) ====================
  async voidOrRefundSale(saleId: string, reason: string, user: AuthUserPayload) {
    if (!reason || reason.trim().length < 4) {
      throw new BadRequestException('Debe especificar el motivo de la anulación o nota de crédito.');
    }

    return await this.dataSource.transaction(async (manager) => {
      const sale = await manager.getRepository(Sale).findOne({
        where: { id: saleId },
        relations: ['tickets', 'payments'],
      });
      if (!sale) throw new NotFoundException('Factura no encontrada.');
      if (sale.status === SaleStatus.VOIDED || sale.status === SaleStatus.REFUNDED) {
        throw new BadRequestException('Esta factura ya fue anulada o reembolsada anteriormente.');
      }

      // Emitir Nota de Crédito B04 si tenía NCF
      let creditNoteNumber: string | null = null;
      const b04Seq = await manager
        .getRepository(FiscalSequence)
        .createQueryBuilder('seq')
        .setLock('pessimistic_write')
        .where('seq.ncf_type = :t', { t: NcfType.B04 })
        .getOne();
      if (b04Seq) {
        creditNoteNumber = `${b04Seq.prefix}${String(b04Seq.currentNumber).padStart(8, '0')}`;
        b04Seq.currentNumber += 1;
        await manager.save(FiscalSequence, b04Seq);
      }

      // Reglas #9 y #10:
      // - Invalidar (CANCELLED) únicamente los tickets NO utilizados (AVAILABLE o ISSUED).
      // - Los tickets YA UTILIZADOS (USED) conservan su estado USED y su historial de validación intacto.
      let cancelledTicketsCount = 0;
      let preservedUsedTicketsCount = 0;

      for (const ticket of sale.tickets) {
        if (ticket.status === TicketStatus.USED) {
          preservedUsedTicketsCount++;
        } else if (ticket.status !== TicketStatus.CANCELLED) {
          ticket.status = TicketStatus.CANCELLED;
          ticket.cancelledAt = new Date();
          ticket.cancelReason = `Factura ${sale.invoiceNumber} anulada: ${reason}`;
          await manager.save(Ticket, ticket);
          cancelledTicketsCount++;
        }
      }

      sale.status = preservedUsedTicketsCount > 0 ? SaleStatus.REFUNDED : SaleStatus.VOIDED;
      sale.voidReason = reason;
      sale.voidedByUserId = user.id;
      sale.voidedAt = new Date();
      sale.creditNoteNumber = creditNoteNumber;
      await manager.save(Sale, sale);

      // Actualizar pagos y registrar salida en sesión de caja si estaba pagada en efectivo
      const openSession = await manager.getRepository(CashSession).findOne({
        where: { status: CashSessionStatus.OPEN },
        order: { openedAt: 'DESC' },
      });

      for (const payment of sale.payments) {
        payment.status = sale.status === SaleStatus.REFUNDED ? 'REFUNDED' : 'VOIDED';
        await manager.save(Payment, payment);

        if (openSession && payment.paymentMethod?.code === PaymentMethodCode.CASH_DOP) {
          openSession.expectedCashDop = Number(
            (Number(openSession.expectedCashDop) - Number(payment.amountOriginal)).toFixed(2)
          );
          await manager.getRepository(CashMovement).save(
            manager.getRepository(CashMovement).create({
              cashSessionId: openSession.id,
              saleId: sale.id,
              paymentId: payment.id,
              movementType: CashMovementType.REFUND_OUT,
              currency: CurrencyCode.DOP,
              amount: Number(payment.amountOriginal),
              amountDopEquivalent: Number(payment.amountDopEquivalent),
              reason: `Anulación/Reembolso ${sale.invoiceNumber} (${creditNoteNumber || 'S/N'}): ${reason}`,
              authorizedByUserId: user.id,
            })
          );
        }
      }

      if (openSession) {
        await manager.save(CashSession, openSession);
      }

      await this.logAudit(
        user,
        'SALE_VOIDED',
        'sales',
        sale.id,
        {
          invoiceNumber: sale.invoiceNumber,
          creditNoteNumber,
          reason,
          cancelledTicketsCount,
          preservedUsedTicketsCount,
        },
        manager
      );

      return {
        sale,
        cancelledTicketsCount,
        preservedUsedTicketsCount,
        creditNoteNumber,
      };
    });
  }

  // Autorizar uso de tickets de una venta pendiente de pago (Regla Sección 2)
  async authorizeUnpaidSaleTickets(saleId: string, user: AuthUserPayload) {
    return await this.dataSource.transaction(async (manager) => {
      const sale = await manager.getRepository(Sale).findOne({
        where: { id: saleId },
        relations: ['tickets'],
      });
      if (!sale) throw new NotFoundException('Venta no encontrada.');

      sale.adminAccessOverride = true;
      await manager.save(Sale, sale);

      for (const ticket of sale.tickets) {
        if (ticket.status === TicketStatus.ISSUED) {
          ticket.status = TicketStatus.AVAILABLE;
          await manager.save(Ticket, ticket);
        }
      }

      await this.logAudit(
        user,
        'ADMIN_OVERRIDE_UNPAID_TICKETS',
        'sales',
        sale.id,
        { invoiceNumber: sale.invoiceNumber },
        manager
      );

      return sale;
    });
  }

  // ==================== FASE 9: ESCANEO Y VALIDACIÓN QR ATÓMICA ====================
  async inspectTicketByQrOrNumber(codeOrQr: string) {
    const clean = (codeOrQr || '').trim();
    if (!clean) throw new BadRequestException('Debe proporcionar un código QR o número de ticket.');

    const ticketRepo = this.dataSource.getRepository(Ticket);
    let ticket: Ticket | null = null;

    if (clean.startsWith('MRP1.')) {
      const signatureValid = verifySignedQrPayload(clean);
      if (!signatureValid) {
        return {
          validSignature: false,
          code: ValidationResultCode.REJECTED_INVALID_QR,
          message: 'Firma criptográfica del código QR inválida o adulterada.',
          ticket: null,
        };
      }
      const tokenHash = sha256Hash(clean);
      ticket = await ticketRepo.findOne({
        where: { qrTokenHash: tokenHash },
        relations: ['sale', 'service', 'sourcePackage', 'saleParticipant'],
      });
    } else {
      ticket = await ticketRepo.findOne({
        where: [{ ticketNumber: clean }, { qrPayload: clean }],
        relations: ['sale', 'service', 'sourcePackage', 'saleParticipant'],
      });
    }

    if (!ticket) {
      return {
        validSignature: false,
        code: ValidationResultCode.REJECTED_INVALID_QR,
        message: 'El ticket escaneado no existe en la base de datos.',
        ticket: null,
      };
    }

    const previousValidations = await this.dataSource.getRepository(TicketValidation).find({
      where: { ticketId: ticket.id },
      order: { validatedAt: 'DESC' },
    });

    const approvedValidation = previousValidations.find((v) => v.validationResult === ValidationResultCode.APPROVED);

    return {
      validSignature: true,
      ticket,
      approvedValidation: approvedValidation || null,
      validationHistory: previousValidations,
    };
  }

  /**
   * VALIDACIÓN ATÓMICA CON BLOQUEO PESIMISTA (SELECT ... FOR UPDATE)
   * Impide que dos empleados utilicen el mismo ticket simultáneamente.
   */
  async validateAndConsumeTicketAtomically(dto: {
    qrOrTicketCode: string;
    stationServiceId?: string;
    accessPoint?: string;
    deviceInfo?: string;
    safetyInstructionsAccepted?: boolean;
    safetyHarnessChecked?: boolean;
    safetyHelmetChecked?: boolean;
    operatorNotes?: string;
  }, user: AuthUserPayload) {
    const clean = (dto.qrOrTicketCode || '').trim();
    if (!clean) {
      throw new BadRequestException('Código QR vacío.');
    }

    // Si es un payload QR firmado MRP1.*, verificar HMAC antes de tocar la base de datos
    if (clean.startsWith('MRP1.') && !verifySignedQrPayload(clean)) {
      await this.recordValidationRow(
        this.dataSource.manager,
        null,
        dto.stationServiceId || null,
        user,
        ValidationResultCode.REJECTED_INVALID_QR,
        null,
        null,
        dto
      );
      return {
        allowed: false,
        resultCode: ValidationResultCode.REJECTED_INVALID_QR,
        message: 'ACCESO DENEGADO: Código QR inválido o firma criptográfica alterada.',
      };
    }

    return await this.dataSource.transaction(async (manager) => {
      // 1. Bloqueo pesimista sobre la fila del ticket en PostgreSQL (SELECT ... FOR UPDATE)
      // Nota: PostgreSQL no permite FOR UPDATE sobre el lado anulable de un LEFT JOIN,
      // por lo que bloqueamos primero la fila en la tabla `tickets` y luego cargamos relaciones.
      const qb = manager
        .getRepository(Ticket)
        .createQueryBuilder('ticket')
        .setLock('pessimistic_write');

      if (clean.startsWith('MRP1.')) {
        qb.where('ticket.qr_token_hash = :hash', { hash: sha256Hash(clean) });
      } else {
        qb.where('ticket.ticket_number = :num OR ticket.qr_payload = :num', { num: clean });
      }

      const lockedTicketRow = await qb.getOne();

      if (!lockedTicketRow) {
        await this.recordValidationRow(
          manager,
          null,
          dto.stationServiceId || null,
          user,
          ValidationResultCode.REJECTED_INVALID_QR,
          null,
          null,
          dto
        );
        return {
          allowed: false,
          resultCode: ValidationResultCode.REJECTED_INVALID_QR,
          message: 'ACCESO DENEGADO: Ticket no encontrado en el sistema.',
        };
      }

      const ticket = await manager.getRepository(Ticket).findOneOrFail({
        where: { id: lockedTicketRow.id },
        relations: ['sale', 'service', 'sourcePackage'],
      });

      const accessPoint = dto.accessPoint || ticket.service?.accessPointName || 'Punto de Control QR';

      // 2. Verificar que corresponda a la actividad de la estación (si el operador filtró su estación)
      if (dto.stationServiceId && ticket.serviceId !== dto.stationServiceId) {
        await this.recordValidationRow(
          manager,
          ticket,
          dto.stationServiceId,
          user,
          ValidationResultCode.REJECTED_WRONG_ACTIVITY,
          ticket.status,
          ticket.status,
          dto
        );
        return {
          allowed: false,
          resultCode: ValidationResultCode.REJECTED_WRONG_ACTIVITY,
          message: `ACTIVIDAD INCORRECTA: Este ticket es para "${ticket.service.name}", no para la actividad seleccionada.`,
          ticket,
        };
      }

      // 3. Si YA FUE UTILIZADO -> Mostrar alerta con fecha, hora, operador y lugar de la validación anterior
      if (ticket.status === TicketStatus.USED) {
        const firstApproval = await manager.getRepository(TicketValidation).findOne({
          where: { ticketId: ticket.id, validationResult: ValidationResultCode.APPROVED },
          relations: ['validatedByUser'],
        });

        await this.recordValidationRow(
          manager,
          ticket,
          ticket.serviceId,
          user,
          ValidationResultCode.REJECTED_ALREADY_USED,
          TicketStatus.USED,
          TicketStatus.USED,
          dto
        );

        return {
          allowed: false,
          resultCode: ValidationResultCode.REJECTED_ALREADY_USED,
          message: 'ALERTA DE SEGURIDAD: Este ticket YA FUE UTILIZADO anteriormente. No permitir reingreso.',
          previousUse: {
            usedAt: ticket.usedAt,
            accessPoint: ticket.usedAtAccessPoint,
            validatedBy: ticket.usedByUsername || firstApproval?.validatedByUser?.username || 'Operador',
          },
          ticket,
        };
      }

      // 4. Si está ANULADO
      if (ticket.status === TicketStatus.CANCELLED || ticket.sale.status === SaleStatus.VOIDED) {
        await this.recordValidationRow(
          manager,
          ticket,
          ticket.serviceId,
          user,
          ValidationResultCode.REJECTED_CANCELLED,
          ticket.status,
          ticket.status,
          dto
        );
        return {
          allowed: false,
          resultCode: ValidationResultCode.REJECTED_CANCELLED,
          message: `ACCESO DENEGADO: Ticket ANULADO (${ticket.cancelReason || 'Factura anulada'}).`,
          ticket,
        };
      }

      // 5. Si está VENCIDO
      const todayStr = this.getTodayRdString();
      if (ticket.status === TicketStatus.EXPIRED || todayStr > ticket.validUntil) {
        const prev = ticket.status;
        ticket.status = TicketStatus.EXPIRED;
        await manager.save(Ticket, ticket);

        await this.recordValidationRow(
          manager,
          ticket,
          ticket.serviceId,
          user,
          ValidationResultCode.REJECTED_EXPIRED,
          prev,
          TicketStatus.EXPIRED,
          dto
        );
        return {
          allowed: false,
          resultCode: ValidationResultCode.REJECTED_EXPIRED,
          message: `ACCESO DENEGADO: Ticket VENCIDO (Fecha límite de validez: ${ticket.validUntil}).`,
          ticket,
        };
      }

      // 6. Si NO ESTÁ PAGADO ni tiene autorización administrativa expresa
      const isPaidOrAuthorized =
        ticket.sale.status === SaleStatus.PAID || ticket.sale.adminAccessOverride === true;

      if (!isPaidOrAuthorized || ticket.status === TicketStatus.ISSUED) {
        await this.recordValidationRow(
          manager,
          ticket,
          ticket.serviceId,
          user,
          ValidationResultCode.REJECTED_UNPAID,
          ticket.status,
          ticket.status,
          dto
        );
        return {
          allowed: false,
          resultCode: ValidationResultCode.REJECTED_UNPAID,
          message: 'ACCESO DENEGADO: La factura asociada figura PENDIENTE DE PAGO y no posee autorización administrativa.',
          ticket,
        };
      }

      // 7. Si la actividad requiere controles de seguridad obligatorios (Zip Line, Buggies, etc.)
      if (ticket.service.requiresSafetyCheck) {
        if (!dto.safetyInstructionsAccepted || !dto.safetyHarnessChecked || !dto.safetyHelmetChecked) {
          await this.recordValidationRow(
            manager,
            ticket,
            ticket.serviceId,
            user,
            ValidationResultCode.REJECTED_SAFETY_CHECK,
            ticket.status,
            ticket.status,
            dto
          );
          return {
            allowed: false,
            requiresSafetyChecklist: true,
            resultCode: ValidationResultCode.REJECTED_SAFETY_CHECK,
            message: `CONTROL DE SEGURIDAD OBLIGATORIO: "${ticket.service.name}" exige confirmar aceptación de instrucciones, revisión de arnés y casco antes de validar el ticket.`,
            ticket,
          };
        }
      }

      // 8. VALIDACIÓN EXITOSA Y REGISTRO DE CONSUMO ATÓMICO
      const previousStatus = ticket.status;
      ticket.status = TicketStatus.USED;
      ticket.usedAt = new Date();
      ticket.usedByUserId = user.id;
      ticket.usedByUsername = user.employeeName || user.username;
      ticket.usedAtAccessPoint = accessPoint;
      await manager.save(Ticket, ticket);

      const validationRecord = await this.recordValidationRow(
        manager,
        ticket,
        ticket.serviceId,
        user,
        ValidationResultCode.APPROVED,
        previousStatus,
        TicketStatus.USED,
        { ...dto, accessPoint }
      );

      await this.logAudit(
        user,
        'QR_VALIDATED',
        'tickets',
        ticket.id,
        {
          ticketNumber: ticket.ticketNumber,
          service: ticket.service.name,
          visitor: ticket.visitorNameSnapshot,
          accessPoint,
        },
        manager
      );

      return {
        allowed: true,
        resultCode: ValidationResultCode.APPROVED,
        message: `ACCESO AUTORIZADO: Ticket ${ticket.ticketNumber} validado exitosamente para ${ticket.service.name}.`,
        validationRecord,
        ticket,
      };
    });
  }

  private async recordValidationRow(
    manager: DataSource['manager'],
    ticket: Ticket | null,
    serviceId: string | null,
    user: AuthUserPayload,
    result: ValidationResultCode,
    previousStatus: string | null,
    newStatus: string | null,
    dto: any
  ) {
    const repo = manager.getRepository(TicketValidation);
    return await repo.save(
      repo.create({
        ticketId: ticket?.id ?? null,
        serviceId: serviceId ?? ticket?.serviceId ?? null,
        validatedByUserId: user.id,
        validationResult: result,
        previousStatus,
        newStatus,
        accessPoint: dto.accessPoint || ticket?.service?.accessPointName || 'Terminal Escáner QR',
        deviceInfo: dto.deviceInfo || 'Terminal Web / Lector QR',
        safetyInstructionsAccepted: !!dto.safetyInstructionsAccepted,
        safetyHarnessChecked: !!dto.safetyHarnessChecked,
        safetyHelmetChecked: !!dto.safetyHelmetChecked,
        operatorNotes: dto.operatorNotes || null,
      })
    );
  }

  // ==================== FASE 9: CONTROL OPERATIVO E INCIDENCIAS DE ACTIVIDADES ====================
  async getActivitiesOperationalSummary(serviceId?: string) {
    const services = await this.dataSource.getRepository(Service).find({
      where: serviceId ? { id: serviceId } : {},
      order: { code: 'ASC' },
    });

    const tickets = await this.dataSource.getRepository(Ticket).find({
      where: serviceId ? { serviceId } : {},
      relations: ['sale', 'service'],
      order: { issuedAt: 'DESC' },
    });

    const incidents = await this.dataSource.getRepository(ActivityIncident).find({
      where: serviceId ? { serviceId } : {},
      order: { occurredAt: 'DESC' },
      take: 50,
    });

    const validations = await this.dataSource.getRepository(TicketValidation).find({
      where: serviceId ? { serviceId } : {},
      order: { validatedAt: 'DESC' },
      take: 80,
    });

    const byActivity = services.map((svc) => {
      const svcTickets = tickets.filter((t) => t.serviceId === svc.id);
      const sold = svcTickets.length;
      const available = svcTickets.filter((t) => t.status === TicketStatus.AVAILABLE).length;
      const used = svcTickets.filter((t) => t.status === TicketStatus.USED).length;
      const cancelled = svcTickets.filter((t) => t.status === TicketStatus.CANCELLED).length;
      return {
        service: svc,
        ticketsSold: sold,
        ticketsAvailable: available,
        ticketsUsed: used,
        ticketsCancelled: cancelled,
        participantsAttended: used,
        availableTicketsList: svcTickets.filter((t) => t.status === TicketStatus.AVAILABLE).slice(0, 30),
      };
    });

    return {
      indicators: {
        totalSold: tickets.length,
        totalAvailable: tickets.filter((t) => t.status === TicketStatus.AVAILABLE).length,
        totalUsed: tickets.filter((t) => t.status === TicketStatus.USED).length,
        totalCancelled: tickets.filter((t) => t.status === TicketStatus.CANCELLED).length,
        participantsAttended: tickets.filter((t) => t.status === TicketStatus.USED).length,
      },
      byActivity,
      incidents,
      recentValidations: validations,
    };
  }

  async reportActivityIncident(dto: any, user: AuthUserPayload) {
    const repo = this.dataSource.getRepository(ActivityIncident);
    const saved = await repo.save(
      repo.create({
        serviceId: dto.serviceId,
        ticketId: dto.ticketId || null,
        reportedByUserId: user.id,
        severity: dto.severity || IncidentSeverity.MEDIUM,
        incidentType: dto.incidentType || 'SAFETY_GEAR',
        description: dto.description,
        resolutionTaken: dto.resolutionTaken || null,
        status: dto.status || 'OPEN',
      })
    );
    await this.logAudit(user, 'INCIDENT_REPORTED', 'activity_incidents', saved.id, {
      serviceId: dto.serviceId,
      severity: saved.severity,
    });
    return repo.findOne({ where: { id: saved.id } });
  }

  // ==================== FASE 10: CAJA Y CONTROL FINANCIERO ====================
  async getCashControlStatus(user?: AuthUserPayload) {
    const registers = await this.dataSource.getRepository(CashRegister).find();
    const sessions = await this.dataSource.getRepository(CashSession).find({ order: { openedAt: 'DESC' }, take: 25 });
    const movements = await this.dataSource.getRepository(CashMovement).find({ order: { createdAt: 'DESC' }, take: 100 });

    const openSessions = sessions.filter((s) => s.status === CashSessionStatus.OPEN);
    let activeSession: CashSession | null = null;

    if (user) {
      activeSession =
        openSessions.find(
          (s) => s.openedByUserId === user.id || (user.employeeId && s.employeeId === user.employeeId)
        ) ||
        (user.roleCode === RoleCode.ADMIN || user.roleCode === RoleCode.MANAGER
          ? openSessions[0]
          : null) ||
        null;
    } else {
      activeSession = openSessions[0] || null;
    }

    return {
      registers,
      activeSession,
      sessions,
      movements: activeSession ? movements.filter((m) => m.cashSessionId === activeSession.id) : movements,
    };
  }

  async openCashSession(dto: any, user: AuthUserPayload) {
    const sessionRepo = this.dataSource.getRepository(CashSession);
    const existingOpenInRegister = await sessionRepo.findOne({
      where: { cashRegisterId: dto.cashRegisterId, status: CashSessionStatus.OPEN },
    });
    if (existingOpenInRegister) {
      throw new BadRequestException('Esta caja registradora ya tiene una sesión abierta actualmente.');
    }

    const existingOpenByUser = await sessionRepo.findOne({
      where: { openedByUserId: user.id, status: CashSessionStatus.OPEN },
    });
    if (existingOpenByUser) {
      throw new BadRequestException('Usted ya tiene una sesión de caja abierta en curso.');
    }

    let employee = user.employeeId
      ? await this.dataSource.getRepository(Employee).findOne({ where: { id: user.employeeId } })
      : null;
    if (!employee) {
      employee = await this.dataSource.getRepository(Employee).findOne({ where: {} });
    }

    const openingDop = Number(dto.openingAmountDop || 0);
    const openingUsd = Number(dto.openingAmountUsd || 0);

    const session = await sessionRepo.save(
      sessionRepo.create({
        cashRegisterId: dto.cashRegisterId,
        employeeId: employee.id,
        openedByUserId: user.id,
        status: CashSessionStatus.OPEN,
        openingAmountDop: openingDop,
        openingAmountUsd: openingUsd,
        expectedCashDop: openingDop,
        expectedCashUsd: openingUsd,
        expectedCardDop: 0,
        expectedTransferDop: 0,
        notes: dto.notes || 'Apertura de caja',
      })
    );

    const movRepo = this.dataSource.getRepository(CashMovement);
    if (openingDop > 0) {
      await movRepo.save(
        movRepo.create({
          cashSessionId: session.id,
          movementType: CashMovementType.OPENING,
          currency: CurrencyCode.DOP,
          amount: openingDop,
          amountDopEquivalent: openingDop,
          reason: 'Fondo inicial de apertura DOP',
          authorizedByUserId: user.id,
        })
      );
    }
    if (openingUsd > 0) {
      await movRepo.save(
        movRepo.create({
          cashSessionId: session.id,
          movementType: CashMovementType.OPENING,
          currency: CurrencyCode.USD,
          amount: openingUsd,
          amountDopEquivalent: openingUsd * 60.5,
          reason: 'Fondo inicial de apertura USD',
          authorizedByUserId: user.id,
        })
      );
    }

    await this.logAudit(user, 'CASH_SESSION_OPENED', 'cash_sessions', session.id, {
      openingDop,
      openingUsd,
    });

    return sessionRepo.findOne({ where: { id: session.id } });
  }

  async registerCashMovement(dto: any, user: AuthUserPayload) {
    const sessionRepo = this.dataSource.getRepository(CashSession);
    const session = await sessionRepo.findOne({ where: { id: dto.cashSessionId, status: CashSessionStatus.OPEN } });
    if (!session) throw new BadRequestException('No se encontró una sesión de caja abierta.');

    const amount = Number(dto.amount || 0);
    if (amount <= 0) throw new BadRequestException('El monto debe ser mayor que cero.');

    const currency: CurrencyCode = dto.currency === CurrencyCode.USD ? CurrencyCode.USD : CurrencyCode.DOP;
    const company = await this.dataSource.getRepository(CompanySetting).findOne({ where: {} });
    const rate = currency === CurrencyCode.USD ? Number(company?.exchangeRateUsdToDop || 60.5) : 1;
    const dopEquiv = Number((amount * rate).toFixed(2));
    const movType: CashMovementType = dto.movementType || CashMovementType.EXPENSE_OUT;

    if (movType === CashMovementType.EXPENSE_OUT || movType === CashMovementType.WITHDRAWAL_OUT) {
      if (currency === CurrencyCode.DOP) {
        session.expectedCashDop = Number((Number(session.expectedCashDop) - amount).toFixed(2));
        session.totalExpensesDop = Number((Number(session.totalExpensesDop) + amount).toFixed(2));
      } else {
        session.expectedCashUsd = Number((Number(session.expectedCashUsd) - amount).toFixed(2));
        session.totalExpensesDop = Number((Number(session.totalExpensesDop) + dopEquiv).toFixed(2));
      }
    } else if (movType === CashMovementType.CASH_IN) {
      if (currency === CurrencyCode.DOP) {
        session.expectedCashDop = Number((Number(session.expectedCashDop) + amount).toFixed(2));
      } else {
        session.expectedCashUsd = Number((Number(session.expectedCashUsd) + amount).toFixed(2));
      }
    }

    await sessionRepo.save(session);

    const movRepo = this.dataSource.getRepository(CashMovement);
    const mov = await movRepo.save(
      movRepo.create({
        cashSessionId: session.id,
        movementType: movType,
        currency,
        amount,
        amountDopEquivalent: dopEquiv,
        reason: dto.reason || 'Movimiento de caja',
        authorizedByUserId: user.id,
      })
    );

    await this.logAudit(user, 'CASH_MOVEMENT_CREATED', 'cash_movements', mov.id, {
      movementType: movType,
      currency,
      amount,
      reason: mov.reason,
    });

    return { session, movement: mov };
  }

  async closeCashSession(sessionId: string, dto: any, user: AuthUserPayload) {
    const sessionRepo = this.dataSource.getRepository(CashSession);
    const session = await sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Sesión de caja no encontrada.');
    if (session.status === CashSessionStatus.CLOSED) {
      throw new BadRequestException('Esta sesión de caja ya fue cerrada.');
    }

    const countedCashDop = Number(dto.countedCashDop ?? session.expectedCashDop);
    const countedCashUsd = Number(dto.countedCashUsd ?? session.expectedCashUsd);
    const countedCardDop = Number(dto.countedCardDop ?? session.expectedCardDop);
    const countedTransferDop = Number(dto.countedTransferDop ?? session.expectedTransferDop);

    session.countedCashDop = countedCashDop;
    session.countedCashUsd = countedCashUsd;
    session.countedCardDop = countedCardDop;
    session.countedTransferDop = countedTransferDop;
    session.differenceDop = Number((countedCashDop - Number(session.expectedCashDop)).toFixed(2));
    session.differenceUsd = Number((countedCashUsd - Number(session.expectedCashUsd)).toFixed(2));
    session.status = CashSessionStatus.CLOSED;
    session.closedByUserId = user.id;
    session.closedAt = new Date();
    session.notes = dto.notes || session.notes;

    await sessionRepo.save(session);
    await this.logAudit(user, 'CASH_SESSION_CLOSED', 'cash_sessions', session.id, {
      expectedCashDop: session.expectedCashDop,
      countedCashDop,
      differenceDop: session.differenceDop,
      expectedCashUsd: session.expectedCashUsd,
      countedCashUsd,
      differenceUsd: session.differenceUsd,
    });

    return session;
  }

  // ==================== FASE 11: DASHBOARD ADMINISTRATIVO Y LOS 13 REPORTES ====================
  async getDashboardAndReportsData(startDate?: string, endDate?: string) {
    const sales = await this.dataSource.getRepository(Sale).find({
      relations: ['employee', 'tickets'],
      order: { createdAt: 'DESC' },
      take: 150,
    });
    const tickets = await this.dataSource.getRepository(Ticket).find({
      relations: ['service', 'sale', 'sourcePackage'],
      order: { issuedAt: 'DESC' },
      take: 500,
    });
    const payments = await this.dataSource.getRepository(Payment).find({
      relations: ['paymentMethod'],
      order: { createdAt: 'DESC' },
      take: 300,
    });
    const cashSessions = await this.dataSource.getRepository(CashSession).find({
      relations: ['cashRegister', 'employee'],
      order: { openedAt: 'DESC' },
      take: 50,
    });
    const cashMovements = await this.dataSource.getRepository(CashMovement).find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const services = await this.dataSource.getRepository(Service).find();

    const todayStr = this.getTodayRdString();
    const currentMonthPrefix = todayStr.slice(0, 7);

    const filterInRange = (dateVal: Date | string) => {
      const iso = new Date(dateVal).toISOString().slice(0, 10);
      if (startDate && iso < startDate) return false;
      if (endDate && iso > endDate) return false;
      return true;
    };

    const filteredSales = sales.filter((s) => filterInRange(s.createdAt));
    const activeSales = filteredSales.filter((s) => s.status !== SaleStatus.VOIDED && s.status !== SaleStatus.REFUNDED);
    const voidedOrRefundedSales = filteredSales.filter(
      (s) => s.status === SaleStatus.VOIDED || s.status === SaleStatus.REFUNDED
    );
    const filteredTickets = tickets.filter((t) => filterInRange(t.issuedAt));
    const filteredPayments = payments.filter((p) => filterInRange(p.createdAt) && p.status === 'COMPLETED');

    const salesToday = activeSales.filter((s) => new Date(s.createdAt).toISOString().slice(0, 10) === todayStr);
    const salesMonth = activeSales.filter((s) => new Date(s.createdAt).toISOString().slice(0, 7) === currentMonthPrefix);

    const revenueTodayDop = salesToday.reduce((acc, s) => acc + Number(s.totalDop), 0);
    const revenueMonthDop = salesMonth.reduce((acc, s) => acc + Number(s.totalDop), 0);

    const incomeDop = filteredPayments
      .filter((p) => p.currency === CurrencyCode.DOP)
      .reduce((acc, p) => acc + Number(p.amountOriginal), 0);

    const incomeUsd = filteredPayments
      .filter((p) => p.currency === CurrencyCode.USD)
      .reduce((acc, p) => acc + Number(p.amountOriginal), 0);

    const usedTickets = filteredTickets.filter((t) => t.status === TicketStatus.USED);
    const pendingTickets = filteredTickets.filter(
      (t) => t.status === TicketStatus.AVAILABLE || t.status === TicketStatus.ISSUED
    );

    // 1. Ventas por día
    const salesByDayMap: Record<string, { date: string; invoicesCount: number; visitors: number; totalDop: number; totalUsd: number }> = {};
    for (const s of activeSales) {
      const d = new Date(s.createdAt).toISOString().slice(0, 10);
      if (!salesByDayMap[d]) {
        salesByDayMap[d] = { date: d, invoicesCount: 0, visitors: 0, totalDop: 0, totalUsd: 0 };
      }
      salesByDayMap[d].invoicesCount += 1;
      salesByDayMap[d].visitors += Number(s.adultCount) + Number(s.childCount);
      salesByDayMap[d].totalDop = Number((salesByDayMap[d].totalDop + Number(s.totalDop)).toFixed(2));
      salesByDayMap[d].totalUsd = Number((salesByDayMap[d].totalUsd + Number(s.totalUsd)).toFixed(2));
    }

    // 2. Ventas por mes
    const salesByMonthMap: Record<string, { month: string; invoicesCount: number; visitors: number; totalDop: number; totalUsd: number }> = {};
    for (const s of activeSales) {
      const m = new Date(s.createdAt).toISOString().slice(0, 7);
      if (!salesByMonthMap[m]) {
        salesByMonthMap[m] = { month: m, invoicesCount: 0, visitors: 0, totalDop: 0, totalUsd: 0 };
      }
      salesByMonthMap[m].invoicesCount += 1;
      salesByMonthMap[m].visitors += Number(s.adultCount) + Number(s.childCount);
      salesByMonthMap[m].totalDop = Number((salesByMonthMap[m].totalDop + Number(s.totalDop)).toFixed(2));
      salesByMonthMap[m].totalUsd = Number((salesByMonthMap[m].totalUsd + Number(s.totalUsd)).toFixed(2));
    }

    // 3 y 5. Ventas y Participantes por Actividad
    const activityStatsMap: Record<
      string,
      {
        serviceId: string;
        code: string;
        activityName: string;
        ticketsIssued: number;
        ticketsUsed: number;
        ticketsPending: number;
        participantsCount: number;
        estimatedRevenueDop: number;
      }
    > = {};

    for (const svc of services) {
      activityStatsMap[svc.id] = {
        serviceId: svc.id,
        code: svc.code,
        activityName: svc.name,
        ticketsIssued: 0,
        ticketsUsed: 0,
        ticketsPending: 0,
        participantsCount: 0,
        estimatedRevenueDop: 0,
      };
    }

    for (const t of filteredTickets) {
      const stat = activityStatsMap[t.serviceId];
      if (!stat) continue;
      if (t.status !== TicketStatus.CANCELLED) {
        stat.ticketsIssued += 1;
        stat.participantsCount += 1;
        const defaultDop =
          t.service?.prices?.find((p) => p.currency === CurrencyCode.DOP)?.unitPrice ?? 0;
        stat.estimatedRevenueDop = Number((stat.estimatedRevenueDop + Number(defaultDop)).toFixed(2));
      }
      if (t.status === TicketStatus.USED) {
        stat.ticketsUsed += 1;
      } else if (t.status === TicketStatus.AVAILABLE || t.status === TicketStatus.ISSUED) {
        stat.ticketsPending += 1;
      }
    }

    // 9. Ventas por empleado
    const salesByEmployeeMap: Record<
      string,
      { employeeName: string; employeeCode: string; salesCount: number; ticketsSold: number; totalDop: number }
    > = {};
    for (const s of activeSales) {
      const empKey = s.employeeId;
      const empName = s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : 'Recepción';
      const empCode = s.employee?.employeeCode || 'EMP';
      if (!salesByEmployeeMap[empKey]) {
        salesByEmployeeMap[empKey] = { employeeName: empName, employeeCode: empCode, salesCount: 0, ticketsSold: 0, totalDop: 0 };
      }
      salesByEmployeeMap[empKey].salesCount += 1;
      salesByEmployeeMap[empKey].ticketsSold += s.tickets?.length || 0;
      salesByEmployeeMap[empKey].totalDop = Number((salesByEmployeeMap[empKey].totalDop + Number(s.totalDop)).toFixed(2));
    }

    // 10. Ventas por método de pago
    const salesByPaymentMethodMap: Record<
      string,
      { methodCode: string; methodName: string; currency: string; transactionsCount: number; amountOriginal: number; amountDopEquivalent: number }
    > = {};
    for (const p of filteredPayments) {
      const code = p.paymentMethod?.code || 'CASH_DOP';
      if (!salesByPaymentMethodMap[code]) {
        salesByPaymentMethodMap[code] = {
          methodCode: code,
          methodName: p.paymentMethod?.name || code,
          currency: p.currency,
          transactionsCount: 0,
          amountOriginal: 0,
          amountDopEquivalent: 0,
        };
      }
      salesByPaymentMethodMap[code].transactionsCount += 1;
      salesByPaymentMethodMap[code].amountOriginal = Number(
        (salesByPaymentMethodMap[code].amountOriginal + Number(p.amountOriginal)).toFixed(2)
      );
      salesByPaymentMethodMap[code].amountDopEquivalent = Number(
        (salesByPaymentMethodMap[code].amountDopEquivalent + Number(p.amountDopEquivalent)).toFixed(2)
      );
    }

    return {
      kpis: {
        salesTodayDop: Number(revenueTodayDop.toFixed(2)),
        salesTodayCount: salesToday.length,
        salesMonthDop: Number(revenueMonthDop.toFixed(2)),
        salesMonthCount: salesMonth.length,
        visitorsAttended: usedTickets.length,
        totalVisitorsRegistered: activeSales.reduce((acc, s) => acc + Number(s.adultCount) + Number(s.childCount), 0),
        ticketsIssuedCount: filteredTickets.length,
        ticketsUsedCount: usedTickets.length,
        ticketsPendingCount: pendingTickets.length,
        incomeDop: Number(incomeDop.toFixed(2)),
        incomeUsd: Number(incomeUsd.toFixed(2)),
        voidedInvoicesCount: voidedOrRefundedSales.length,
      },
      reports: {
        // 1. Ventas por día
        salesByDay: Object.values(salesByDayMap),
        // 2. Ventas por mes
        salesByMonth: Object.values(salesByMonthMap),
        // 3. Ventas por actividad & 5. Participantes por actividad
        salesByActivity: Object.values(activityStatsMap),
        // 4. Cantidad de visitantes
        visitorsSummary: activeSales.map((s) => ({
          invoiceNumber: s.invoiceNumber,
          date: s.createdAt,
          customerName: s.customerName || 'Visitante Directo',
          adults: s.adultCount,
          children: s.childCount,
          totalVisitors: Number(s.adultCount) + Number(s.childCount),
          ticketsCount: s.tickets?.length || 0,
        })),
        // 6. Tickets emitidos
        ticketsIssued: filteredTickets,
        // 7. Tickets utilizados
        ticketsUsed: usedTickets,
        // 8. Tickets pendientes
        ticketsPending: pendingTickets,
        // 9. Ventas por empleado
        salesByEmployee: Object.values(salesByEmployeeMap),
        // 10. Ventas por método de pago
        salesByPaymentMethod: Object.values(salesByPaymentMethodMap),
        // 11. Ingresos en DOP y USD
        currencyBreakdown: [
          { currency: 'DOP (Pesos Dominicanos)', totalOriginal: Number(incomeDop.toFixed(2)), totalDopEquivalent: Number(incomeDop.toFixed(2)) },
          {
            currency: 'USD (Dólares Estadounidenses)',
            totalOriginal: Number(incomeUsd.toFixed(2)),
            totalDopEquivalent: Number(
              filteredPayments
                .filter((p) => p.currency === CurrencyCode.USD)
                .reduce((acc, p) => acc + Number(p.amountDopEquivalent), 0)
                .toFixed(2)
            ),
          },
        ],
        // 12. Anulaciones y devoluciones
        voidedAndRefundedSales: voidedOrRefundedSales,
        // 13. Cierres de caja
        cashClosures: cashSessions,
      },
      cashMovements,
    };
  }

  // Exportación real de cualquiera de los 13 reportes a Excel (.xlsx)
  async generateReportExcelBuffer(reportKey: string, startDate?: string, endDate?: string): Promise<Buffer> {
    const data = await this.getDashboardAndReportsData(startDate, endDate);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Montaña Redonda Paradise POS';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`Reporte_${reportKey}`);
    sheet.getRow(1).values = [`MONTAÑA REDONDA PARADISE - REPORTE OFICIAL: ${reportKey.toUpperCase()}`];
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.getRow(2).values = [`Generado: ${new Date().toLocaleString('es-DO')} | Filtro: ${startDate || 'Inicio'} a ${endDate || 'Hoy'}`];

    let rows: Record<string, any>[] = [];
    const r = data.reports;

    switch (reportKey) {
      case '1_ventas_dia':
        rows = r.salesByDay;
        break;
      case '2_ventas_mes':
        rows = r.salesByMonth;
        break;
      case '3_ventas_actividad':
      case '5_participantes_actividad':
        rows = r.salesByActivity;
        break;
      case '4_visitantes':
        rows = r.visitorsSummary;
        break;
      case '6_tickets_emitidos':
        rows = r.ticketsIssued.map((t) => ({
          ticketNumber: t.ticketNumber,
          actividad: t.service?.name,
          visitante: t.visitorNameSnapshot || 'Portador',
          factura: t.sale?.invoiceNumber,
          estado: t.status,
          validoHasta: t.validUntil,
        }));
        break;
      case '7_tickets_utilizados':
        rows = r.ticketsUsed.map((t) => ({
          ticketNumber: t.ticketNumber,
          actividad: t.service?.name,
          visitante: t.visitorNameSnapshot || 'Portador',
          usadoEnFecha: t.usedAt,
          puntoAcceso: t.usedAtAccessPoint,
          validadoPor: t.usedByUsername,
        }));
        break;
      case '8_tickets_pendientes':
        rows = r.ticketsPending.map((t) => ({
          ticketNumber: t.ticketNumber,
          actividad: t.service?.name,
          visitante: t.visitorNameSnapshot || 'Portador',
          estado: t.status,
          validoHasta: t.validUntil,
        }));
        break;
      case '9_ventas_empleado':
        rows = r.salesByEmployee;
        break;
      case '10_ventas_metodo_pago':
        rows = r.salesByPaymentMethod;
        break;
      case '11_ingresos_dop_usd':
        rows = r.currencyBreakdown;
        break;
      case '12_anulaciones':
        rows = r.voidedAndRefundedSales.map((s) => ({
          factura: s.invoiceNumber,
          notaCredito: s.creditNoteNumber || 'N/A',
          estado: s.status,
          totalDop: s.totalDop,
          motivo: s.voidReason,
          fechaAnulacion: s.voidedAt,
        }));
        break;
      case '13_cierres_caja':
        rows = r.cashClosures.map((c) => ({
          caja: c.cashRegister?.code,
          empleado: c.employee ? `${c.employee.firstName} ${c.employee.lastName}` : '',
          estado: c.status,
          aperturaDop: c.openingAmountDop,
          esperadoDop: c.expectedCashDop,
          contadoDop: c.countedCashDop ?? 'Abierta',
          diferenciaDop: c.differenceDop ?? 0,
          esperadoUsd: c.expectedCashUsd,
          contadoUsd: c.countedCashUsd ?? 'Abierta',
          diferenciaUsd: c.differenceUsd ?? 0,
        }));
        break;
      default:
        rows = r.salesByActivity;
    }

    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      sheet.getRow(4).values = headers;
      sheet.getRow(4).font = { bold: true };
      rows.forEach((rowObj, idx) => {
        sheet.getRow(5 + idx).values = headers.map((h) => rowObj[h]);
      });
    } else {
      sheet.getRow(4).values = ['Sin registros en el rango seleccionado.'];
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}

@Controller()
export class CoreDomainController {
  constructor(
    private readonly coreService: CoreDomainService,
    private readonly dataSource: DataSource
  ) {}

  @Public()
  @Get('health')
  async health() {
    const dbOk = this.dataSource.isInitialized;
    return {
      status: 'ok',
      system: 'Montaña Redonda Paradise - POS & Ticket Control',
      databaseConnected: dbOk,
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Post('auth/login')
  async login(@Body() body: { username: string; password: string }) {
    return this.coreService.login(body.username, body.password);
  }

  @Get('bootstrap')
  async bootstrap(@CurrentUser() user: AuthUserPayload) {
    return this.coreService.getSystemBootstrap(user);
  }

  // Catálogo y Paquetes
  @Get('catalog')
  async getCatalog() {
    const [categories, services, packages, taxes] = await Promise.all([
      this.dataSource.getRepository(ServiceCategory).find({ order: { sortOrder: 'ASC' } }),
      this.dataSource.getRepository(Service).find({ order: { code: 'ASC' } }),
      this.dataSource.getRepository(TourPackage).find({ order: { code: 'ASC' } }),
      this.dataSource.getRepository(TaxSetting).find(),
    ]);
    return { categories, services, packages, taxes };
  }

  @Roles(RoleCode.ADMIN, RoleCode.MANAGER)
  @Post('catalog/services')
  async saveService(@Body() dto: any, @CurrentUser() user: AuthUserPayload) {
    return this.coreService.createOrUpdateService(dto, user);
  }

  @Roles(RoleCode.ADMIN, RoleCode.MANAGER)
  @Post('catalog/packages')
  async savePackage(@Body() dto: any, @CurrentUser() user: AuthUserPayload) {
    return this.coreService.createOrUpdatePackage(dto, user);
  }

  // Ventas POS, Facturación y Tickets
  @Roles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.CASHIER, RoleCode.RECEPTION)
  @Post('sales')
  async createSale(
    @Body() dto: any,
    @CurrentUser() user: AuthUserPayload,
    @Headers('x-idempotency-key') idempotencyHeader?: string
  ) {
    return this.coreService.createPosSaleAndTickets(dto, user, idempotencyHeader);
  }

  @Get('sales')
  async listSales() {
    return this.dataSource.getRepository(Sale).find({
      relations: ['items', 'participants', 'payments', 'tickets', 'employee'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  @Get('sales/:id')
  async getSale(@Param('id') id: string) {
    const sale = await this.dataSource.getRepository(Sale).findOne({
      where: { id },
      relations: ['items', 'participants', 'payments', 'tickets', 'employee'],
    });
    if (!sale) throw new NotFoundException('Factura no encontrada.');
    return sale;
  }

  @Roles(RoleCode.ADMIN, RoleCode.MANAGER)
  @Post('sales/:id/void')
  async voidSale(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: AuthUserPayload
  ) {
    return this.coreService.voidOrRefundSale(id, body.reason, user);
  }

  @Roles(RoleCode.ADMIN, RoleCode.MANAGER)
  @Post('sales/:id/authorize-unpaid')
  async authorizeUnpaid(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.coreService.authorizeUnpaidSaleTickets(id, user);
  }

  // Tickets QR e Impresión
  @Get('tickets')
  async listTickets(@Query('saleId') saleId?: string, @Query('serviceId') serviceId?: string) {
    const where: any = {};
    if (saleId) where.saleId = saleId;
    if (serviceId) where.serviceId = serviceId;

    return this.dataSource.getRepository(Ticket).find({
      where,
      relations: ['sale', 'service', 'sourcePackage', 'saleParticipant'],
      order: { issuedAt: 'DESC', sequenceInSale: 'ASC' },
      take: 200,
    });
  }

  @Public()
  @Get('tickets/:id/qr-svg')
  async getTicketQrSvg(@Param('id') id: string, @Res() res: Response) {
    const ticket = await this.dataSource.getRepository(Ticket).findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    const svg = await QRCode.toString(ticket.qrPayload, { type: 'svg', margin: 1, width: 180 });
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.send(svg);
  }

  @Post('tickets/:id/mark-printed')
  async markTicketPrinted(@Param('id') id: string) {
    const repo = this.dataSource.getRepository(Ticket);
    const ticket = await repo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    ticket.printCount += 1;
    ticket.lastPrintedAt = new Date();
    return repo.save(ticket);
  }

  // Escaneo y Validación QR Atómica
  @Get('validations/inspect')
  async inspectTicket(@Query('code') code: string) {
    return this.coreService.inspectTicketByQrOrNumber(code);
  }

  @Roles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.OPERATOR, RoleCode.RECEPTION)
  @Post('validations/consume')
  async validateAndConsume(@Body() dto: any, @CurrentUser() user: AuthUserPayload) {
    return this.coreService.validateAndConsumeTicketAtomically(dto, user);
  }

  // Control Operativo de Actividades e Incidencias
  @Get('activities/summary')
  async getActivitiesSummary(@Query('serviceId') serviceId?: string) {
    return this.coreService.getActivitiesOperationalSummary(serviceId);
  }

  @Roles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.OPERATOR)
  @Post('activities/incidents')
  async createIncident(@Body() dto: any, @CurrentUser() user: AuthUserPayload) {
    return this.coreService.reportActivityIncident(dto, user);
  }

  // Caja y Control Financiero
  @Get('cash/status')
  async getCashStatus(@CurrentUser() user: AuthUserPayload) {
    return this.coreService.getCashControlStatus(user);
  }

  @Roles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.CASHIER, RoleCode.RECEPTION)
  @Post('cash/sessions/open')
  async openCash(@Body() dto: any, @CurrentUser() user: AuthUserPayload) {
    return this.coreService.openCashSession(dto, user);
  }

  @Roles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.CASHIER, RoleCode.RECEPTION)
  @Post('cash/movements')
  async addCashMovement(@Body() dto: any, @CurrentUser() user: AuthUserPayload) {
    return this.coreService.registerCashMovement(dto, user);
  }

  @Roles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.CASHIER, RoleCode.RECEPTION)
  @Post('cash/sessions/:id/close')
  async closeCash(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: AuthUserPayload) {
    return this.coreService.closeCashSession(id, dto, user);
  }

  // Dashboard y los 13 Reportes + Exportación Excel
  @Roles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.CASHIER, RoleCode.RECEPTION)
  @Get('reports/dashboard')
  async getDashboard(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.coreService.getDashboardAndReportsData(startDate, endDate);
  }

  @Roles(RoleCode.ADMIN, RoleCode.MANAGER)
  @Get('reports/export-excel')
  async exportExcel(
    @Query('reportKey') reportKey: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response
  ) {
    const buffer = await this.coreService.generateReportExcelBuffer(reportKey || '3_ventas_actividad', startDate, endDate);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="MontanaRedonda_${reportKey || 'reporte'}.xlsx"`);
    return res.send(buffer);
  }

  // Configuración Fiscal RD, Usuarios y Auditoría
  @Get('settings/audit-logs')
  async getAuditLogs() {
    return this.dataSource.getRepository(AuditLog).find({
      order: { createdAt: 'DESC' },
      take: 150,
    });
  }

  @Get('settings/users')
  async listUsers() {
    const [users, roles, employees] = await Promise.all([
      this.dataSource.getRepository(User).find({ order: { createdAt: 'ASC' } }),
      this.dataSource.getRepository(Role).find(),
      this.dataSource.getRepository(Employee).find(),
    ]);
    return {
      users: users.map((u) => {
        const emp = employees.find((e) => e.userId === u.id);
        return {
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          lastLoginAt: u.lastLoginAt,
          employee: emp,
        };
      }),
      roles,
    };
  }

  @Roles(RoleCode.ADMIN)
  @Post('settings/users')
  async createUser(@Body() dto: any, @CurrentUser() user: AuthUserPayload) {
    const userRepo = this.dataSource.getRepository(User);
    const empRepo = this.dataSource.getRepository(Employee);

    const cleanUsername = String(dto.username || '').trim();
    const cleanEmail = String(dto.email || '').trim();
    if (!cleanUsername || !cleanEmail) {
      throw new BadRequestException('Debe especificar el nombre de usuario y correo electrónico.');
    }

    const existingUser = await userRepo.findOne({
      where: [{ username: cleanUsername }, { email: cleanEmail }],
    });
    if (existingUser) {
      throw new BadRequestException(
        'Ya existe un usuario con ese nombre de usuario o correo electrónico.'
      );
    }

    const passwordHash = await bcrypt.hash(dto.password || 'Montana2026*', 10);

    const savedUser = await userRepo.save(
      userRepo.create({
        username: cleanUsername,
        email: cleanEmail,
        passwordHash,
        roleId: dto.roleId,
        isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : true,
      })
    );

    const empCount = await empRepo.count();
    const uniqueSuffix = Date.now().toString().slice(-4);
    const savedEmp = await empRepo.save(
      empRepo.create({
        userId: savedUser.id,
        employeeCode: dto.employeeCode || `EMP-${String(empCount + 1).padStart(3, '0')}-${uniqueSuffix}`,
        firstName: dto.firstName || cleanUsername,
        lastName: dto.lastName || '',
        documentId: dto.documentId || '',
        phone: dto.phone || '',
        position: dto.position || 'Personal Operativo',
        assignedActivityId: dto.assignedActivityId || null,
        isActive: savedUser.isActive,
      })
    );

    await this.coreService.logAudit(user, 'USER_CREATED', 'users', savedUser.id, {
      username: savedUser.username,
      roleId: dto.roleId,
    });

    return { user: savedUser, employee: savedEmp };
  }

  @Roles(RoleCode.ADMIN)
  @Patch('settings/users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() user: AuthUserPayload
  ) {
    const userRepo = this.dataSource.getRepository(User);
    const empRepo = this.dataSource.getRepository(Employee);

    const targetUser = await userRepo.findOne({ where: { id } });
    if (!targetUser) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const cleanUsername = dto.username !== undefined ? String(dto.username).trim() : targetUser.username;
    const cleanEmail = dto.email !== undefined ? String(dto.email).trim() : targetUser.email;

    if (cleanUsername !== targetUser.username) {
      const dupU = await userRepo.findOne({ where: { username: cleanUsername } });
      if (dupU && dupU.id !== id) {
        throw new BadRequestException('Ese nombre de usuario ya está en uso por otro empleado.');
      }
      targetUser.username = cleanUsername;
    }

    if (cleanEmail !== targetUser.email) {
      const dupE = await userRepo.findOne({ where: { email: cleanEmail } });
      if (dupE && dupE.id !== id) {
        throw new BadRequestException('Ese correo electrónico ya está en uso por otro empleado.');
      }
      targetUser.email = cleanEmail;
    }

    if (dto.roleId) {
      targetUser.roleId = dto.roleId;
      const roleObj = await this.dataSource.getRepository(Role).findOne({ where: { id: dto.roleId } });
      if (roleObj) {
        targetUser.role = roleObj;
      }
    }

    if (dto.isActive !== undefined) {
      targetUser.isActive = Boolean(dto.isActive);
    }

    if (dto.password && String(dto.password).trim().length > 0) {
      targetUser.passwordHash = await bcrypt.hash(String(dto.password).trim(), 10);
    }

    const savedUser = await userRepo.save(targetUser);

    let emp = await empRepo.findOne({ where: { userId: id } });
    if (!emp) {
      const empCount = await empRepo.count();
      emp = empRepo.create({
        userId: id,
        employeeCode: `EMP-${String(empCount + 1).padStart(3, '0')}-${Date.now().toString().slice(-4)}`,
        firstName: dto.firstName || savedUser.username,
        lastName: dto.lastName || '',
        documentId: dto.documentId || '',
        phone: dto.phone || '',
        position: dto.position || 'Personal Operativo',
        isActive: savedUser.isActive,
      });
    } else {
      if (dto.firstName !== undefined) emp.firstName = dto.firstName;
      if (dto.lastName !== undefined) emp.lastName = dto.lastName;
      if (dto.documentId !== undefined) emp.documentId = dto.documentId;
      if (dto.phone !== undefined) emp.phone = dto.phone;
      if (dto.position !== undefined) emp.position = dto.position;
      emp.isActive = savedUser.isActive;
    }

    const savedEmp = await empRepo.save(emp);

    await this.coreService.logAudit(user, 'USER_UPDATED', 'users', savedUser.id, {
      username: savedUser.username,
      roleId: savedUser.roleId,
      isActive: savedUser.isActive,
      passwordChanged: Boolean(dto.password && String(dto.password).trim().length > 0),
    });

    return { user: savedUser, employee: savedEmp };
  }

  @Roles(RoleCode.ADMIN)
  @Delete('settings/users/:id')
  async deleteUser(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    if (id === user.id) {
      throw new BadRequestException('No puedes eliminar el usuario con el que tienes la sesión activa.');
    }

    const userRepo = this.dataSource.getRepository(User);
    const empRepo = this.dataSource.getRepository(Employee);

    const targetUser = await userRepo.findOne({ where: { id } });
    if (!targetUser) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const targetEmp = await empRepo.findOne({ where: { userId: id } });
    const fallbackEmp = await empRepo
      .createQueryBuilder('emp')
      .where('emp.user_id != :id', { id })
      .getOne();

    await this.dataSource.transaction(async (manager) => {
      if (targetEmp && fallbackEmp) {
        await manager.query('UPDATE sales SET employee_id = $1 WHERE employee_id = $2', [
          fallbackEmp.id,
          targetEmp.id,
        ]);
        await manager.query('UPDATE cash_sessions SET employee_id = $1 WHERE employee_id = $2', [
          fallbackEmp.id,
          targetEmp.id,
        ]);
      }

      await manager.query(
        'UPDATE ticket_validations SET validated_by_user_id = $1 WHERE validated_by_user_id = $2',
        [user.id, id]
      );
      await manager.query(
        'UPDATE activity_incidents SET reported_by_user_id = $1 WHERE reported_by_user_id = $2',
        [user.id, id]
      );

      if (targetEmp) {
        await manager.delete(Employee, { id: targetEmp.id });
      }
      await manager.delete(User, { id });
    });

    await this.coreService.logAudit(user, 'USER_DELETED', 'users', id, {
      deletedUsername: targetUser.username,
      deletedEmail: targetUser.email,
    });

    return { deleted: true, id, username: targetUser.username };
  }

  @Roles(RoleCode.ADMIN, RoleCode.MANAGER)
  @Patch('settings/company')
  async updateCompanySettings(@Body() dto: any, @CurrentUser() user: AuthUserPayload) {
    const repo = this.dataSource.getRepository(CompanySetting);
    let company = await repo.findOne({ where: {} });
    if (!company) {
      company = repo.create({});
    }
    Object.assign(company, {
      commercialName: dto.commercialName ?? company.commercialName,
      legalName: dto.legalName ?? company.legalName,
      rnc: dto.rnc ?? company.rnc,
      address: dto.address ?? company.address,
      phone: dto.phone ?? company.phone,
      email: dto.email ?? company.email,
      exchangeRateUsdToDop:
        dto.exchangeRateUsdToDop !== undefined ? Number(dto.exchangeRateUsdToDop) : company.exchangeRateUsdToDop,
      allowUnpaidTicketOverride:
        dto.allowUnpaidTicketOverride !== undefined
          ? !!dto.allowUnpaidTicketOverride
          : company.allowUnpaidTicketOverride,
      ticketFooterInstructions: dto.ticketFooterInstructions ?? company.ticketFooterInstructions,
    });
    const saved = await repo.save(company);
    await this.coreService.logAudit(user, 'COMPANY_SETTINGS_UPDATED', 'company_settings', saved.id, dto);
    return saved;
  }
}
