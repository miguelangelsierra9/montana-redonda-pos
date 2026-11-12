import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  ManyToMany,
  JoinTable,
  JoinColumn,
  Index,
} from 'typeorm';
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

// 1. permissions
@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 80 })
  code: string;

  @Column({ length: 60 })
  module: string;

  @Column({ type: 'text', nullable: true })
  description: string;
}

// 2. roles
@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, length: 40 })
  code: RoleCode;

  @Column({ length: 80 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_system', default: true })
  isSystem: boolean;

  @ManyToMany(() => Permission, { eager: true })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

// 3. users
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 60 })
  username: string;

  @Column({ unique: true, length: 120 })
  email: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ name: 'role_id' })
  roleId: string;

  @ManyToOne(() => Role, { eager: true })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date;

  @OneToOne(() => Employee, (emp) => emp.user)
  employee: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

// 4. employees
@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  userId: string;

  @OneToOne(() => User, (user) => user.employee, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'employee_code', unique: true, length: 30 })
  employeeCode: string;

  @Column({ name: 'first_name', length: 80 })
  firstName: string;

  @Column({ name: 'last_name', length: 80 })
  lastName: string;

  @Column({ name: 'document_id', length: 30, nullable: true })
  documentId: string;

  @Column({ length: 30, nullable: true })
  phone: string;

  @Column({ length: 80 })
  position: string;

  @Column({ name: 'assigned_activity_id', type: 'uuid', nullable: true })
  assignedActivityId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

// 5. company_settings
@Entity('company_settings')
export class CompanySetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_name', length: 120, default: 'Montaña Redonda Paradise' })
  commercialName: string;

  @Column({ name: 'legal_name', length: 150, default: 'Montaña Redonda Paradise SRL' })
  legalName: string;

  @Column({ length: 20, default: '131-89452-1' })
  rnc: string;

  @Column({ type: 'text', default: 'Carretera Michés - Nisibón Km 14, Michés, El Seibo, República Dominicana' })
  address: string;

  @Column({ length: 40, default: '+1 (809) 553-5959' })
  phone: string;

  @Column({ length: 120, default: 'recepcion@montanaredondaparadise.com' })
  email: string;

  @Column({ name: 'primary_currency', type: 'varchar', length: 5, default: CurrencyCode.DOP })
  primaryCurrency: CurrencyCode;

  @Column({ name: 'secondary_currency', type: 'varchar', length: 5, default: CurrencyCode.USD })
  secondaryCurrency: CurrencyCode;

  @Column({ name: 'exchange_rate_usd_to_dop', type: 'numeric', precision: 10, scale: 4, default: 60.5 })
  exchangeRateUsdToDop: number;

  @Column({ name: 'allow_unpaid_ticket_override', default: false })
  allowUnpaidTicketOverride: boolean;

  @Column({
    name: 'ticket_footer_instructions',
    type: 'text',
    default: 'Conserve este ticket durante toda su visita. Válido para un único acceso en la actividad indicada.',
  })
  ticketFooterInstructions: string;

  @Column({ name: 'ecf_preparation_mode', default: true })
  ecfPreparationMode: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

// 6. tax_settings
@Entity('tax_settings')
export class TaxSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  code: string;

  @Column({ length: 80 })
  name: string;

  @Column({ name: 'rate_percentage', type: 'numeric', precision: 5, scale: 2 })
  ratePercentage: number;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_inclusive', default: false })
  isInclusive: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}

// 7. service_categories
@Entity('service_categories')
export class ServiceCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 40 })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, default: 'Mountain' })
  icon: string;

  @Column({ name: 'color_hex', length: 15, default: '#15803d' })
  colorHex: string;

  @Column({ name: 'sort_order', default: 1 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => Service, (s) => s.category)
  services: any[];
}

