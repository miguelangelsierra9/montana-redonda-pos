'use client';

import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  TrendingUp,
  Users,
  Ticket,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Calendar,
  RefreshCw,
  AlertOctagon,
} from 'lucide-react';
import { apiFetch, formatDop, formatUsd, getExcelExportUrl } from '@/lib/api';

const CHART_COLORS = ['#15803d', '#1e40af', '#eab308', '#b45309', '#0f766e', '#7c2d12', '#4338ca'];

const REPORT_LIST = [
  { key: '1_ventas_dia', label: '1. Ventas por día' },
  { key: '2_ventas_mes', label: '2. Ventas por mes' },
  { key: '3_ventas_actividad', label: '3. Ventas por actividad' },
  { key: '4_visitantes', label: '4. Cantidad de visitantes' },
  { key: '5_participantes_actividad', label: '5. Participantes por actividad' },
  { key: '6_tickets_emitidos', label: '6. Tickets emitidos' },
  { key: '7_tickets_utilizados', label: '7. Tickets utilizados' },
  { key: '8_tickets_pendientes', label: '8. Tickets pendientes' },
  { key: '9_ventas_empleado', label: '9. Ventas por empleado' },
  { key: '10_ventas_metodo_pago', label: '10. Ventas por método de pago' },
  { key: '11_ingresos_dop_usd', label: '11. Ingresos en DOP y USD' },
  { key: '12_anulaciones', label: '12. Anulaciones y devoluciones' },
  { key: '13_cierres_caja', label: '13. Cierres de caja' },
];

