'use client';

import React, { useState, useEffect } from 'react';
import {
  Wallet,
  PlusCircle,
  Lock,
  Unlock,
  Package,
  Layers,
  Shield,
  Users,
  Settings,
  Building2,
  ArrowDownCircle,
  ArrowUpCircle,
} from 'lucide-react';
import { apiFetch, formatDop, formatUsd } from '@/lib/api';

interface CashCatalogSettingsViewProps {
  activeSubTab: 'CASH' | 'CATALOG' | 'SETTINGS';
  bootstrapData: any;
  onRefreshSystem: () => void;
}

export function CashCatalogSettingsView({
  activeSubTab,
  bootstrapData,
  onRefreshSystem,
}: CashCatalogSettingsViewProps) {
  // Estado de Caja
  const [cashData, setCashData] = useState<any>(null);
  const [openCashForm, setOpenCashForm] = useState({
    cashRegisterId: '',
    openingAmountDop: 5000,
    openingAmountUsd: 100,
    notes: 'Apertura de turno en recepción',
  });
  const [movementForm, setMovementForm] = useState({
    movementType: 'EXPENSE_OUT',
    currency: 'DOP',
    amount: '',
    reason: '',
  });
  const [closeCashForm, setCloseCashForm] = useState({
    countedCashDop: '',
    countedCashUsd: '',
    notes: 'Cierre y arqueo conforme',
  });

  // Estado de Catálogo (Servicios y Paquetes)
  const [serviceForm, setServiceForm] = useState({
    id: '',
    categoryId: '',
    code: '',
    name: '',
    description: '',
    priceDop: '',
    priceUsd: '',
    durationMinutes: '45',
    capacityPerShift: '25',
    requiresSafetyCheck: false,
    accessPointName: 'Control Principal',
    restrictionsText: '',
    instructionsText: '',
  });

  const [packageForm, setPackageForm] = useState({
    code: '',
    name: '',
    description: '',
    priceDop: '',
    priceUsd: '',
    selectedServiceIds: [] as string[],
  });

  // Estado de Configuración, Usuarios y Auditoría
  const [companyForm, setCompanyForm] = useState({
    commercialName: '',
    legalName: '',
    rnc: '',
    address: '',
    phone: '',
    email: '',
    exchangeRateUsdToDop: 60.5,
    allowUnpaidTicketOverride: false,
    ticketFooterInstructions: '',
  });
  const [usersData, setUsersData] = useState<any>({ users: [], roles: [] });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [newUserForm, setNewUserForm] = useState({
    id: '',
    username: '',
    email: '',
    password: '',
    roleId: '',
    firstName: '',
    lastName: '',
    documentId: '',
    position: 'Cajero / Recepción',
    isActive: true,
  });
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadCash = async () => {
    try {
      const res = await apiFetch('/cash/status');
      setCashData(res);
      if (res?.registers?.[0] && !openCashForm.cashRegisterId) {
        setOpenCashForm((prev) => ({ ...prev, cashRegisterId: res.registers[0].id }));
      }
      if (res?.activeSession) {
        setCloseCashForm({
          countedCashDop: String(res.activeSession.expectedCashDop),
          countedCashUsd: String(res.activeSession.expectedCashUsd),
          notes: 'Cierre y arqueo de turno',
        });
      }
    } catch {
      // ignore
    }
  };

  const loadSettingsAndAudit = async () => {
    try {
      const [uData, aLogs] = await Promise.all([
        apiFetch('/settings/users'),
        apiFetch('/settings/audit-logs'),
      ]);
      setUsersData(uData);
      setAuditLogs(aLogs);
      if (uData?.roles?.[0] && !newUserForm.roleId) {
        setNewUserForm((prev) => ({ ...prev, roleId: uData.roles[0].id }));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (bootstrapData?.company) {
      setCompanyForm({
        commercialName: bootstrapData.company.commercialName || 'Montaña Redonda Paradise',
        legalName: bootstrapData.company.legalName || 'Montaña Redonda Paradise SRL',
        rnc: bootstrapData.company.rnc || '131-89452-1',
        address: bootstrapData.company.address || '',
        phone: bootstrapData.company.phone || '',
        email: bootstrapData.company.email || '',
        exchangeRateUsdToDop: Number(bootstrapData.company.exchangeRateUsdToDop || 60.5),
        allowUnpaidTicketOverride: !!bootstrapData.company.allowUnpaidTicketOverride,
        ticketFooterInstructions: bootstrapData.company.ticketFooterInstructions || '',
      });
    }
    if (bootstrapData?.categories?.[0] && !serviceForm.categoryId) {
      setServiceForm((prev) => ({ ...prev, categoryId: bootstrapData.categories[0].id }));
    }
  }, [bootstrapData]);

  useEffect(() => {
    if (activeSubTab === 'CASH') loadCash();
    if (activeSubTab === 'SETTINGS') loadSettingsAndAudit();
  }, [activeSubTab]);

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Handlers de Caja
  const handleOpenCash = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/cash/sessions/open', {
      method: 'POST',
      body: JSON.stringify(openCashForm),
    });
    showToast('Sesión de caja abierta correctamente.');
    await loadCash();
    onRefreshSystem();
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashData?.activeSession) return;
    await apiFetch('/cash/movements', {
      method: 'POST',
      body: JSON.stringify({
        cashSessionId: cashData.activeSession.id,
        ...movementForm,
        amount: Number(movementForm.amount),
      }),
    });
    setMovementForm({ movementType: 'EXPENSE_OUT', currency: 'DOP', amount: '', reason: '' });
    showToast('Movimiento de caja registrado.');
    await loadCash();
  };

  const handleCloseCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashData?.activeSession) return;
    await apiFetch(`/cash/sessions/${cashData.activeSession.id}/close`, {
      method: 'POST',
      body: JSON.stringify({
        countedCashDop: Number(closeCashForm.countedCashDop),
        countedCashUsd: Number(closeCashForm.countedCashUsd),
        notes: closeCashForm.notes,
      }),
    });
    showToast('Caja cerrada y arqueo guardado en PostgreSQL.');
    await loadCash();
    onRefreshSystem();
  };

  // Handlers de Catálogo
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/catalog/services', {
      method: 'POST',
      body: JSON.stringify({
        ...serviceForm,
        id: serviceForm.id || undefined,
        priceDop: Number(serviceForm.priceDop),
        priceUsd: Number(serviceForm.priceUsd),
      }),
    });
    setServiceForm({
      id: '',
      categoryId: bootstrapData?.categories?.[0]?.id || '',
      code: '',
      name: '',
      description: '',
      priceDop: '',
      priceUsd: '',
      durationMinutes: '45',
      capacityPerShift: '25',
      requiresSafetyCheck: false,
      accessPointName: 'Control Principal',
      restrictionsText: '',
      instructionsText: '',
    });
    showToast('Servicio guardado en el catálogo.');
    onRefreshSystem();
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (packageForm.selectedServiceIds.length === 0) return;
    await apiFetch('/catalog/packages', {
      method: 'POST',
      body: JSON.stringify({
        code: packageForm.code,
        name: packageForm.name,
        description: packageForm.description,
        priceDop: Number(packageForm.priceDop),
        priceUsd: Number(packageForm.priceUsd),
        items: packageForm.selectedServiceIds.map((serviceId) => ({
          serviceId,
          quantityPerPackage: 1,
        })),
      }),
    });
    setPackageForm({
      code: '',
      name: '',
      description: '',
      priceDop: '',
      priceUsd: '',
      selectedServiceIds: [],
    });
    showToast('Paquete turístico creado y listo para descomposición en tickets individuales.');
    onRefreshSystem();
  };

  // Handlers de Configuración y Usuarios
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/settings/company', {
      method: 'PATCH',
      body: JSON.stringify(companyForm),
    });
    showToast('Configuración fiscal, tasa USD/DOP y parámetros de Montaña Redonda actualizados.');
    onRefreshSystem();
  };

  const resetUserForm = (defaultRoleId?: string) => {
    setNewUserForm({
      id: '',
      username: '',
      email: '',
      password: '',
      roleId: defaultRoleId ?? usersData?.roles?.[0]?.id ?? '',
      firstName: '',
      lastName: '',
      documentId: '',
      position: 'Cajero / Recepción',
      isActive: true,
    });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      if (newUserForm.id) {
        await apiFetch(`/settings/users/${newUserForm.id}`, {
          method: 'PATCH',
          body: JSON.stringify(newUserForm),
        });
        showToast('Usuario y ficha de empleado actualizados correctamente.');
      } else {
        await apiFetch('/settings/users', {
          method: 'POST',
          body: JSON.stringify({
            ...newUserForm,
            password: newUserForm.password || 'Montana2026*',
          }),
        });
        showToast('Nuevo usuario y ficha de empleado creados correctamente.');
      }
      resetUserForm();
      await loadSettingsAndAudit();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al guardar el usuario.');
    }
  };

  const handleEditUser = (u: any) => {
    setErrorMsg(null);
    setNewUserForm({
      id: u.id,
      username: u.username || '',
      email: u.email || '',
      password: '',
      roleId: u.role?.id || u.roleId || usersData?.roles?.[0]?.id || '',
      firstName: u.employee?.firstName || '',
      lastName: u.employee?.lastName || '',
      documentId: u.employee?.documentId || '',
      position: u.employee?.position || 'Cajero / Recepción',
      isActive: u.isActive !== false,
    });
  };

  const handleDeleteUser = async (u: any) => {
    setErrorMsg(null);
    const fullName = `${u.employee?.firstName || ''} ${u.employee?.lastName || ''}`.trim() || u.username;
    if (!window.confirm(`¿Está seguro de eliminar al usuario "${u.username}" (${fullName})?`)) {
      return;
    }
    try {
      await apiFetch(`/settings/users/${u.id}`, {
        method: 'DELETE',
      });
      if (newUserForm.id === u.id) {
        resetUserForm();
      }
      showToast(`Usuario "${u.username}" eliminado correctamente.`);
      await loadSettingsAndAudit();
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo eliminar el usuario.');
    }
  };

  if (activeSubTab === 'CASH') {
    const activeSession = cashData?.activeSession;
    return (
      <div className="space-y-6">
        {feedbackMsg && (
          <div className="p-3 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold">
            ✅ {feedbackMsg}
          </div>
        )}

        {/* Resumen de Sesión de Caja Activa */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-mountain-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-mountain-700" /> Control de Caja Multimoneda (DOP / USD)
              </h3>
              <span
                className={`px-3 py-1 rounded-full text-xs font-black ${
                  activeSession ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}
              >
                {activeSession ? `SESIÓN ABIERTA (${activeSession.cashRegister?.code})` : 'CAJA CERRADA'}
              </span>
            </div>

            {activeSession ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-mountain-50 border border-mountain-200">
                    <div className="text-slate-500 font-bold">Efectivo Esperado (DOP)</div>
                    <div className="text-lg font-black text-mountain-900 mt-1">
                      {formatDop(activeSession.expectedCashDop)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Apertura: {formatDop(activeSession.openingAmountDop)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-ocean-50 border border-ocean-200">
                    <div className="text-slate-500 font-bold">Efectivo Esperado (USD)</div>
                    <div className="text-lg font-black text-ocean-900 mt-1">
                      {formatUsd(activeSession.expectedCashUsd)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Apertura: {formatUsd(activeSession.openingAmountUsd)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 font-bold">Tarjetas (DOP)</div>
                    <div className="text-lg font-black text-slate-900 mt-1">
                      {formatDop(activeSession.expectedCardDop)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 font-bold">Transferencias (DOP)</div>
                    <div className="text-lg font-black text-slate-900 mt-1">
                      {formatDop(activeSession.expectedTransferDop)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                    <div className="text-red-700 font-bold">Gastos y Retiros (DOP)</div>
                    <div className="text-lg font-black text-red-900 mt-1">
                      {formatDop(activeSession.totalExpensesDop)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="text-amber-800 font-bold">Cajero Responsable</div>
                    <div className="text-sm font-black text-slate-900 mt-1">
                      {activeSession.employee
                        ? `${activeSession.employee.firstName} ${activeSession.employee.lastName}`
                        : 'Cajero Activo'}
                    </div>
                  </div>
                </div>

                {/* Registrar Gasto, Retiro o Ingreso Manual */}
                <form
                  onSubmit={handleAddMovement}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                >
                  <div className="text-xs font-extrabold uppercase text-slate-700">
                    Registrar Movimiento de Caja (Gasto / Retiro / Ingreso)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                    <select
                      value={movementForm.movementType}
                      onChange={(e) => setMovementForm({ ...movementForm, movementType: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2.5 py-2 bg-white font-semibold"
                    >
                      <option value="EXPENSE_OUT">Gasto Operativo (-)</option>
                      <option value="WITHDRAWAL_OUT">Retiro de Efectivo (-)</option>
                      <option value="CASH_IN">Ingreso de Efectivo (+)</option>
                    </select>
                    <select
                      value={movementForm.currency}
                      onChange={(e) => setMovementForm({ ...movementForm, currency: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2.5 py-2 bg-white font-semibold"
                    >
                      <option value="DOP">DOP (Pesos)</option>
                      <option value="USD">USD (Dólares)</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Monto..."
                      value={movementForm.amount}
                      onChange={(e) => setMovementForm({ ...movementForm, amount: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2.5 py-2"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Concepto / Justificación..."
                      value={movementForm.reason}
                      onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2.5 py-2"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-ocean-800 hover:bg-ocean-900 text-white text-xs font-bold"
                  >
                    Registrar Movimiento en Caja
                  </button>
                </form>
              </>
            ) : (
              <form onSubmit={handleOpenCash} className="space-y-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="font-extrabold text-sm text-emerald-950 flex items-center gap-1.5">
                  <Unlock className="w-4 h-4" /> Abrir Nueva Sesión de Caja
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-bold mb-1">Caja Registradora</label>
                    <select
                      value={openCashForm.cashRegisterId}
                      onChange={(e) => setOpenCashForm({ ...openCashForm, cashRegisterId: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                    >
                      {(cashData?.registers || []).map((r: any) => (
                        <option key={r.id} value={r.id}>
                          {r.code} - {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Fondo Inicial DOP</label>
                    <input
                      type="number"
                      value={openCashForm.openingAmountDop}
                      onChange={(e) =>
                        setOpenCashForm({ ...openCashForm, openingAmountDop: Number(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Fondo Inicial USD</label>
                    <input
                      type="number"
                      value={openCashForm.openingAmountUsd}
                      onChange={(e) =>
                        setOpenCashForm({ ...openCashForm, openingAmountUsd: Number(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-mountain-700 hover:bg-mountain-800 text-white text-xs font-bold"
                >
                  Confirmar Apertura de Caja
                </button>
              </form>
            )}
          </div>

          {/* Arqueo y Cierre de Caja */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-600" /> Arqueo y Cierre de Turno
            </h3>
            {activeSession ? (
              <form onSubmit={handleCloseCash} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Efectivo Contado en Pesos (DOP)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={closeCashForm.countedCashDop}
                      onChange={(e) => setCloseCashForm({ ...closeCashForm, countedCashDop: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold"
                      required
                    />
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Esperado: {formatDop(activeSession.expectedCashDop)} | Dif:{' '}
                      {formatDop(
                        Number(closeCashForm.countedCashDop || 0) - Number(activeSession.expectedCashDop)
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Efectivo Contado en Dólares (USD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={closeCashForm.countedCashUsd}
                      onChange={(e) => setCloseCashForm({ ...closeCashForm, countedCashUsd: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold"
                      required
                    />
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Esperado: {formatUsd(activeSession.expectedCashUsd)} | Dif:{' '}
                      {formatUsd(
                        Number(closeCashForm.countedCashUsd || 0) - Number(activeSession.expectedCashUsd)
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Notas de Cierre</label>
                  <input
                    type="text"
                    value={closeCashForm.notes}
                    onChange={(e) => setCloseCashForm({ ...closeCashForm, notes: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase"
                >
                  Ejecutar Cierre de Caja y Guardar Arqueo
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-500">
                No hay sesión activa para cerrar. Abra primero una sesión de caja en el panel izquierdo.
              </p>
            )}
          </div>
        </div>

        {/* Historial de Movimientos de Caja */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h4 className="font-extrabold text-sm text-slate-900 mb-3 uppercase">
            Movimientos de Caja Registrados
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase">
                  <th className="py-2">Fecha/Hora</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Concepto</th>
                  <th className="py-2 text-right">Moneda / Monto</th>
                  <th className="py-2 text-right">Equivalente DOP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(cashData?.movements || []).map((m: any) => (
                  <tr key={m.id}>
                    <td className="py-2">{new Date(m.createdAt).toLocaleString('es-DO')}</td>
                    <td className="py-2 font-bold">
                      {m.movementType.includes('OUT') ? (
                        <span className="text-red-600 flex items-center gap-1">
                          <ArrowDownCircle className="w-3.5 h-3.5" /> {m.movementType}
                        </span>
                      ) : (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <ArrowUpCircle className="w-3.5 h-3.5" /> {m.movementType}
                        </span>
                      )}
                    </td>
                    <td className="py-2">{m.reason}</td>
                    <td className="py-2 text-right font-semibold">
                      {m.currency} {Number(m.amount).toFixed(2)}
                    </td>
                    <td className="py-2 text-right font-bold">{formatDop(m.amountDopEquivalent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (activeSubTab === 'CATALOG') {
    const services = bootstrapData?.services || [];
    const packages = bootstrapData?.packages || [];
    const categories = bootstrapData?.categories || [];

    return (
      <div className="space-y-6">
        {feedbackMsg && (
          <div className="p-3 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold">
            ✅ {feedbackMsg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Crear / Editar Servicio */}
          <form
            onSubmit={handleSaveService}
            className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold uppercase text-mountain-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-mountain-700" />{' '}
                {serviceForm.id ? 'Editar Servicio Turístico' : 'Crear Nuevo Servicio Turístico'}
              </h3>
              {serviceForm.id && (
                <button
                  type="button"
                  onClick={() =>
                    setServiceForm({
                      id: '',
                      categoryId: categories[0]?.id || '',
                      code: '',
                      name: '',
                      description: '',
                      priceDop: '',
                      priceUsd: '',
                      durationMinutes: '45',
                      capacityPerShift: '25',
                      requiresSafetyCheck: false,
                      accessPointName: 'Control Principal',
                      restrictionsText: '',
                      instructionsText: '',
                    })
                  }
                  className="text-xs text-red-600 font-bold"
                >
                  Cancelar Edición
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold mb-1">Categoría</label>
                <select
                  value={serviceForm.categoryId}
                  onChange={(e) => setServiceForm({ ...serviceForm, categoryId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white"
                  required
                >
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">Código Único</label>
                <input
                  type="text"
                  placeholder="Ej. ACT-KAYAK"
                  value={serviceForm.code}
                  onChange={(e) => setServiceForm({ ...serviceForm, code: e.target.value.toUpperCase() })}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-bold mb-1">Nombre del Servicio / Actividad</label>
              <input
                type="text"
                placeholder="Ej. Paseo en Kayak Laguna Redonda"
                value={serviceForm.name}
                onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-bold mb-1">Precio DOP (RD$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={serviceForm.priceDop}
                  onChange={(e) => setServiceForm({ ...serviceForm, priceDop: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-bold"
                  required
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Precio USD (US$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={serviceForm.priceUsd}
                  onChange={(e) => setServiceForm({ ...serviceForm, priceUsd: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-bold"
                  required
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Punto de Acceso QR</label>
                <input
                  type="text"
                  value={serviceForm.accessPointName}
                  onChange={(e) => setServiceForm({ ...serviceForm, accessPointName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold mb-1">Restricciones Impresas en Ticket</label>
                <input
                  type="text"
                  value={serviceForm.restrictionsText}
                  onChange={(e) => setServiceForm({ ...serviceForm, restrictionsText: e.target.value })}
                  placeholder="Ej. Peso máx 250 lbs, mayores de 6 años"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Instrucciones al Visitante</label>
                <input
                  type="text"
                  value={serviceForm.instructionsText}
                  onChange={(e) => setServiceForm({ ...serviceForm, instructionsText: e.target.value })}
                  placeholder="Ej. Presentar QR al operador antes de subir"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={serviceForm.requiresSafetyCheck}
                onChange={(e) => setServiceForm({ ...serviceForm, requiresSafetyCheck: e.target.checked })}
                className="w-4 h-4 accent-mountain-700"
              />
              Exigir Checklist de Seguridad Obligatorio (Arnés, Casco e Instrucciones) al validar QR
            </label>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-mountain-700 hover:bg-mountain-800 text-white font-bold flex items-center justify-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />{' '}
              {serviceForm.id ? 'Actualizar Servicio y Tarifas' : 'Guardar Nuevo Servicio en Catálogo'}
            </button>
          </form>

          {/* Crear Paquete Turístico Compuesto */}
          <form
            onSubmit={handleSavePackage}
            className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 text-xs"
          >
            <h3 className="text-sm font-extrabold uppercase text-ocean-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-ocean-700" /> Crear Paquete Turístico Multi-Actividad
            </h3>
            <p className="text-[11px] text-slate-500">
              Al vender un paquete en el POS, el sistema lo descompone automáticamente y emite un ticket QR individual por cada visitante y cada actividad seleccionada.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold mb-1">Código del Paquete</label>
                <input
                  type="text"
                  placeholder="Ej. PKG-EXTREMO"
                  value={packageForm.code}
                  onChange={(e) => setPackageForm({ ...packageForm, code: e.target.value.toUpperCase() })}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                  required
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Nombre del Paquete</label>
                <input
                  type="text"
                  placeholder="Ej. Paquete Extremo Michés"
                  value={packageForm.name}
                  onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold mb-1">Precio Paquete DOP</label>
                <input
                  type="number"
                  step="0.01"
                  value={packageForm.priceDop}
                  onChange={(e) => setPackageForm({ ...packageForm, priceDop: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-bold"
                  required
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Precio Paquete USD</label>
                <input
                  type="number"
                  step="0.01"
                  value={packageForm.priceUsd}
                  onChange={(e) => setPackageForm({ ...packageForm, priceUsd: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-bold"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-bold mb-1.5">
                Seleccione las Actividades Incluidas en el Paquete ({packageForm.selectedServiceIds.length} seleccionadas):
              </label>
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
                {services.map((s: any) => {
                  const checked = packageForm.selectedServiceIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-2 cursor-pointer ${
                        checked ? 'bg-ocean-800 text-white border-ocean-900' : 'bg-white border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setPackageForm((prev) => ({
                            ...prev,
                            selectedServiceIds: checked
                              ? prev.selectedServiceIds.filter((id) => id !== s.id)
                              : [...prev.selectedServiceIds, s.id],
                          }));
                        }}
                        className="w-3.5 h-3.5"
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-ocean-800 hover:bg-ocean-900 text-white font-bold flex items-center justify-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" /> Guardar Paquete Turístico
            </button>
          </form>
        </div>

        {/* Tabla del Catálogo Actual */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h4 className="font-extrabold text-sm text-slate-900 mb-3 uppercase">
            Catálogo Activo de Servicios ({services.length}) y Paquetes ({packages.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase">
                  <th className="py-2">Código</th>
                  <th className="py-2">Servicio / Actividad</th>
                  <th className="py-2">Categoría</th>
                  <th className="py-2 text-right">Tarifa DOP</th>
                  <th className="py-2 text-right">Tarifa USD</th>
                  <th className="py-2 text-center">Seguridad QR</th>
                  <th className="py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {services.map((s: any) => {
                  const dop = s.prices?.find((p: any) => p.currency === 'DOP')?.unitPrice || 0;
                  const usd = s.prices?.find((p: any) => p.currency === 'USD')?.unitPrice || 0;
                  return (
                    <tr key={s.id}>
                      <td className="py-2 font-mono font-bold">{s.code}</td>
                      <td className="py-2 font-bold text-slate-900">{s.name}</td>
                      <td className="py-2">{s.category?.name}</td>
                      <td className="py-2 text-right font-bold text-mountain-800">{formatDop(dop)}</td>
                      <td className="py-2 text-right font-semibold text-ocean-800">{formatUsd(usd)}</td>
                      <td className="py-2 text-center">
                        {s.requiresSafetyCheck ? (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                            Checklist Oblig.
                          </span>
                        ) : (
                          <span className="text-slate-400">Estándar</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() =>
                            setServiceForm({
                              id: s.id,
                              categoryId: s.categoryId,
                              code: s.code,
                              name: s.name,
                              description: s.description || '',
                              priceDop: String(dop),
                              priceUsd: String(usd),
                              durationMinutes: String(s.durationMinutes || 45),
                              capacityPerShift: String(s.capacityPerShift || 25),
                              requiresSafetyCheck: !!s.requiresSafetyCheck,
                              accessPointName: s.accessPointName || 'Control Principal',
                              restrictionsText: s.restrictionsText || '',
                              instructionsText: s.instructionsText || '',
                            })
                          }
                          className="text-mountain-700 hover:underline font-bold"
                        >
                          Editar Precio / Datos
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Pestaña SETTINGS: República Dominicana (RNC, NCF, Tasa USD, Usuarios y Auditoría)
  return (
    <div className="space-y-6">
      {feedbackMsg && (
        <div className="p-3 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold">
          ✅ {feedbackMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs font-bold">
          ⚠️ {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Configuración Fiscal RD y Tasas */}
        <form
          onSubmit={handleSaveCompany}
          className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 text-xs"
        >
          <h3 className="text-sm font-extrabold uppercase text-mountain-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-mountain-700" /> Configuración Fiscal RD (DGII / NCF / Tasa USD)
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold mb-1">Nombre Comercial</label>
              <input
                type="text"
                value={companyForm.commercialName}
                onChange={(e) => setCompanyForm({ ...companyForm, commercialName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">RNC Empresa</label>
              <input
                type="text"
                value={companyForm.rnc}
                onChange={(e) => setCompanyForm({ ...companyForm, rnc: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold mb-1">Tasa de Cambio (1 USD a DOP)</label>
              <input
                type="number"
                step="0.01"
                value={companyForm.exchangeRateUsdToDop}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, exchangeRateUsdToDop: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-black text-mountain-800"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">Teléfono Recepción</label>
              <input
                type="text"
                value={companyForm.phone}
                onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold mb-1">Dirección en Michés, República Dominicana</label>
            <input
              type="text"
              value={companyForm.address}
              onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
            />
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
            <strong>Módulo Fiscal Independiente (República Dominicana):</strong> Secuencias NCF B01, B02, B04, B14, B15 activas y estructura preparatoria E31–E34 para e-CF lista. No declara cumplimiento electrónico ante la DGII sin certificado digital activo.
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-mountain-700 hover:bg-mountain-800 text-white font-bold flex items-center justify-center gap-1.5"
          >
            <Settings className="w-4 h-4" /> Guardar Configuración Fiscal y Tasa de Cambio
          </button>
        </form>

        {/* Gestión de Usuarios y los 5 Roles RBAC */}
        <form
          onSubmit={handleCreateUser}
          className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase text-ocean-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-ocean-700" />{' '}
              {newUserForm.id
                ? `Editando Usuario: ${newUserForm.username}`
                : 'Crear Empleado y Asignar Rol de Seguridad'}
            </h3>
            {newUserForm.id && (
              <button
                type="button"
                onClick={() => resetUserForm()}
                className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[11px]"
              >
                Cancelar Edición
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold mb-1">Nombre</label>
              <input
                type="text"
                value={newUserForm.firstName}
                onChange={(e) => setNewUserForm({ ...newUserForm, firstName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                required
              />
            </div>
            <div>
              <label className="block font-bold mb-1">Apellido</label>
              <input
                type="text"
                value={newUserForm.lastName}
                onChange={(e) => setNewUserForm({ ...newUserForm, lastName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-bold mb-1">Usuario Login</label>
              <input
                type="text"
                value={newUserForm.username}
                onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                required
              />
            </div>
            <div>
              <label className="block font-bold mb-1">Correo</label>
              <input
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                required
              />
            </div>
            <div>
              <label className="block font-bold mb-1">Rol del Sistema</label>
              <select
                value={newUserForm.roleId}
                onChange={(e) => setNewUserForm({ ...newUserForm, roleId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white font-bold"
              >
                {(usersData?.roles || []).map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.code} - {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className="block font-bold mb-1">
                {newUserForm.id ? 'Nueva Contraseña (Opcional)' : 'Contraseña'}
              </label>
              <input
                type="password"
                placeholder={newUserForm.id ? 'Dejar vacío para no cambiar' : 'Ej: Montana2026*'}
                value={newUserForm.password}
                onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                required={!newUserForm.id}
              />
            </div>
            <div>
              <label className="block font-bold mb-1">Cargo / Puesto</label>
              <input
                type="text"
                value={newUserForm.position}
                onChange={(e) => setNewUserForm({ ...newUserForm, position: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
              />
            </div>
            <div className="pb-2">
              <label className="inline-flex items-center gap-2 font-bold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newUserForm.isActive}
                  onChange={(e) => setNewUserForm({ ...newUserForm, isActive: e.target.checked })}
                  className="rounded border-slate-300 text-ocean-700"
                />
                <span>Usuario Activo</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-ocean-800 hover:bg-ocean-900 text-white font-bold"
          >
            {newUserForm.id ? 'Guardar Cambios del Usuario' : 'Registrar Usuario y Empleado'}
          </button>

          <div className="pt-2 max-h-56 overflow-y-auto divide-y divide-slate-100">
            {(usersData?.users || []).map((u: any) => (
              <div key={u.id} className="py-2 flex items-center justify-between text-xs gap-2">
                <div className="min-w-0">
                  <div className="truncate">
                    <strong>{u.username}</strong> ({u.employee?.firstName} {u.employee?.lastName})
                    {u.isActive === false && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px]">
                        INACTIVO
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {u.email} • {u.employee?.position || 'Personal Operativo'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-700">
                    {u.role?.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleEditUser(u)}
                    className="px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(u)}
                    className="px-2 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-700 font-bold border border-red-200"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </form>
      </div>

      {/* Bitácora Inmutable de Auditoría */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h4 className="font-extrabold text-sm text-slate-900 mb-3 uppercase flex items-center gap-2">
          <Shield className="w-4 h-4 text-mountain-700" /> Registro Inmutable de Auditoría (audit_logs)
        </h4>
        <div className="max-h-72 overflow-y-auto overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase">
                <th className="py-2">Fecha y Hora</th>
                <th className="py-2">Usuario</th>
                <th className="py-2">Acción</th>
                <th className="py-2">Entidad</th>
                <th className="py-2">Detalles Registrados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map((log: any) => (
                <tr key={log.id}>
                  <td className="py-2 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('es-DO')}
                  </td>
                  <td className="py-2 font-bold">{log.username}</td>
                  <td className="py-2">
                    <span className="px-2 py-0.5 rounded bg-mountain-100 text-mountain-900 font-bold text-[10px]">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2 font-mono">{log.entityName}</td>
                  <td className="py-2 font-mono text-[11px] text-slate-600">
                    {JSON.stringify(log.detailsJson)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