// 8. services
@Entity('services')
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => ServiceCategory, (cat) => cat.services, { eager: true })
  @JoinColumn({ name: 'category_id' })
  category: ServiceCategory;

  @Column({ unique: true, length: 40 })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl: string;

  @Column({ name: 'tax_setting_id', nullable: true })
  taxSettingId: string;

  @ManyToOne(() => TaxSetting, { eager: true })
  @JoinColumn({ name: 'tax_setting_id' })
  taxSetting: TaxSetting;

  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  durationMinutes: number;

  @Column({ name: 'capacity_per_shift', type: 'int', nullable: true })
  capacityPerShift: number;

  @Column({ name: 'requires_safety_check', default: false })
  requiresSafetyCheck: boolean;

  @Column({ name: 'access_point_name', length: 100, default: 'Control Principal' })
  accessPointName: string;

  @Column({ name: 'restrictions_text', type: 'text', nullable: true })
  restrictionsText: string;

  @Column({ name: 'instructions_text', type: 'text', nullable: true })
  instructionsText: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

  @OneToMany(() => ServicePrice, (sp) => sp.service, { eager: true, cascade: true })
  prices: any[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

// 9. service_prices
@Entity('service_prices')
export class ServicePrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'service_id' })
  serviceId: string;

  @ManyToOne(() => Service, (s) => s.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'rate_type', type: 'varchar', length: 30, default: RateType.GENERAL })
  rateType: RateType;

  @Column({ type: 'varchar', length: 5, default: CurrencyCode.DOP })
  currency: CurrencyCode;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2 })
  unitPrice: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}

// 10. packages
@Entity('packages')
export class TourPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 40 })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl: string;

  @Column({ name: 'price_dop', type: 'numeric', precision: 12, scale: 2 })
  priceDop: number;

  @Column({ name: 'price_usd', type: 'numeric', precision: 12, scale: 2 })
  priceUsd: number;

  @Column({ name: 'tax_setting_id', nullable: true })
  taxSettingId: string;

  @ManyToOne(() => TaxSetting, { eager: true })
  @JoinColumn({ name: 'tax_setting_id' })
  taxSetting: TaxSetting;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: 'ACTIVE' | 'INACTIVE';

  @OneToMany(() => PackageItem, (pi) => pi.tourPackage, { eager: true, cascade: true })
  items: any[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

// 11. package_items
@Entity('package_items')
export class PackageItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'package_id' })
  packageId: string;

  @ManyToOne(() => TourPackage, (p) => p.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'package_id' })
  tourPackage: TourPackage;

  @Column({ name: 'service_id' })
  serviceId: string;

  @ManyToOne(() => Service, { eager: true })
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'quantity_per_package', type: 'int', default: 1 })
  quantityPerPackage: number;

  @Column({ name: 'allocated_price_ratio', type: 'numeric', precision: 5, scale: 4, default: 0.3333 })
  allocatedPriceRatio: number;
}

// 12. visitors
@Entity('visitors')
export class Visitor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name', length: 120 })
  fullName: string;

  @Column({ name: 'document_type', type: 'varchar', length: 20, default: 'NONE' })
  documentType: 'CEDULA' | 'PASSPORT' | 'NONE';

  @Column({ name: 'document_number', type: 'varchar', length: 40, nullable: true })
  documentNumber: string;

  @Column({ type: 'varchar', length: 60, nullable: true, default: 'Dominicana' })
  nationality: string;

  @Column({ name: 'visitor_type', type: 'varchar', length: 20, default: VisitorType.ADULT })
  visitorType: VisitorType;

  @Column({ length: 40, nullable: true })
  phone: string;

  @Column({ length: 120, nullable: true })
  email: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

// 13. cash_registers
@Entity('cash_registers')
export class CashRegister {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  code: string;

  @Column({ length: 80 })
  name: string;

  @Column({ length: 100, default: 'Recepción Principal' })
  location: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}

