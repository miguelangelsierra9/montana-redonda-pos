export enum RoleCode {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  RECEPTION = 'RECEPTION',
  OPERATOR = 'OPERATOR',
}

export enum CurrencyCode {
  DOP = 'DOP',
  USD = 'USD',
}

export enum TicketStatus {
  ISSUED = 'ISSUED',         // Emitido (pendiente de pago si no hay override)
  AVAILABLE = 'AVAILABLE',   // Disponible para usar (venta pagada o autorizada)
  USED = 'USED',             // Utilizado (escaneado y consumido atómicamente)
  CANCELLED = 'CANCELLED',   // Anulado
  EXPIRED = 'EXPIRED',       // Vencido
}

export enum SaleStatus {
  DRAFT = 'DRAFT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  VOIDED = 'VOIDED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethodCode {
  CASH_DOP = 'CASH_DOP',
  CASH_USD = 'CASH_USD',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
}

export enum ValidationResultCode {
  APPROVED = 'APPROVED',
  REJECTED_ALREADY_USED = 'REJECTED_ALREADY_USED',
  REJECTED_CANCELLED = 'REJECTED_CANCELLED',
  REJECTED_EXPIRED = 'REJECTED_EXPIRED',
  REJECTED_UNPAID = 'REJECTED_UNPAID',
  REJECTED_WRONG_ACTIVITY = 'REJECTED_WRONG_ACTIVITY',
  REJECTED_INVALID_QR = 'REJECTED_INVALID_QR',
  REJECTED_SAFETY_CHECK = 'REJECTED_SAFETY_CHECK',
}

export enum NcfType {
  NONE = 'NONE',
  B01 = 'B01', // Crédito Fiscal
  B02 = 'B02', // Consumo Final
  B04 = 'B04', // Nota de Crédito
  B14 = 'B14', // Regímenes Especiales
  B15 = 'B15', // Gubernamental
  E31 = 'E31', // e-CF Crédito Fiscal (Preparación)
  E32 = 'E32', // e-CF Consumo (Preparación)
  E34 = 'E34', // e-CF Nota de Crédito (Preparación)
}

export enum RateType {
  GENERAL = 'GENERAL',
  ADULT = 'ADULT',
  CHILD = 'CHILD',
  LOCAL_DOMINICAN = 'LOCAL_DOMINICAN',
  GROUP = 'GROUP',
}

export enum VisitorType {
  ADULT = 'ADULT',
  CHILD = 'CHILD',
}

export enum CashSessionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum CashMovementType {
  OPENING = 'OPENING',
  SALE_IN = 'SALE_IN',
  REFUND_OUT = 'REFUND_OUT',
  EXPENSE_OUT = 'EXPENSE_OUT',
  WITHDRAWAL_OUT = 'WITHDRAWAL_OUT',
  CASH_IN = 'CASH_IN',
}

export enum IncidentSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

