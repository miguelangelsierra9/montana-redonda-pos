'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Mountain,
  ShoppingCart,
  QrCode,
  FileText,
  BarChart3,
  Wallet,
  Layers,
  Settings,
  LogOut,
  Plus,
  Minus,
  Trash2,
  Search,
  Users,
  Tag,
  Printer,
  Ticket as TicketIcon,
  CheckCircle2,
  Ban,
  ShieldAlert,
  Sparkles,
  CreditCard,
  Banknote,
} from 'lucide-react';
import {
  apiFetch,
  formatDop,
  formatUsd,
  getStoredToken,
  setStoredAuth,
  clearStoredAuth,
  getApiBase,
  getCustomApiUrl,
  setCustomApiUrl,
} from '@/lib/api';
import { PrintCenterModal } from '@/components/PrintCenterModal';
import { ScannerAndOperationsView } from '@/components/ScannerAndOperationsView';
import { DashboardAndReportsView } from '@/components/DashboardAndReportsView';
import { CashCatalogSettingsView } from '@/components/CashCatalogSettingsView';

type MainTab =
  | 'POS'
  | 'INVOICES_TICKETS'
  | 'SCANNER_OPS'
  | 'DASHBOARD_REPORTS'
  | 'CASH'
  | 'CATALOG'
  | 'SETTINGS';

interface CartItem {
  key: string;
  itemType: 'SERVICE' | 'PACKAGE';
  serviceId?: string;
  packageId?: string;
  code: string;
  name: string;
  unitPriceDop: number;
  unitPriceUsd: number;
  taxRate: number;
  quantity: number;
  ticketsPerUnit: number;
  assignedParticipantIndices?: number[];
}

interface ParticipantRow {
  displayName: string;
  participantType: 'ADULT' | 'CHILD';
  nationality: string;
}

function generateIdempotencyUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `mrp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function MontanaRedondaApp() {
  // Autenticación
  const [authUser, setAuthUser] = useState<any>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loadingApp, setLoadingApp] = useState(true);

  // Datos maestros desde PostgreSQL
  const [bootstrapData, setBootstrapData] = useState<any>(null);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<MainTab>('POS');

  // ==================== ESTADO DEL POS (SECCIÓN 3 Y 4) ====================
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [displayCurrency, setDisplayCurrency] = useState<'DOP' | 'USD'>('DOP');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleIdempotencyKey, setSaleIdempotencyKey] = useState<string>(() => generateIdempotencyUuid());

  // Participantes (Sección 4)
  const [adultCount, setAdultCount] = useState<number>(4);
  const [childCount, setChildCount] = useState<number>(0);
  const [showParticipantsPanel, setShowParticipantsPanel] = useState<boolean>(false);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);

  // Datos de Factura / Descuento / Pagos
  const [customerName, setCustomerName] = useState('');
  const [customerRncCedula, setCustomerRncCedula] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [ncfType, setNcfType] = useState<string>('B02');
  const [discountAmountDop, setDiscountAmountDop] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>('');
  const [showDiscountInput, setShowDiscountInput] = useState<boolean>(false);

  // Pagos (Efectivo DOP, Efectivo USD, Tarjeta, Transferencia, Pago Combinado)
  const [paymentMode, setPaymentMode] = useState<
    'CASH_DOP' | 'CASH_USD' | 'CARD' | 'TRANSFER' | 'COMBINED'
  >('CASH_DOP');
  const [cashTenderedDop, setCashTenderedDop] = useState<string>('');
  const [cashTenderedUsd, setCashTenderedUsd] = useState<string>('');
  const [cardAmountDop, setCardAmountDop] = useState<string>('');
  const [transferAmountDop, setTransferAmountDop] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [submittingSale, setSubmittingSale] = useState<boolean>(false);
  const [posAlert, setPosAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Última venta completada y Modal de Impresión de Factura/Tickets
  const [lastCompletedSale, setLastCompletedSale] = useState<any>(null);
  const [printModalState, setPrintModalState] = useState<{
    open: boolean;
    sale: any;
    mode: 'INVOICE' | 'TICKETS';
  }>({ open: false, sale: null, mode: 'TICKETS' });

  // Modal de Anulación de Factura
  const [voidModalSale, setVoidModalSale] = useState<any>(null);
  const [voidReason, setVoidReason] = useState<string>('');

  const loadBootstrapAndSales = async () => {
    try {
      const [boot, sales] = await Promise.all([apiFetch('/bootstrap'), apiFetch('/sales')]);
      setBootstrapData(boot);
      setSalesHistory(sales);
      setAuthUser(boot.user);
      if (sales.length > 0 && !lastCompletedSale) {
        setLastCompletedSale(sales[0]);
      }
    } catch {
      clearStoredAuth();
      setAuthUser(null);
    } finally {
      setLoadingApp(false);
    }
  };

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      loadBootstrapAndSales();
    } else {
      setLoadingApp(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      setStoredAuth(res.accessToken, res.user);
      setAuthUser(res.user);
      if (res.user.roleCode === 'OPERATOR') {
        setActiveTab('SCANNER_OPS');
      } else {
        setActiveTab('POS');
      }
      await loadBootstrapAndSales();
    } catch (err: any) {
      setLoginError(err.message || 'Error de autenticación');
    }
  };

  const handleLogout = () => {
    clearStoredAuth();
    setAuthUser(null);
    setBootstrapData(null);
  };

  const exchangeRate = Number(bootstrapData?.company?.exchangeRateUsdToDop || 60.5);

  // ==================== OPERACIONES DEL CARRITO POS ====================
  const handleStartNewSale = () => {
    setCart([]);
    setSaleIdempotencyKey(generateIdempotencyUuid());
    setCustomerName('');
    setCustomerRncCedula('');
    setCustomerPhone('');
    setCustomerEmail('');
    setDiscountAmountDop(0);
    setDiscountReason('');
    setParticipants([]);
    setCashTenderedDop('');
    setCashTenderedUsd('');
    setCardAmountDop('');
    setTransferAmountDop('');
    setPaymentReference('');
    setPosAlert(null);
  };

  // Cargar con 1 clic el ejemplo oficial de la Sección 3 (Familia de 4: 4 Entradas, 4 Zip Line, 2 Buggies = 10 Tickets)
  const handleLoadFamilyExample = () => {
    const services: any[] = bootstrapData?.services || [];
    const ent = services.find((s) => s.code === 'ENT-GEN');
    const zip = services.find((s) => s.code === 'ACT-ZIP');
    const bug = services.find((s) => s.code === 'ACT-BUG');
    if (!ent || !zip || !bug) return;

    const getDop = (s: any) =>
      Number(s.prices?.find((p: any) => p.currency === 'DOP')?.unitPrice || 0);
    const getUsd = (s: any) =>
      Number(s.prices?.find((p: any) => p.currency === 'USD')?.unitPrice || 0);

    setAdultCount(4);
    setChildCount(0);
    setParticipants([
      { displayName: 'Carlos Martínez', participantType: 'ADULT', nationality: 'Dominicana' },
      { displayName: 'Ana Rodríguez', participantType: 'ADULT', nationality: 'Dominicana' },
      { displayName: 'Luis Martínez', participantType: 'CHILD', nationality: 'Dominicana' },
      { displayName: 'Sofía Martínez', participantType: 'CHILD', nationality: 'Dominicana' },
    ]);
    setCustomerName('Familia Martínez Rodríguez');
    setSaleIdempotencyKey(generateIdempotencyUuid());

    setCart([
      {
        key: `SERVICE-${ent.id}`,
        itemType: 'SERVICE',
        serviceId: ent.id,
        code: ent.code,
        name: ent.name,
        unitPriceDop: getDop(ent),
        unitPriceUsd: getUsd(ent),
        taxRate: Number(ent.taxSetting?.ratePercentage ?? 18),
        quantity: 4,
        ticketsPerUnit: 1,
      },
      {
        key: `SERVICE-${zip.id}`,
        itemType: 'SERVICE',
        serviceId: zip.id,
        code: zip.code,
        name: zip.name,
        unitPriceDop: getDop(zip),
        unitPriceUsd: getUsd(zip),
        taxRate: Number(zip.taxSetting?.ratePercentage ?? 18),
        quantity: 4,
        ticketsPerUnit: 1,
      },
      {
        key: `SERVICE-${bug.id}`,
        itemType: 'SERVICE',
        serviceId: bug.id,
        code: bug.code,
        name: bug.name,
        unitPriceDop: getDop(bug),
        unitPriceUsd: getUsd(bug),
        taxRate: Number(bug.taxSetting?.ratePercentage ?? 18),
        quantity: 2,
        ticketsPerUnit: 1,
      },
    ]);
  };

  const addServiceToCart = (service: any) => {
    const dop = Number(
      service.prices?.find((p: any) => p.currency === 'DOP')?.unitPrice || 0
    );
    const usd = Number(
      service.prices?.find((p: any) => p.currency === 'USD')?.unitPrice ||
        (dop / exchangeRate).toFixed(2)
    );
    const key = `SERVICE-${service.id}`;

    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          key,
          itemType: 'SERVICE',
          serviceId: service.id,
          code: service.code,
          name: service.name,
          unitPriceDop: dop,
          unitPriceUsd: usd,
          taxRate: Number(service.taxSetting?.ratePercentage ?? 18),
          quantity: 1,
          ticketsPerUnit: 1,
        },
      ];
    });
  };

  const addPackageToCart = (pkg: any) => {
    const key = `PACKAGE-${pkg.id}`;
    const ticketsPerUnit = (pkg.items || []).reduce(
      (acc: number, it: any) => acc + Number(it.quantityPerPackage || 1),
      0
    );

    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          key,
          itemType: 'PACKAGE',
          packageId: pkg.id,
          code: pkg.code,
          name: pkg.name,
          unitPriceDop: Number(pkg.priceDop),
          unitPriceUsd: Number(pkg.priceUsd),
          taxRate: Number(pkg.taxSetting?.ratePercentage ?? 18),
          quantity: 1,
          ticketsPerUnit: Math.max(1, ticketsPerUnit),
        },
      ];
    });
  };

  const updateCartItemQuantity = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.key !== key) return item;
          const nextQty = item.quantity + delta;
          return nextQty > 0 ? { ...item, quantity: nextQty } : null;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const setExactCartItemQuantity = (key: string, qty: number) => {
    const safeQty = Math.max(1, Math.min(200, Number(qty || 1)));
    setCart((prev) => prev.map((item) => (item.key === key ? { ...item, quantity: safeQty } : item)));
  };

  const removeCartItem = (key: string) => {
    setCart((prev) => prev.filter((item) => item.key !== key));
  };

  // Cálculos matemáticos del Carrito POS
  const cartTotals = useMemo(() => {
    let subtotalDop = 0;
    let rawTaxDop = 0;
    let totalTicketsToEmit = 0;

    for (const item of cart) {
      const lineSub = item.unitPriceDop * item.quantity;
      const lineTax = (lineSub * item.taxRate) / 100;
      subtotalDop += lineSub;
      rawTaxDop += lineTax;
      totalTicketsToEmit += item.quantity * item.ticketsPerUnit;
    }

    const safeDiscount = Math.min(subtotalDop, Math.max(0, Number(discountAmountDop || 0)));
    const netRatio = subtotalDop > 0 ? (subtotalDop - safeDiscount) / subtotalDop : 1;
    const taxDop = Number((rawTaxDop * netRatio).toFixed(2));
    const totalDop = Number(Math.max(0, subtotalDop - safeDiscount + taxDop).toFixed(2));
    const totalUsd = Number((totalDop / exchangeRate).toFixed(2));

    return {
      subtotalDop: Number(subtotalDop.toFixed(2)),
      discountDop: safeDiscount,
      taxDop,
      totalDop,
      totalUsd,
      totalTicketsToEmit,
    };
  }, [cart, discountAmountDop, exchangeRate]);

  // Sincronizar filas de participantes cuando se abre el panel de participantes
  const syncParticipantsRows = () => {
    const totalVisitors = Math.max(1, Number(adultCount || 0) + Number(childCount || 0));
    setParticipants((prev) => {
      const next: ParticipantRow[] = [];
      for (let i = 0; i < totalVisitors; i++) {
        next.push(
          prev[i] || {
            displayName: '',
            participantType: i < adultCount ? 'ADULT' : 'CHILD',
            nationality: 'Dominicana',
          }
        );
      }
      return next;
    });
  };

  // Cobrar y Generar Factura + N Tickets Individuales QR
  const handleConfirmCheckout = async () => {
    if (!bootstrapData?.activeSession) {
      setPosAlert({
        type: 'error',
        text: 'CAJA CERRADA: No puede realizar ventas sin antes abrir su sesión de caja en el módulo "Caja DOP/USD".',
      });
      return;
    }

    if (cart.length === 0) {
      setPosAlert({ type: 'error', text: 'Agregue al menos un servicio o paquete antes de cobrar.' });
      return;
    }

    setSubmittingSale(true);
    setPosAlert(null);

    try {
      let paymentsPayload: Array<{
        paymentMethodCode: string;
        amountOriginal: number;
        referenceNumber?: string;
      }> = [];

      if (paymentMode === 'CASH_DOP') {
        const tendered = Number(cashTenderedDop) > 0 ? Number(cashTenderedDop) : cartTotals.totalDop;
        paymentsPayload = [{ paymentMethodCode: 'CASH_DOP', amountOriginal: tendered }];
      } else if (paymentMode === 'CASH_USD') {
        const tenderedUsd = Number(cashTenderedUsd) > 0 ? Number(cashTenderedUsd) : cartTotals.totalUsd;
        paymentsPayload = [{ paymentMethodCode: 'CASH_USD', amountOriginal: tenderedUsd }];
      } else if (paymentMode === 'CARD') {
        paymentsPayload = [
          {
            paymentMethodCode: 'CARD',
            amountOriginal: cartTotals.totalDop,
            referenceNumber: paymentReference || 'VERIFONE-POS',
          },
        ];
      } else if (paymentMode === 'TRANSFER') {
        paymentsPayload = [
          {
            paymentMethodCode: 'TRANSFER',
            amountOriginal: cartTotals.totalDop,
            referenceNumber: paymentReference || 'TRANSF-BANCO',
          },
        ];
      } else if (paymentMode === 'COMBINED') {
        if (Number(cashTenderedDop) > 0) {
          paymentsPayload.push({
            paymentMethodCode: 'CASH_DOP',
            amountOriginal: Number(cashTenderedDop),
          });
        }
        if (Number(cashTenderedUsd) > 0) {
          paymentsPayload.push({
            paymentMethodCode: 'CASH_USD',
            amountOriginal: Number(cashTenderedUsd),
          });
        }
        if (Number(cardAmountDop) > 0) {
          paymentsPayload.push({
            paymentMethodCode: 'CARD',
            amountOriginal: Number(cardAmountDop),
            referenceNumber: paymentReference || 'TARJETA-MIXTA',
          });
        }
        if (Number(transferAmountDop) > 0) {
          paymentsPayload.push({
            paymentMethodCode: 'TRANSFER',
            amountOriginal: Number(transferAmountDop),
            referenceNumber: paymentReference || 'TRANSF-MIXTA',
          });
        }
        if (paymentsPayload.length === 0) {
          paymentsPayload = [{ paymentMethodCode: 'CASH_DOP', amountOriginal: cartTotals.totalDop }];
        }
      }

      const createdSale = await apiFetch('/sales', {
        method: 'POST',
        idempotencyKey: saleIdempotencyKey,
        body: JSON.stringify({
          idempotencyKey: saleIdempotencyKey,
          customerName: customerName || null,
          customerRncCedula: customerRncCedula || null,
          customerPhone: customerPhone || null,
          customerEmail: customerEmail || null,
          ncfType,
          currency: displayCurrency,
          exchangeRate,
          adultCount,
          childCount,
          discountAmountDop: cartTotals.discountDop,
          discountReason: discountReason || null,
          items: cart.map((c) => ({
            itemType: c.itemType,
            serviceId: c.serviceId,
            packageId: c.packageId,
            quantity: c.quantity,
            unitPriceDop: c.unitPriceDop,
            assignedParticipantIndices: c.assignedParticipantIndices,
          })),
          participants,
          payments: paymentsPayload,
        }),
      });

      setLastCompletedSale(createdSale);
      setPrintModalState({ open: true, sale: createdSale, mode: 'TICKETS' });
      handleStartNewSale();
      await loadBootstrapAndSales();
      setPosAlert({
        type: 'success',
        text: `¡Venta completada! Factura ${createdSale.invoiceNumber} emitida con ${
          createdSale.tickets?.length || 0
        } tickets individuales QR.`,
      });
    } catch (err: any) {
      setPosAlert({ type: 'error', text: err.message || 'Error al registrar la venta.' });
    } finally {
      setSubmittingSale(false);
    }
  };

  // Anular Factura
  const handleConfirmVoidSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalSale || !voidReason) return;
    try {
      await apiFetch(`/sales/${voidModalSale.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason }),
      });
      setVoidModalSale(null);
      setVoidReason('');
      await loadBootstrapAndSales();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Filtrado de Servicios y Paquetes en el Catálogo Izquierdo del POS
  const filteredServices = useMemo(() => {
    const list: any[] = bootstrapData?.services || [];
    return list.filter((s) => {
      if (s.status !== 'ACTIVE') return false;
      if (selectedCategoryId !== 'ALL' && selectedCategoryId !== 'PACKAGES' && s.categoryId !== selectedCategoryId) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
      }
      return true;
    });
  }, [bootstrapData?.services, selectedCategoryId, searchQuery]);

  const filteredPackages = useMemo(() => {
    if (selectedCategoryId !== 'ALL' && selectedCategoryId !== 'PACKAGES') return [];
    const list: any[] = bootstrapData?.packages || [];
    return list.filter((p) => {
      if (p.status !== 'ACTIVE') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
      }
      return true;
    });
  }, [bootstrapData?.packages, selectedCategoryId, searchQuery]);

  // ==================== PANTALLA DE LOGIN ====================
  if (loadingApp) {
    return (
      <div className="min-h-screen bg-mountain-950 text-white flex flex-col items-center justify-center p-6">
        <Mountain className="w-14 h-14 text-gold-400 animate-bounce mb-3" />
        <h1 className="text-xl font-black tracking-wide">MONTAÑA REDONDA PARADISE</h1>
        <p className="text-xs text-mountain-200 mt-1">
          Cargando Sistema POS, Facturación y Control de Actividades QR...
        </p>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-mountain-950 via-mountain-900 to-ocean-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-white/20">
          <div className="bg-mountain-800 text-white p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gold-500/20 border border-gold-400/40 flex items-center justify-center mx-auto mb-3">
              <Mountain className="w-8 h-8 text-gold-400" />
            </div>
            <h1 className="text-xl font-black tracking-wide">MONTAÑA REDONDA PARADISE</h1>
            <p className="text-xs text-mountain-100 mt-1">
              Michés, República Dominicana • Sistema POS & Control de Tickets QR
            </p>
          </div>

          <form onSubmit={handleLogin} className="p-6 space-y-4">
            {loginError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Usuario o Correo Electrónico
              </label>
              <input
                type="text"
                placeholder="Ingrese su usuario"
                autoComplete="username"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-mountain-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Contraseña</label>
              <input
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-mountain-600"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-mountain-700 hover:bg-mountain-800 text-white font-black text-sm shadow-lg transition"
            >
              Iniciar Sesión en el Sistema
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==================== APLICACIÓN PRINCIPAL AUTENTICADA ====================
  return (
    <div className="min-h-screen flex flex-col bg-earth-50">
      {/* Barra Superior de Navegación e Identidad */}
      <header className="no-print bg-mountain-900 text-white border-b border-mountain-800 px-4 py-2.5 shadow-md sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Marca */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold-500/20 border border-gold-400/40 flex items-center justify-center">
              <Mountain className="w-6 h-6 text-gold-400" />
            </div>
            <div>
              <div className="font-black text-sm tracking-wide flex items-center gap-2">
                MONTAÑA REDONDA PARADISE
                <span className="px-2 py-0.5 rounded-full bg-gold-500 text-slate-950 text-[10px] font-black">
                  MICHÉS, RD
                </span>
              </div>
              <div className="text-[11px] text-mountain-200 flex items-center gap-3">
                <span>
                  Caja:{' '}
                  <strong>
                    {bootstrapData?.activeSession?.cashRegister?.code || 'SIN CAJA ABIERTA'}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Tasa USD: <strong>RD$ {exchangeRate.toFixed(2)}</strong>
                </span>
                <span>•</span>
                <span>
                  RNC: <strong>{bootstrapData?.company?.rnc}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Navegación por Módulos */}
          <nav className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveTab('POS')}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                activeTab === 'POS'
                  ? 'bg-gold-500 text-slate-950 shadow'
                  : 'bg-mountain-800/80 text-white hover:bg-mountain-700'
              }`}
            >
              <ShoppingCart className="w-4 h-4" /> Punto de Venta (POS)
            </button>

            <button
              onClick={() => setActiveTab('SCANNER_OPS')}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                activeTab === 'SCANNER_OPS'
                  ? 'bg-gold-500 text-slate-950 shadow'
                  : 'bg-mountain-800/80 text-white hover:bg-mountain-700'
              }`}
            >
              <QrCode className="w-4 h-4" /> Escáner QR & Actividades
            </button>

            <button
              onClick={() => setActiveTab('INVOICES_TICKETS')}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                activeTab === 'INVOICES_TICKETS'
                  ? 'bg-gold-500 text-slate-950 shadow'
                  : 'bg-mountain-800/80 text-white hover:bg-mountain-700'
              }`}
            >
              <FileText className="w-4 h-4" /> Facturas & Tickets ({salesHistory.length})
            </button>

            <button
              onClick={() => setActiveTab('CASH')}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                activeTab === 'CASH'
                  ? 'bg-gold-500 text-slate-950 shadow'
                  : 'bg-mountain-800/80 text-white hover:bg-mountain-700'
              }`}
            >
              <Wallet className="w-4 h-4" /> Caja DOP/USD
            </button>

            <button
              onClick={() => setActiveTab('CATALOG')}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                activeTab === 'CATALOG'
                  ? 'bg-gold-500 text-slate-950 shadow'
                  : 'bg-mountain-800/80 text-white hover:bg-mountain-700'
              }`}
            >
              <Layers className="w-4 h-4" /> Catálogo & Paquetes
            </button>

            <button
              onClick={() => setActiveTab('DASHBOARD_REPORTS')}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                activeTab === 'DASHBOARD_REPORTS'
                  ? 'bg-gold-500 text-slate-950 shadow'
                  : 'bg-mountain-800/80 text-white hover:bg-mountain-700'
              }`}
            >
              <BarChart3 className="w-4 h-4" /> Dashboard & 13 Reportes
            </button>

            <button
              onClick={() => setActiveTab('SETTINGS')}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                activeTab === 'SETTINGS'
                  ? 'bg-gold-500 text-slate-950 shadow'
                  : 'bg-mountain-800/80 text-white hover:bg-mountain-700'
              }`}
            >
              <Settings className="w-4 h-4" /> Fiscal RD & Auditoría
            </button>
          </nav>

          {/* Usuario Activo y Cierre de Sesión */}
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold">{authUser.employeeName || authUser.username}</div>
              <div className="text-[10px] text-gold-400 font-extrabold uppercase">
                ROL: {authUser.roleCode}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="p-2 rounded-xl bg-mountain-800 hover:bg-red-600 text-white transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4">
        {/* ==================== VISTA 1: MÓDULO DE PUNTO DE VENTA (POS) ==================== */}
        {activeTab === 'POS' && (
          <div className="space-y-4">
            {/* Alerta de Bloqueo si la Caja NO está Abierta */}
            {!bootstrapData?.activeSession && (
              <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3 text-red-900">
                  <ShieldAlert className="w-7 h-7 text-red-600 shrink-0" />
                  <div>
                    <h3 className="text-sm font-black uppercase">
                      CAJA CERRADA — Apertura de Turno Obligatoria Antes de Vender
                    </h3>
                    <p className="text-xs text-red-800 mt-0.5">
                      Por control financiero, ningún cajero o empleado puede registrar ventas ni emitir tickets sin haber abierto primero su sesión de caja con su fondo inicial en DOP / USD.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('CASH')}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase flex items-center gap-2 shadow"
                >
                  <Wallet className="w-4 h-4" /> Ir a Abrir Caja Ahora
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ÁREA IZQUIERDA (7 Columnas): CATÁLOGO DE ACTIVIDADES, SERVICIOS Y PAQUETES */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
              {/* Buscador, Moneda y Botón de Ejemplo Familiar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar servicio o paquete por nombre o código (ej. ENT-GEN, ZIP, BUG)..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-mountain-600"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setDisplayCurrency((prev) => (prev === 'DOP' ? 'USD' : 'DOP'))
                    }
                    className="px-3 py-2 rounded-xl bg-ocean-800 text-white text-xs font-extrabold"
                  >
                    Moneda: {displayCurrency}
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadFamilyExample}
                    className="px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-extrabold flex items-center gap-1"
                    title="Carga el ejemplo exacto del documento: 4 Entradas + 4 Zip Line + 2 Buggies = 10 Tickets QR"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" /> Cargar Ejemplo Familia (10 Tickets)
                  </button>
                </div>
              </div>

              {/* Filtros por Categorías */}
              <div className="flex flex-wrap gap-1.5 pb-1">
                <button
                  onClick={() => setSelectedCategoryId('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    selectedCategoryId === 'ALL'
                      ? 'bg-mountain-800 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setSelectedCategoryId('PACKAGES')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    selectedCategoryId === 'PACKAGES'
                      ? 'bg-ocean-800 text-white'
                      : 'bg-ocean-50 text-ocean-900 border border-ocean-200 hover:bg-ocean-100'
                  }`}
                >
                  📦 Paquetes Turísticos ({(bootstrapData?.packages || []).length})
                </button>
                {(bootstrapData?.categories || []).map((cat: any) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      selectedCategoryId === cat.id
                        ? 'bg-mountain-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Tarjetas Visuales de Servicios y Paquetes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[68vh] overflow-y-auto pr-1">
                {/* Tarjetas de Paquetes Turísticos */}
                {filteredPackages.map((pkg: any) => {
                  const totalTicketsPerPkg = (pkg.items || []).reduce(
                    (acc: number, it: any) => acc + Number(it.quantityPerPackage || 1),
                    0
                  );
                  return (
                    <div
                      key={pkg.id}
                      onClick={() => addPackageToCart(pkg)}
                      className="cursor-pointer group rounded-2xl border-2 border-ocean-200 bg-gradient-to-br from-ocean-50/70 to-white hover:border-ocean-700 hover:shadow-md p-3.5 flex flex-col justify-between transition"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <span className="px-2 py-0.5 rounded bg-ocean-800 text-white text-[10px] font-black uppercase">
                            PAQUETE ({totalTicketsPerPkg} Tickets)
                          </span>
                          <span className="font-mono text-[11px] font-bold text-slate-500">
                            {pkg.code}
                          </span>
                        </div>
                        <h4 className="font-extrabold text-sm text-slate-900 group-hover:text-ocean-900 leading-snug">
                          {pkg.name}
                        </h4>
                        <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">
                          Incluye:{' '}
                          {(pkg.items || [])
                            .map((i: any) => i.service?.name)
                            .filter(Boolean)
                            .join(' + ')}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-ocean-100 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-black text-ocean-900">
                            {formatDop(pkg.priceDop)}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-500">
                            {formatUsd(pkg.priceUsd)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addPackageToCart(pkg);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-ocean-800 group-hover:bg-ocean-900 text-white text-xs font-bold flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Tarjetas de Servicios Individuales */}
                {filteredServices.map((svc: any) => {
                  const dop =
                    svc.prices?.find((p: any) => p.currency === 'DOP')?.unitPrice || 0;
                  const usd =
                    svc.prices?.find((p: any) => p.currency === 'USD')?.unitPrice ||
                    (Number(dop) / exchangeRate).toFixed(2);

                  return (
                    <div
                      key={svc.id}
                      onClick={() => addServiceToCart(svc)}
                      className="cursor-pointer group rounded-2xl border border-slate-200 bg-white hover:border-mountain-600 hover:shadow-md p-3.5 flex flex-col justify-between transition"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <span className="px-2 py-0.5 rounded bg-mountain-100 text-mountain-900 text-[10px] font-bold">
                            {svc.category?.name || 'Actividad'}
                          </span>
                          <span className="font-mono text-[11px] font-bold text-slate-400">
                            {svc.code}
                          </span>
                        </div>
                        <h4 className="font-extrabold text-sm text-slate-900 group-hover:text-mountain-800 leading-snug">
                          {svc.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          {svc.description}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-black text-mountain-800">
                            {displayCurrency === 'DOP' ? formatDop(dop) : formatUsd(usd)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {displayCurrency === 'DOP' ? formatUsd(usd) : formatDop(dop)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addServiceToCart(svc);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-mountain-700 group-hover:bg-mountain-800 text-white text-xs font-bold flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ÁREA DERECHA (5 Columnas): DETALLE DE LA VENTA, PARTICIPANTES, PAGOS Y BOTONES POS */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3.5">
              {/* Botones Superiores: Nueva Venta, Vaciar Carrito, Imprimir Última Factura / Tickets */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleStartNewSale}
                    className="px-3 py-1.5 rounded-xl bg-mountain-700 hover:bg-mountain-800 text-white text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Nueva Venta
                  </button>
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Vaciar Carrito
                  </button>
                </div>

                {lastCompletedSale && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPrintModalState({
                          open: true,
                          sale: lastCompletedSale,
                          mode: 'INVOICE',
                        })
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" /> Imprimir Factura
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPrintModalState({
                          open: true,
                          sale: lastCompletedSale,
                          mode: 'TICKETS',
                        })
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-gold-500 hover:bg-gold-600 text-slate-950 text-xs font-extrabold flex items-center gap-1"
                    >
                      <TicketIcon className="w-3.5 h-3.5" /> Imprimir Tickets (
                      {lastCompletedSale.tickets?.length || 0})
                    </button>
                  </div>
                )}
              </div>

              {posAlert && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold border ${
                    posAlert.type === 'success'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-red-50 border-red-300 text-red-800'
                  }`}
                >
                  {posAlert.text}
                </div>
              )}

              {/* Control Rápido de Participantes (Adultos / Niños + Nombres Opcionales) */}
              <div className="p-3 rounded-xl bg-earth-100 border border-earth-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-mountain-700" /> Participantes de la Venta:
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="font-bold">Adultos:</span>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        value={adultCount}
                        onChange={(e) => setAdultCount(Math.max(0, Number(e.target.value)))}
                        className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-center font-bold bg-white"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold">Niños:</span>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        value={childCount}
                        onChange={(e) => setChildCount(Math.max(0, Number(e.target.value)))}
                        className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-center font-bold bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!showParticipantsPanel && participants.length === 0) {
                          syncParticipantsRows();
                        }
                        setShowParticipantsPanel((prev) => !prev);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-mountain-800 font-bold hover:bg-mountain-50"
                    >
                      {showParticipantsPanel ? 'Ocultar Nombres' : 'Asignar Nombres (Opcional)'}
                    </button>
                  </div>
                </div>

                {showParticipantsPanel && (
                  <div className="pt-2 border-t border-earth-200 space-y-1.5 max-h-40 overflow-y-auto">
                    <div className="flex justify-between items-center text-[11px] text-slate-500">
                      <span>
                        Deje en blanco si es venta rápida sin identificar nominalmente al visitante:
                      </span>
                      <button
                        type="button"
                        onClick={syncParticipantsRows}
                        className="text-mountain-700 font-bold hover:underline"
                      >
                        Ajustar a {adultCount + childCount} filas
                      </button>
                    </div>
                    {participants.map((p, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1.5 text-xs">
                        <input
                          type="text"
                          placeholder={`Nombre Visitante #${idx + 1} (Opcional)`}
                          value={p.displayName}
                          onChange={(e) => {
                            const val = e.target.value;
                            setParticipants((prev) =>
                              prev.map((row, rIdx) =>
                                rIdx === idx ? { ...row, displayName: val } : row
                              )
                            );
                          }}
                          className="col-span-6 rounded-lg border border-slate-300 px-2 py-1 bg-white"
                        />
                        <select
                          value={p.participantType}
                          onChange={(e) => {
                            const val = e.target.value as 'ADULT' | 'CHILD';
                            setParticipants((prev) =>
                              prev.map((row, rIdx) =>
                                rIdx === idx ? { ...row, participantType: val } : row
                              )
                            );
                          }}
                          className="col-span-3 rounded-lg border border-slate-300 px-1.5 py-1 bg-white"
                        >
                          <option value="ADULT">Adulto</option>
                          <option value="CHILD">Niño</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Nacionalidad"
                          value={p.nationality}
                          onChange={(e) => {
                            const val = e.target.value;
                            setParticipants((prev) =>
                              prev.map((row, rIdx) =>
                                rIdx === idx ? { ...row, nationality: val } : row
                              )
                            );
                          }}
                          className="col-span-3 rounded-lg border border-slate-300 px-2 py-1 bg-white"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tabla de Ítems del Carrito */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 text-[11px] font-extrabold uppercase text-slate-600 grid grid-cols-12">
                  <div className="col-span-5">Servicio / Actividad</div>
                  <div className="col-span-3 text-center">Cantidad</div>
                  <div className="col-span-3 text-right">Total</div>
                  <div className="col-span-1 text-right"></div>
                </div>

                {cart.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Seleccione las actividades o paquetes en el catálogo izquierdo para iniciar la venta.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {cart.map((item) => {
                      const lineTotalDop = item.unitPriceDop * item.quantity;
                      const ticketsGenerated = item.quantity * item.ticketsPerUnit;
                      return (
                        <div
                          key={item.key}
                          className="px-3 py-2.5 grid grid-cols-12 items-center text-xs hover:bg-slate-50"
                        >
                          <div className="col-span-5 pr-2">
                            <div className="font-bold text-slate-900 leading-tight">
                              {item.name}
                            </div>
                            <div className="text-[10px] text-mountain-700 font-bold">
                              {formatDop(item.unitPriceDop)} c/u → Genera {ticketsGenerated} ticket(s) QR
                            </div>
                          </div>

                          <div className="col-span-3 flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateCartItemQuantity(item.key, -1)}
                              className="w-6 h-6 rounded-md bg-slate-200 hover:bg-slate-300 flex items-center justify-center font-bold"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) =>
                                setExactCartItemQuantity(item.key, Number(e.target.value))
                              }
                              className="w-11 text-center font-extrabold border border-slate-300 rounded-md py-0.5"
                            />
                            <button
                              type="button"
                              onClick={() => updateCartItemQuantity(item.key, 1)}
                              className="w-6 h-6 rounded-md bg-mountain-100 hover:bg-mountain-200 text-mountain-900 flex items-center justify-center font-bold"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="col-span-3 text-right font-extrabold text-slate-900">
                            {formatDop(lineTotalDop)}
                          </div>

                          <div className="col-span-1 text-right">
                            <button
                              type="button"
                              onClick={() => removeCartItem(item.key)}
                              title="Quitar servicio"
                              className="text-slate-400 hover:text-red-600 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Contador Destacado de Tickets QR Independientes a Emitir */}
              <div className="bg-mountain-900 text-white px-4 py-2.5 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <TicketIcon className="w-4 h-4 text-gold-400" />
                  <span>TICKETS QR INDIVIDUALES A GENERAR:</span>
                </div>
                <span className="px-3 py-0.5 rounded-full bg-gold-500 text-slate-950 font-black text-sm">
                  {cartTotals.totalTicketsToEmit} TICKETS
                </span>
              </div>

              {/* Datos Opcionales de Cliente / RNC / NCF y Descuento */}
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Cliente / Familia (Opcional)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                  <input
                    type="text"
                    placeholder="RNC o Cédula (Opcional)"
                    value={customerRncCedula}
                    onChange={(e) => setCustomerRncCedula(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                  <select
                    value={ncfType}
                    onChange={(e) => setNcfType(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 bg-white font-bold"
                  >
                    <option value="B02">NCF: B02 Consumo</option>
                    <option value="B01">NCF: B01 Crédito Fiscal</option>
                    <option value="B14">NCF: B14 Reg. Especial</option>
                    <option value="B15">NCF: B15 Gubernamental</option>
                    <option value="E32">e-CF: E32 (Prep.)</option>
                  </select>
                </div>

                {/* Botón Aplicar Descuento */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowDiscountInput((prev) => !prev)}
                    className="text-xs font-bold text-mountain-700 hover:underline flex items-center gap-1"
                  >
                    <Tag className="w-3.5 h-3.5" /> Aplicar Descuento Autorizado
                  </button>
                  {cartTotals.discountDop > 0 && (
                    <span className="text-xs font-bold text-emerald-700">
                      -{formatDop(cartTotals.discountDop)}
                    </span>
                  )}
                </div>

                {showDiscountInput && (
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                        Descuento en RD$ (DOP)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={discountAmountDop}
                        onChange={(e) => setDiscountAmountDop(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                        Motivo / Autorización
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Grupo Escolar / Cortesía"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Resumen Financiero de la Venta */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-bold">{formatDop(cartTotals.subtotalDop)}</span>
                </div>
                {cartTotals.discountDop > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Descuento:</span>
                    <span>-{formatDop(cartTotals.discountDop)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>ITBIS (18%):</span>
                  <span className="font-bold">{formatDop(cartTotals.taxDop)}</span>
                </div>
                <div className="pt-2 border-t border-slate-300 flex items-baseline justify-between">
                  <span className="text-sm font-black uppercase text-slate-900">TOTAL A COBRAR:</span>
                  <div className="text-right">
                    <div className="text-xl font-black text-mountain-800">
                      {formatDop(cartTotals.totalDop)}
                    </div>
                    <div className="text-xs font-bold text-ocean-800">
                      Equivalente: {formatUsd(cartTotals.totalUsd)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Selección de Método de Pago (Sección 8: Efectivo DOP, Efectivo USD, Tarjeta, Transferencia, Combinado) */}
              <div className="space-y-2">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Método de Pago:
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-[11px] font-bold">
                  {[
                    { code: 'CASH_DOP', label: 'Efectivo DOP' },
                    { code: 'CASH_USD', label: 'Efectivo USD' },
                    { code: 'CARD', label: 'Tarjeta' },
                    { code: 'TRANSFER', label: 'Transferencia' },
                    { code: 'COMBINED', label: 'Combinado' },
                  ].map((m) => (
                    <button
                      key={m.code}
                      type="button"
                      onClick={() => setPaymentMode(m.code as any)}
                      className={`py-2 px-2 rounded-lg border text-center transition ${
                        paymentMode === m.code
                          ? 'bg-ocean-800 text-white border-ocean-900 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {paymentMode === 'CASH_DOP' && (
                  <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-mountain-700" />
                      <span className="font-bold">Recibido DOP:</span>
                    </div>
                    <input
                      type="number"
                      placeholder={String(cartTotals.totalDop)}
                      value={cashTenderedDop}
                      onChange={(e) => setCashTenderedDop(e.target.value)}
                      className="w-32 rounded-lg border border-slate-300 px-2.5 py-1 text-right font-bold bg-white"
                    />
                    <div className="text-right">
                      <span className="text-slate-500">Devuelta: </span>
                      <strong className="text-mountain-800">
                        {formatDop(
                          Math.max(0, Number(cashTenderedDop || 0) - cartTotals.totalDop)
                        )}
                      </strong>
                    </div>
                  </div>
                )}

                {paymentMode === 'CASH_USD' && (
                  <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                    <span className="font-bold">Recibido USD:</span>
                    <input
                      type="number"
                      placeholder={String(cartTotals.totalUsd)}
                      value={cashTenderedUsd}
                      onChange={(e) => setCashTenderedUsd(e.target.value)}
                      className="w-28 rounded-lg border border-slate-300 px-2.5 py-1 text-right font-bold bg-white"
                    />
                    <span>
                      Devuelta DOP:{' '}
                      <strong>
                        {formatDop(
                          Math.max(
                            0,
                            Number(cashTenderedUsd || 0) * exchangeRate - cartTotals.totalDop
                          )
                        )}
                      </strong>
                    </span>
                  </div>
                )}

                {(paymentMode === 'CARD' || paymentMode === 'TRANSFER') && (
                  <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                    <CreditCard className="w-4 h-4 text-ocean-700" />
                    <input
                      type="text"
                      placeholder="N° Autorización Voucher / Referencia Bancaria..."
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1 bg-white"
                    />
                  </div>
                )}

                {paymentMode === 'COMBINED' && (
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold">Efectivo DOP</label>
                      <input
                        type="number"
                        value={cashTenderedDop}
                        onChange={(e) => setCashTenderedDop(e.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold">Efectivo USD</label>
                      <input
                        type="number"
                        value={cashTenderedUsd}
                        onChange={(e) => setCashTenderedUsd(e.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold">Tarjeta (DOP)</label>
                      <input
                        type="number"
                        value={cardAmountDop}
                        onChange={(e) => setCardAmountDop(e.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold">Transferencia (DOP)</label>
                      <input
                        type="number"
                        value={transferAmountDop}
                        onChange={(e) => setTransferAmountDop(e.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Botón Principal COBRAR Y EMITIR TICKETS QR */}
              {!bootstrapData?.activeSession ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('CASH')}
                  className="w-full py-3.5 px-6 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-sm shadow-lg flex items-center justify-center gap-2 transition"
                >
                  <Wallet className="w-5 h-5" />
                  CAJA CERRADA — ABRIR CAJA PARA PODER VENDER
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmCheckout}
                  disabled={submittingSale || cart.length === 0}
                  className="w-full py-3.5 px-6 rounded-2xl bg-mountain-700 hover:bg-mountain-800 disabled:bg-slate-300 text-white font-black text-base shadow-lg flex items-center justify-center gap-2 transition"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {submittingSale
                    ? 'Procesando Factura y Tickets QR...'
                    : `COBRAR Y GENERAR ${cartTotals.totalTicketsToEmit} TICKETS QR`}
                </button>
              )}
            </div>
          </div>
          </div>
        )}

        {/* ==================== VISTA 2: HISTORIAL DE FACTURAS Y TICKETS ==================== */}
        {activeTab === 'INVOICES_TICKETS' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-mountain-900">
                  Historial de Facturación, Notas de Crédito y Tickets Individuales
                </h2>
                <p className="text-xs text-slate-500">
                  Ninguna factura se elimina físicamente. Las anulaciones emiten Nota de Crédito B04, invalidan tickets no usados y preservan el historial de tickets utilizados.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 uppercase font-extrabold border-b border-slate-200">
                  <tr>
                    <th className="p-3">N° Factura / NCF</th>
                    <th className="p-3">Fecha y Hora</th>
                    <th className="p-3">Cliente / Visitantes</th>
                    <th className="p-3 text-center">Tickets QR</th>
                    <th className="p-3 text-right">Total DOP / USD</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesHistory.map((sale: any) => {
                    const usedCount = (sale.tickets || []).filter(
                      (t: any) => t.status === 'USED'
                    ).length;
                    return (
                      <tr key={sale.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900">{sale.invoiceNumber}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            NCF: {sale.ncfNumber || sale.ncfType}
                            {sale.creditNoteNumber && ` • NC: ${sale.creditNoteNumber}`}
                          </div>
                        </td>
                        <td className="p-3">{new Date(sale.createdAt).toLocaleString('es-DO')}</td>
                        <td className="p-3">
                          <div className="font-bold">
                            {sale.customerName || 'Visitante Recepción'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {sale.adultCount} Adulto(s), {sale.childCount} Niño(s)
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2.5 py-1 rounded-full bg-mountain-100 text-mountain-900 font-extrabold">
                            {(sale.tickets || []).length} tickets
                          </span>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {usedCount} utilizados
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="font-extrabold text-slate-900">
                            {formatDop(sale.totalDop)}
                          </div>
                          <div className="text-[11px] text-ocean-800">{formatUsd(sale.totalUsd)}</div>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                              sale.status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-800'
                                : sale.status === 'VOIDED' || sale.status === 'REFUNDED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {sale.status}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() =>
                              setPrintModalState({ open: true, sale, mode: 'TICKETS' })
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-mountain-700 hover:bg-mountain-800 text-white font-bold"
                          >
                            Tickets QR
                          </button>
                          <button
                            onClick={() =>
                              setPrintModalState({ open: true, sale, mode: 'INVOICE' })
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-ocean-800 hover:bg-ocean-900 text-white font-bold"
                          >
                            Factura / PDF
                          </button>
                          {sale.status !== 'VOIDED' && sale.status !== 'REFUNDED' && (
                            <button
                              onClick={() => setVoidModalSale(sale)}
                              className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold"
                            >
                              Anular / NC
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== VISTA 3: ESCANEO QR Y CONTROL OPERATIVO ==================== */}
        {activeTab === 'SCANNER_OPS' && (
          <ScannerAndOperationsView
            services={bootstrapData?.services || []}
            currentUser={authUser}
            onRefreshSystem={loadBootstrapAndSales}
          />
        )}

        {/* ==================== VISTA 4: DASHBOARD Y LOS 13 REPORTES ==================== */}
        {activeTab === 'DASHBOARD_REPORTS' && <DashboardAndReportsView />}

        {/* ==================== VISTAS 5, 6 Y 7: CAJA, CATÁLOGO Y CONFIGURACIÓN RD ==================== */}
        {(activeTab === 'CASH' || activeTab === 'CATALOG' || activeTab === 'SETTINGS') && (
          <CashCatalogSettingsView
            activeSubTab={activeTab}
            bootstrapData={bootstrapData}
            onRefreshSystem={loadBootstrapAndSales}
          />
        )}
      </main>

      {/* Modal de Impresión de Factura y Tickets QR (Térmico 80mm / Carta / PDF / WhatsApp / Email) */}
      {printModalState.open && printModalState.sale && (
        <PrintCenterModal
          sale={printModalState.sale}
          company={bootstrapData?.company}
          initialMode={printModalState.mode}
          onClose={() => setPrintModalState({ open: false, sale: null, mode: 'TICKETS' })}
        />
      )}

      {/* Modal de Anulación Auditada y Nota de Crédito */}
      {voidModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleConfirmVoidSale}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center gap-2 text-red-700 font-extrabold text-base">
              <ShieldAlert className="w-5 h-5" /> Anular Factura {voidModalSale.invoiceNumber}
            </div>
            <p className="text-xs text-slate-600">
              Se emitirá una Nota de Crédito B04 y se anularán todos los tickets pendientes de uso. Los tickets que ya hayan sido utilizados conservarán su historial de validación.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo de la Anulación / Reembolso (Obligatorio para Auditoría)
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                required
                placeholder="Ej. Cambio de actividad solicitado por el visitante en recepción..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidModalSale(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1"
              >
                <Ban className="w-3.5 h-3.5" /> Confirmar Anulación y Nota de Crédito
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