// 14. cash_sessions
@Entity('cash_sessions')
export class CashSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cash_register_id' })
  cashRegisterId: string;

  @ManyToOne(() => CashRegister, { eager: true })
  @JoinColumn({ name: 'cash_register_id' })
  cashRegister: CashRegister;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @ManyToOne(() => Employee, { eager: true })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ name: 'opened_by_user_id' })
  openedByUserId: string;

  @Column({ name: 'closed_by_user_id', type: 'uuid', nullable: true })
  closedByUserId: string | null;

  @Column({ type: 'varchar', length: 20, default: CashSessionStatus.OPEN })
  status: CashSessionStatus;

  @Column({ name: 'opening_amount_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  openingAmountDop: number;

  @Column({ name: 'opening_amount_usd', type: 'numeric', precision: 12, scale: 2, default: 0 })
  openingAmountUsd: number;

  @Column({ name: 'expected_cash_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  expectedCashDop: number;

  @Column({ name: 'expected_cash_usd', type: 'numeric', precision: 12, scale: 2, default: 0 })
  expectedCashUsd: number;

  @Column({ name: 'expected_card_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  expectedCardDop: number;

  @Column({ name: 'expected_transfer_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  expectedTransferDop: number;

  @Column({ name: 'total_expenses_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  totalExpensesDop: number;

  @Column({ name: 'counted_cash_dop', type: 'numeric', precision: 12, scale: 2, nullable: true })
  countedCashDop: number | null;

  @Column({ name: 'counted_cash_usd', type: 'numeric', precision: 12, scale: 2, nullable: true })
  countedCashUsd: number | null;

  @Column({ name: 'counted_card_dop', type: 'numeric', precision: 12, scale: 2, nullable: true })
  countedCardDop: number | null;

  @Column({ name: 'counted_transfer_dop', type: 'numeric', precision: 12, scale: 2, nullable: true })
  countedTransferDop: number | null;

  @Column({ name: 'difference_dop', type: 'numeric', precision: 12, scale: 2, nullable: true })
  differenceDop: number | null;

  @Column({ name: 'difference_usd', type: 'numeric', precision: 12, scale: 2, nullable: true })
  differenceUsd: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'opened_at' })
  openedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;
}

// 15. sales
@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'invoice_number', unique: true, length: 30 })
  invoiceNumber: string;

  @Index({ unique: true })
  @Column({ name: 'idempotency_key', unique: true, length: 80 })
  idempotencyKey: string;

  @Column({ name: 'cash_session_id', type: 'uuid', nullable: true })
  cashSessionId: string | null;

  @ManyToOne(() => CashSession)
  @JoinColumn({ name: 'cash_session_id' })
  cashSession: CashSession;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @ManyToOne(() => Employee, { eager: true })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ name: 'customer_name', length: 120, nullable: true })
  customerName: string;

  @Column({ name: 'customer_rnc_cedula', length: 25, nullable: true })
  customerRncCedula: string;

  @Column({ name: 'customer_phone', length: 30, nullable: true })
  customerPhone: string;

  @Column({ name: 'customer_email', length: 120, nullable: true })
  customerEmail: string;

  @Column({ name: 'ncf_type', type: 'varchar', length: 10, default: NcfType.B02 })
  ncfType: NcfType;

  @Column({ name: 'ncf_number', type: 'varchar', length: 25, nullable: true })
  ncfNumber: string | null;

  @Column({ type: 'varchar', length: 5, default: CurrencyCode.DOP })
  currency: CurrencyCode;

  @Column({ name: 'exchange_rate_applied', type: 'numeric', precision: 10, scale: 4, default: 60.5 })
  exchangeRateApplied: number;

  @Column({ name: 'adult_count', type: 'int', default: 1 })
  adultCount: number;

  @Column({ name: 'child_count', type: 'int', default: 0 })
  childCount: number;

  @Column({ name: 'subtotal_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  subtotalDop: number;

  @Column({ name: 'discount_amount_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  discountAmountDop: number;

  @Column({ name: 'discount_reason', type: 'varchar', length: 150, nullable: true })
  discountReason: string | null;

  @Column({ name: 'tax_amount_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  taxAmountDop: number;

  @Column({ name: 'total_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  totalDop: number;

  @Column({ name: 'total_usd', type: 'numeric', precision: 12, scale: 2, default: 0 })
  totalUsd: number;

  @Column({ name: 'paid_amount_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  paidAmountDop: number;

  @Column({ name: 'change_given_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  changeGivenDop: number;

  @Column({ type: 'varchar', length: 25, default: SaleStatus.PAID })
  status: SaleStatus;

  @Column({ name: 'admin_access_override', default: false })
  adminAccessOverride: boolean;

  @Column({ name: 'credit_note_number', type: 'varchar', length: 30, nullable: true })
  creditNoteNumber: string | null;

  @Column({ name: 'void_reason', type: 'text', nullable: true })
  voidReason: string | null;

  @Column({ name: 'voided_by_user_id', type: 'uuid', nullable: true })
  voidedByUserId: string | null;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true })
  items: any[];

  @OneToMany(() => SaleParticipant, (sp) => sp.sale, { cascade: true })
  participants: any[];

  @OneToMany(() => Payment, (pay) => pay.sale, { cascade: true })
  payments: any[];

  @OneToMany(() => Ticket, (tkt) => tkt.sale)
  tickets: any[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

// 16. sale_items
@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sale_id' })
  saleId: string;

  @ManyToOne(() => Sale, (s) => s.items)
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'item_type', type: 'varchar', length: 20, default: 'SERVICE' })
  itemType: 'SERVICE' | 'PACKAGE';

  @Column({ name: 'service_id', type: 'uuid', nullable: true })
  serviceId: string | null;

  @ManyToOne(() => Service, { eager: true, nullable: true })
  @JoinColumn({ name: 'service_id' })
  service: Service | null;

  @Column({ name: 'package_id', type: 'uuid', nullable: true })
  packageId: string | null;

  @ManyToOne(() => TourPackage, { eager: true, nullable: true })
  @JoinColumn({ name: 'package_id' })
  tourPackage: TourPackage | null;

  @Column({ name: 'rate_type', type: 'varchar', length: 30, default: RateType.GENERAL })
  rateType: RateType;

  @Column({ name: 'description_snapshot', length: 160 })
  descriptionSnapshot: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'unit_price_dop', type: 'numeric', precision: 12, scale: 2 })
  unitPriceDop: number;

  @Column({ name: 'unit_price_usd', type: 'numeric', precision: 12, scale: 2 })
  unitPriceUsd: number;

  @Column({ name: 'discount_amount_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  discountAmountDop: number;

  @Column({ name: 'tax_rate_applied', type: 'numeric', precision: 5, scale: 2, default: 0 })
  taxRateApplied: number;

  @Column({ name: 'tax_amount_dop', type: 'numeric', precision: 12, scale: 2, default: 0 })
  taxAmountDop: number;

  @Column({ name: 'line_total_dop', type: 'numeric', precision: 12, scale: 2 })
  lineTotalDop: number;

  @Column({ name: 'tickets_expected_count', type: 'int' })
  ticketsExpectedCount: number;
}

// 17. sale_participants
@Entity('sale_participants')
export class SaleParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sale_id' })
  saleId: string;

  @ManyToOne(() => Sale, (s) => s.participants)
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'visitor_id', type: 'uuid', nullable: true })
  visitorId: string | null;

  @ManyToOne(() => Visitor, { nullable: true, eager: true })
  @JoinColumn({ name: 'visitor_id' })
  visitor: Visitor | null;

  @Column({ name: 'participant_index', type: 'int' })
  participantIndex: number;

  @Column({ name: 'display_name', type: 'varchar', length: 120, nullable: true })
  displayName: string | null;

  @Column({ name: 'participant_type', type: 'varchar', length: 20, default: VisitorType.ADULT })
  participantType: VisitorType;

  @Column({ type: 'varchar', length: 60, nullable: true })
  nationality: string | null;
}

// 18. payment_methods
@Entity('payment_methods')
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, length: 30 })
  code: PaymentMethodCode;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 5, default: CurrencyCode.DOP })
  currency: CurrencyCode;

  @Column({ name: 'requires_reference', default: false })
  requiresReference: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}

// 19. payments
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sale_id' })
  saleId: string;

  @ManyToOne(() => Sale, (s) => s.payments)
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'cash_session_id', type: 'uuid', nullable: true })
  cashSessionId: string | null;

  @Column({ name: 'payment_method_id' })
  paymentMethodId: string;

  @ManyToOne(() => PaymentMethod, { eager: true })
  @JoinColumn({ name: 'payment_method_id' })
  paymentMethod: PaymentMethod;

  @Column({ type: 'varchar', length: 5 })
  currency: CurrencyCode;

  @Column({ name: 'amount_original', type: 'numeric', precision: 12, scale: 2 })
  amountOriginal: number;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 10, scale: 4, default: 1 })
  exchangeRate: number;

  @Column({ name: 'amount_dop_equivalent', type: 'numeric', precision: 12, scale: 2 })
  amountDopEquivalent: number;

  @Column({ name: 'reference_number', type: 'varchar', length: 80, nullable: true })
  referenceNumber: string | null;

  @Column({ type: 'varchar', length: 20, default: 'COMPLETED' })
  status: 'COMPLETED' | 'VOIDED' | 'REFUNDED';

  @Column({ name: 'created_by_user_id' })
  createdByUserId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