export function DashboardAndReportsView() {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activeReportKey, setActiveReportKey] = useState<string>('3_ventas_actividad');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const res = await apiFetch(`/reports/dashboard?${params.toString()}`);
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  const getRowsForActiveReport = (): Record<string, any>[] => {
    if (!data?.reports) return [];
    const r = data.reports;
    switch (activeReportKey) {
      case '1_ventas_dia':
        return r.salesByDay || [];
      case '2_ventas_mes':
        return r.salesByMonth || [];
      case '3_ventas_actividad':
      case '5_participantes_actividad':
        return (r.salesByActivity || []).map((a: any) => ({
          Código: a.code,
          Actividad: a.activityName,
          'Tickets Emitidos': a.ticketsIssued,
          'Tickets Utilizados': a.ticketsUsed,
          'Tickets Pendientes': a.ticketsPending,
          Participantes: a.participantsCount,
          'Ingreso Estimado (DOP)': formatDop(a.estimatedRevenueDop),
        }));
      case '4_visitantes':
        return (r.visitorsSummary || []).map((v: any) => ({
          Factura: v.invoiceNumber,
          Fecha: new Date(v.date).toLocaleString('es-DO'),
          Cliente: v.customerName,
          Adultos: v.adults,
          Niños: v.children,
          'Total Visitantes': v.totalVisitors,
          'Tickets QR': v.ticketsCount,
        }));
      case '6_tickets_emitidos':
        return (r.ticketsIssued || []).map((t: any) => ({
          'N° Ticket': t.ticketNumber,
          Actividad: t.service?.name,
          Visitante: t.visitorNameSnapshot || 'Portador',
          Factura: t.sale?.invoiceNumber,
          Estado: t.status,
          Validez: t.validUntil,
        }));
      case '7_tickets_utilizados':
        return (r.ticketsUsed || []).map((t: any) => ({
          'N° Ticket': t.ticketNumber,
          Actividad: t.service?.name,
          Visitante: t.visitorNameSnapshot || 'Portador',
          'Fecha/Hora Uso': t.usedAt ? new Date(t.usedAt).toLocaleString('es-DO') : '',
          'Punto Acceso': t.usedAtAccessPoint,
          Operador: t.usedByUsername,
        }));
      case '8_tickets_pendientes':
        return (r.ticketsPending || []).map((t: any) => ({
          'N° Ticket': t.ticketNumber,
          Actividad: t.service?.name,
          Visitante: t.visitorNameSnapshot || 'Portador',
          Estado: t.status,
          Validez: t.validUntil,
        }));
      case '9_ventas_empleado':
        return (r.salesByEmployee || []).map((e: any) => ({
          Código: e.employeeCode,
          Empleado: e.employeeName,
          'Cant. Facturas': e.salesCount,
          'Tickets Vendidos': e.ticketsSold,
          'Total Vendido (DOP)': formatDop(e.totalDop),
        }));
      case '10_ventas_metodo_pago':
        return (r.salesByPaymentMethod || []).map((m: any) => ({
          Método: m.methodName,
          Moneda: m.currency,
          Transacciones: m.transactionsCount,
          'Monto Original': m.amountOriginal,
          'Equivalente DOP': formatDop(m.amountDopEquivalent),
        }));
      case '11_ingresos_dop_usd':
        return (r.currencyBreakdown || []).map((c: any) => ({
          Moneda: c.currency,
          'Monto Recibido': c.totalOriginal,
          'Equivalente en DOP': formatDop(c.totalDopEquivalent),
        }));
      case '12_anulaciones':
        return (r.voidedAndRefundedSales || []).map((s: any) => ({
          Factura: s.invoiceNumber,
          'Nota Crédito': s.creditNoteNumber || 'N/A',
          Estado: s.status,
          'Total DOP': formatDop(s.totalDop),
          Motivo: s.voidReason,
          Fecha: s.voidedAt ? new Date(s.voidedAt).toLocaleString('es-DO') : '',
        }));
      case '13_cierres_caja':
        return (r.cashClosures || []).map((c: any) => ({
          Caja: c.cashRegister?.code,
          Empleado: c.employee ? `${c.employee.firstName} ${c.employee.lastName}` : '',
          Estado: c.status,
          'Apertura DOP': formatDop(c.openingAmountDop),
          'Esperado DOP': formatDop(c.expectedCashDop),
          'Contado DOP': c.countedCashDop !== null ? formatDop(c.countedCashDop) : 'Abierta',
          'Diferencia DOP': c.differenceDop !== null ? formatDop(c.differenceDop) : '0.00',
          'Esperado USD': formatUsd(c.expectedCashUsd),
        }));
      default:
        return [];
    }
  };

  const handleExportPdf = () => {
    const rows = getRowsForActiveReport();
    const reportTitle =
      REPORT_LIST.find((r) => r.key === activeReportKey)?.label || 'Reporte Oficial';
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(15);
    doc.text(`MONTAÑA REDONDA PARADISE — ${reportTitle.toUpperCase()}`, 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Michés, República Dominicana | Generado: ${new Date().toLocaleString('es-DO')} | Rango: ${
        startDate || 'Inicio'
      } - ${endDate || 'Hoy'}`,
      14,
      23
    );

    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      autoTable(doc, {
        startY: 29,
        head: [headers],
        body: rows.map((r) => headers.map((h) => String(r[h] ?? ''))),
      });
    } else {
      doc.text('No hay registros para el filtro seleccionado.', 14, 35);
    }

    doc.save(`MontanaRedonda_${activeReportKey}.pdf`);
  };

  const handleExportExcel = async () => {
    const token = localStorage.getItem('mrp_jwt_token');
    const url = getExcelExportUrl(activeReportKey, startDate, endDate);
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `MontanaRedonda_${activeReportKey}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const kpis = data?.kpis || {};
  const activeRows = getRowsForActiveReport();

  return (
    <div className="space-y-6">
      {/* Barra de Filtros por Fecha */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-mountain-700" />
          <span className="font-extrabold text-sm text-slate-800">
            Dashboard Administrativo & 13 Reportes Oficiales
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-slate-600">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-slate-600">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5"
            />
          </div>
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-100"
          >
            Limpiar Filtro
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-mountain-700 text-white text-xs font-bold flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {/* KPIs Principales (Sección 10) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-mountain-700" /> Ventas del Día
          </div>
          <div className="text-lg font-black text-mountain-800 mt-1">
            {formatDop(kpis.salesTodayDop || 0)}
          </div>
          <div className="text-[11px] text-slate-500">{kpis.salesTodayCount || 0} facturas hoy</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-ocean-700" /> Ventas del Mes
          </div>
          <div className="text-lg font-black text-ocean-900 mt-1">
            {formatDop(kpis.salesMonthDop || 0)}
          </div>
          <div className="text-[11px] text-slate-500">{kpis.salesMonthCount || 0} facturas mes</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-emerald-700" /> Visitantes Atendidos
          </div>
          <div className="text-lg font-black text-slate-900 mt-1">
            {kpis.visitorsAttended || 0}{' '}
            <span className="text-xs font-normal text-slate-500">
              / {kpis.totalVisitorsRegistered || 0} reg.
            </span>
          </div>
          <div className="text-[11px] text-slate-500">Accesos QR validados</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
            <Ticket className="w-3.5 h-3.5 text-amber-600" /> Tickets Emitidos / Usados
          </div>
          <div className="text-lg font-black text-slate-900 mt-1">
            {kpis.ticketsIssuedCount || 0} /{' '}
            <span className="text-emerald-700">{kpis.ticketsUsedCount || 0}</span>
          </div>
          <div className="text-[11px] text-slate-500">
            {kpis.ticketsPendingCount || 0} disponibles
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-500">
            Ingresos DOP / USD
          </div>
          <div className="text-sm font-black text-mountain-800 mt-1">
            {formatDop(kpis.incomeDop || 0)}
          </div>
          <div className="text-xs font-bold text-ocean-800">
            + {formatUsd(kpis.incomeUsd || 0)} en efectivo USD
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-red-600 flex items-center gap-1">
            <AlertOctagon className="w-3.5 h-3.5" /> Facturas Anuladas
          </div>
          <div className="text-lg font-black text-red-700 mt-1">
            {kpis.voidedInvoicesCount || 0}
          </div>
          <div className="text-[11px] text-slate-500">Auditadas con Nota Crédito</div>
        </div>
      </div>

      {/* Gráficos Recharts: Ingresos por Actividad y Ventas por Empleado */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-extrabold uppercase text-slate-800 mb-4">
            Ingresos y Tickets Emitidos por Actividad Turística
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.reports?.salesByActivity || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="ticketsIssued" name="Tickets Emitidos" fill="#15803d" radius={[6, 6, 0, 0]} />
                <Bar dataKey="ticketsUsed" name="Tickets Utilizados" fill="#1e40af" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-extrabold uppercase text-slate-800 mb-4">
            Distribución por Método de Pago y Empleados
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.reports?.salesByPaymentMethod || []}
                  dataKey="amountDopEquivalent"
                  nameKey="methodName"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entry) => entry.methodCode}
                >
                  {(data?.reports?.salesByPaymentMethod || []).map((_: any, index: number) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Selector de los 13 Reportes Oficiales con Exportación PDF y Excel */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-mountain-900">
              Generador de los 13 Reportes Oficiales (Sección 11)
            </h3>
            <p className="text-xs text-slate-500">
              Seleccione cualquiera de los 13 reportes operativos o financieros y expórtelo a PDF o Excel (.xlsx)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPdf}
              className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <FileText className="w-4 h-4" /> Exportar Reporte a PDF
            </button>
            <button
              onClick={handleExportExcel}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" /> Exportar Reporte a Excel (.xlsx)
            </button>
          </div>
        </div>

        {/* Botonera de los 13 Reportes */}
        <div className="flex flex-wrap gap-1.5">
          {REPORT_LIST.map((rep) => (
            <button
              key={rep.key}
              onClick={() => setActiveReportKey(rep.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeReportKey === rep.key
                  ? 'bg-mountain-800 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {rep.label}
            </button>
          ))}
        </div>

        {/* Tabla Dinámica del Reporte Seleccionado */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          {activeRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No hay registros para mostrar en este reporte con los filtros actuales.
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold border-b border-slate-200">
                <tr>
                  {Object.keys(activeRows[0]).map((col) => (
                    <th key={col} className="px-3 py-2.5">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50">
                    {Object.keys(activeRows[0]).map((col) => (
                      <td key={col} className="px-3 py-2 font-medium text-slate-800">
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

