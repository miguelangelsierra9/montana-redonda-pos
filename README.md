# MONTAÑA REDONDA PARADISE — SISTEMA POS, FACTURACIÓN Y CONTROL DE ACTIVIDADES TURÍSTICAS QR
**Michés, El Seibo, República Dominicana**

Sistema empresarial completo de Punto de Venta (POS) presencial en recepción, facturación con módulo fiscal RD independiente, caja multimoneda (`DOP` / `USD`), generación automática de tickets individuales con códigos QR criptográficos y validación atómica con control operativo de actividades.

---

## 1. Requisitos e Instalación Rápida

### Tecnologías utilizadas
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, `shadcn/ui` primitives, Recharts, `qrcode.react`, `html5-qrcode`, `jspdf`.
- **Backend:** NestJS 10, TypeScript, TypeORM, JWT, Passport, `bcryptjs`, `exceljs`, `qrcode`.
- **Base de Datos:** PostgreSQL 16 (24 tablas relacionales + secuencias fiscales NCF + triggers de inmutabilidad histórica).
- **Gestor de Monorepo:** `pnpm` workspaces + Docker / Docker Compose.

### Comandos principales
```bash
# 1. Instalar dependencias del monorepo
pnpm install

# 2. Levantar PostgreSQL 16 (con Docker Compose)
pnpm run db:up

# 3. Ejecutar suite completa de pruebas automatizadas E2E contra PostgreSQL
pnpm run test:e2e

# 4. Compilar todos los paquetes (Shared + Backend + Frontend)
pnpm run build

# 5. Iniciar Backend (http://localhost:4000/api) y Frontend (http://localhost:3000)
pnpm run dev
```

---

## 2. Credenciales Iniciales por Rol (RBAC)

El sistema crea automáticamente los **5 roles oficiales** con la contraseña **`Montana2026*`**:

| Usuario | Contraseña | Rol | Permisos Principales |
| :--- | :--- | :--- | :--- |
| `admin` | `Montana2026*` | **ADMINISTRADOR** | Acceso total: POS, anulaciones, catálogo, precios, tasas, fiscal RD, usuarios y auditoría. |
| `gerente` | `Montana2026*` | **GERENTE** | Ventas, reportes, catálogo de servicios, paquetes, anulaciones y operaciones. |
| `cajero` | `Montana2026*` | **CAJERO** | Ventas POS, cobros multimoneda (`DOP`/`USD`), apertura, movimientos y cierre de caja. |
| `recepcion` | `Montana2026*` | **RECEPCIÓN** | Ventas rápidas, asignación de participantes, consulta e impresión de facturas y tickets. |
| `operador` | `Montana2026*` | **OPERADOR** | Escaneo y validación atómica de tickets QR, controles de seguridad (Zip Line / Buggies) e incidencias. |