// 20. cash_movements
@Entity('cash_movements')
export class CashMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cash_session_id' })
  cashSessionId: string;

  @ManyToOne(() => CashSession)
  @JoinColumn({ name: 'cash_session_id' })
  cashSession: CashSession;

  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId: string | null;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId: string | null;

  @Column({ name: 'movement_type', type: 'varchar', length: 30 })
  movementType: CashMovementType;

  @Column({ type: 'varchar', length: 5 })
  currency: CurrencyCode;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'amount_dop_equivalent', type: 'numeric', precision: 12, scale: 2 })
  amountDopEquivalent: number;

  @Column({ length: 200 })
  reason: string;

  @Column({ name: 'authorized_by_user_id' })
  authorizedByUserId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

// 21. tickets
@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'ticket_number', unique: true, length: 40 })
  ticketNumber: string;

  @Index({ unique: true })
  @Column({ name: 'qr_token_hash', unique: true, length: 64 })
  qrTokenHash: string;

  @Index({ unique: true })
  @Column({ name: 'qr_payload', unique: true, length: 180 })
  qrPayload: string;

  @Column({ name: 'sale_id' })
  saleId: string;

  @ManyToOne(() => Sale, (s) => s.tickets)
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'sale_item_id' })
  saleItemId: string;

  @ManyToOne(() => SaleItem)
  @JoinColumn({ name: 'sale_item_id' })
  saleItem: SaleItem;

  @Column({ name: 'service_id' })
  serviceId: string;

  @ManyToOne(() => Service, { eager: true })
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'source_package_id', type: 'uuid', nullable: true })
  sourcePackageId: string | null;

  @ManyToOne(() => TourPackage, { eager: true, nullable: true })
  @JoinColumn({ name: 'source_package_id' })
  sourcePackage: TourPackage | null;

  @Column({ name: 'sale_participant_id', type: 'uuid', nullable: true })
  saleParticipantId: string | null;

  @ManyToOne(() => SaleParticipant, { eager: true, nullable: true })
  @JoinColumn({ name: 'sale_participant_id' })
  saleParticipant: SaleParticipant | null;

  @Column({ name: 'visitor_name_snapshot', type: 'varchar', length: 120, nullable: true })
  visitorNameSnapshot: string | null;

  @Column({ name: 'participant_type', type: 'varchar', length: 20, default: VisitorType.ADULT })
  participantType: VisitorType;

  @Column({ name: 'sequence_in_sale', type: 'int' })
  sequenceInSale: number;

  @Column({ name: 'total_in_sale', type: 'int', default: 1 })
  totalInSale: number;

  @Column({ type: 'varchar', length: 20, default: TicketStatus.AVAILABLE })
  status: TicketStatus;

  @Column({ name: 'valid_from', type: 'varchar', length: 15 })
  validFrom: string;

  @Column({ name: 'valid_until', type: 'varchar', length: 15 })
  validUntil: string;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'used_by_user_id', type: 'uuid', nullable: true })
  usedByUserId: string | null;

  @Column({ name: 'used_by_username', type: 'varchar', length: 80, nullable: true })
  usedByUsername: string | null;

  @Column({ name: 'used_at_access_point', type: 'varchar', length: 100, nullable: true })
  usedAtAccessPoint: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason: string | null;

  @Column({ name: 'print_count', type: 'int', default: 0 })
  printCount: number;

  @Column({ name: 'last_printed_at', type: 'timestamptz', nullable: true })
  lastPrintedAt: Date | null;

  @Column({ name: 'instructions_snapshot', type: 'text', nullable: true })
  instructionsSnapshot: string | null;

  @Column({ name: 'restrictions_snapshot', type: 'text', nullable: true })
  restrictionsSnapshot: string | null;

  @CreateDateColumn({ name: 'issued_at' })
  issuedAt: Date;
}

// 22. ticket_validations
@Entity('ticket_validations')
export class TicketValidation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ticket_id', type: 'uuid', nullable: true })
  ticketId: string | null;

  @ManyToOne(() => Ticket, { eager: true, nullable: true })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket | null;

  @Column({ name: 'service_id', type: 'uuid', nullable: true })
  serviceId: string | null;

  @ManyToOne(() => Service, { eager: true, nullable: true })
  @JoinColumn({ name: 'service_id' })
  service: Service | null;

  @Column({ name: 'validated_by_user_id' })
  validatedByUserId: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'validated_by_user_id' })
  validatedByUser: User;

  @Column({ name: 'validation_result', type: 'varchar', length: 40 })
  validationResult: ValidationResultCode;

  @Column({ name: 'previous_status', type: 'varchar', length: 20, nullable: true })
  previousStatus: string | null;

  @Column({ name: 'new_status', type: 'varchar', length: 20, nullable: true })
  newStatus: string | null;

  @Column({ name: 'access_point', type: 'varchar', length: 100 })
  accessPoint: string;

  @Column({ name: 'device_info', type: 'varchar', length: 255, nullable: true })
  deviceInfo: string | null;

  @Column({ name: 'safety_instructions_accepted', default: false })
  safetyInstructionsAccepted: boolean;

  @Column({ name: 'safety_harness_checked', default: false })
  safetyHarnessChecked: boolean;

  @Column({ name: 'safety_helmet_checked', default: false })
  safetyHelmetChecked: boolean;

  @Column({ name: 'operator_notes', type: 'text', nullable: true })
  operatorNotes: string | null;

  @CreateDateColumn({ name: 'validated_at' })
  validatedAt: Date;
}

// 23. activity_incidents
@Entity('activity_incidents')
export class ActivityIncident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'service_id' })
  serviceId: string;

  @ManyToOne(() => Service, { eager: true })
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'ticket_id', type: 'uuid', nullable: true })
  ticketId: string | null;

  @ManyToOne(() => Ticket, { eager: true, nullable: true })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket | null;

  @Column({ name: 'reported_by_user_id' })
  reportedByUserId: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'reported_by_user_id' })
  reportedByUser: User;

  @Column({ type: 'varchar', length: 20, default: IncidentSeverity.MEDIUM })
  severity: IncidentSeverity;

  @Column({ name: 'incident_type', type: 'varchar', length: 50 })
  incidentType: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'resolution_taken', type: 'text', nullable: true })
  resolutionTaken: string | null;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: 'OPEN' | 'RESOLVED';

  @CreateDateColumn({ name: 'occurred_at' })
  occurredAt: Date;
}

// 24. audit_logs
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 60 })
  action: string;

  @Column({ name: 'entity_name', type: 'varchar', length: 60 })
  entityName: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 80, nullable: true })
  entityId: string | null;

  @Column({ name: 'details_json', type: 'simple-json', nullable: true })
  detailsJson: Record<string, any> | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

// Entidad auxiliar del Módulo Fiscal RD (Secuencias NCF y preparación e-CF)
@Entity('fiscal_sequences')
export class FiscalSequence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ncf_type', type: 'varchar', unique: true, length: 10 })
  ncfType: NcfType;

  @Column({ length: 80 })
  description: string;

  @Column({ length: 5 })
  prefix: string;

  @Column({ name: 'current_number', type: 'int', default: 1 })
  currentNumber: number;

  @Column({ name: 'max_number', type: 'int', default: 50000 })
  maxNumber: number;

  @Column({ name: 'expiration_date', length: 15, default: '2027-12-31' })
  expirationDate: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}

export const ALL_ENTITIES = [
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
  Visitor,
  CashRegister,
  CashSession,
  Sale,
  SaleItem,
  SaleParticipant,
  PaymentMethod,
  Payment,
  CashMovement,
  Ticket,
  TicketValidation,
  ActivityIncident,
  AuditLog,
  FiscalSequence,
];
