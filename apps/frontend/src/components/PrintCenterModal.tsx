'use client';

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Printer,
  Download,
  Share2,
  Mail,
  CheckSquare,
  Square,
  X,
  Mountain,
  Ticket as TicketIcon,
  FileText,
} from 'lucide-react';
import { formatDop, formatUsd } from '@/lib/api';

interface PrintCenterModalProps {
  sale: any;
  company: any;
  initialMode: 'INVOICE' | 'TICKETS';
  onClose: () => void;
}

export function PrintCenterModal({ sale, company, initialMode, onClose }: PrintCenterModalProps) {
  const [mode, setMode] = useState<'INVOICE' | 'TICKETS'>(initialMode);
  const [paperFormat, setPaperFormat] = useState<'THERMAL_80MM' | 'LETTER'>('THERMAL_80MM');
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>(
    (sale?.tickets || []).map((t: any) => t.id)
  );

  if (!sale) return null;

  const tickets: any[] = sale.tickets || [];
  const filteredTickets = tickets.filter((t) => selectedTicketIds.includes(t.id));

  const toggleTicket = (id: string) => {
    setSelectedTicketIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllTickets = () => {
    setSelectedTicketIds(tickets.map((t) => t.id));
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleDownloadInvoicePdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(company?.commercialName || 'MONTAÑA REDONDA PARADISE', 14, 18);
    doc.setFontSize(10);
    doc.text(`RNC: ${company?.rnc || '131-89452-1'} | Michés, República Dominicana`, 14, 25);
    doc.text(`Factura: ${sale.invoiceNumber} | NCF: ${sale.ncfNumber || sale.ncfType}`, 14, 31);
    doc.text(`Fecha: ${new Date(sale.createdAt).toLocaleString('es-DO')}`, 14, 37);
    doc.text(`Cliente: ${sale.customerName || 'Visitante Recepción'} | RNC/Cédula: ${sale.customerRncCedula || 'N/A'}`, 14, 43);

    autoTable(doc, {
      startY: 50,
      head: [['Servicio / Paquete', 'Cant.', 'Precio Unit. (DOP)', 'ITBIS (DOP)', 'Total (DOP)']],
      body: (sale.items || []).map((it: any) => [
        it.descriptionSnapshot,
        it.quantity,
        formatDop(it.unitPriceDop),
        formatDop(it.taxAmountDop),
        formatDop(it.lineTotalDop),
      ]),
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 95;
    doc.setFontSize(11);
    doc.text(`Subtotal: ${formatDop(sale.subtotalDop)}`, 135, finalY + 10);
    doc.text(`Descuento: -${formatDop(sale.discountAmountDop)}`, 135, finalY + 16);
    doc.text(`ITBIS: ${formatDop(sale.taxAmountDop)}`, 135, finalY + 22);
    doc.setFontSize(13);
    doc.text(`TOTAL: ${formatDop(sale.totalDop)} (${formatUsd(sale.totalUsd)})`, 120, finalY + 30);

    doc.setFontSize(10);
    doc.text(`Tickets individuales emitidos (${tickets.length}):`, 14, finalY + 42);
    tickets.forEach((t, idx) => {
      if (finalY + 48 + idx * 6 < 280) {
        doc.text(
          `• ${t.ticketNumber} | ${t.service?.name || 'Actividad'} | Visitante: ${t.visitorNameSnapshot || 'Portador'} | Estado: ${t.status}`,
          16,
          finalY + 48 + idx * 6
        );
      }
    });

    doc.save(`${sale.invoiceNumber}_MontanaRedonda.pdf`);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `⛰️ *MONTAÑA REDONDA PARADISE - MICHÉS, RD*\n` +
        `Factura: *${sale.invoiceNumber}*\n` +
        `NCF: ${sale.ncfNumber || sale.ncfType}\n` +
        `Total Pagado: *${formatDop(sale.totalDop)}* (${formatUsd(sale.totalUsd)})\n` +
        `Tickets QR Generados: *${tickets.length}*\n` +
        tickets.map((t) => `• ${t.ticketNumber}: ${t.service?.name} (${t.visitorNameSnapshot || 'Portador'})`).join('\n')
    );
    const phone = (sale.customerPhone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent(`Factura ${sale.invoiceNumber} y Tickets QR - Montaña Redonda Paradise`);
    const body = encodeURIComponent(
      `Gracias por visitar Montaña Redonda Paradise (Michés, República Dominicana).\n\n` +
        `Factura: ${sale.invoiceNumber}\n` +
        `NCF: ${sale.ncfNumber || 'N/A'}\n` +
        `Total: ${formatDop(sale.totalDop)} (${formatUsd(sale.totalUsd)})\n\n` +
        `Detalle de sus ${tickets.length} Tickets Individuales:\n` +
        tickets.map((t) => `- ${t.ticketNumber} | Actividad: ${t.service?.name} | Visitante: ${t.visitorNameSnapshot || 'Portador'}`).join('\n')
    );
    window.location.href = `mailto:${sale.customerEmail || ''}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Cabecera No Imprimible */}
        <div className="no-print bg-mountain-800 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Mountain className="w-7 h-7 text-gold-400" />
            <div>
              <h2 className="text-lg font-bold">
                Centro de Impresión y Emisión Digital — {sale.invoiceNumber}
              </h2>
              <p className="text-xs text-mountain-100">
                {tickets.length} tickets individuales generados • Seleccione formato Térmico 80mm o Hoja Carta
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('TICKETS')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition ${
                mode === 'TICKETS' ? 'bg-gold-500 text-slate-950' : 'bg-mountain-700 text-white hover:bg-mountain-600'
              }`}
            >
              <TicketIcon className="w-4 h-4" /> Tickets QR ({tickets.length})
            </button>
            <button
              onClick={() => setMode('INVOICE')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition ${
                mode === 'INVOICE' ? 'bg-gold-500 text-slate-950' : 'bg-mountain-700 text-white hover:bg-mountain-600'
              }`}
            >
              <FileText className="w-4 h-4" /> Factura Fiscal
            </button>
            <button
              onClick={onClose}
              className="ml-2 p-1.5 rounded-lg bg-mountain-900/60 hover:bg-red-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Acciones No Imprimible */}
        <div className="no-print bg-slate-100 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-slate-600">Formato Papel:</span>
            <button
              onClick={() => setPaperFormat('THERMAL_80MM')}
              className={`px-3 py-1 rounded text-xs font-bold ${
                paperFormat === 'THERMAL_80MM'
                  ? 'bg-ocean-800 text-white'
                  : 'bg-white text-slate-700 border border-slate-300'
              }`}
            >
              Rollo Térmico 80mm
            </button>
            <button
              onClick={() => setPaperFormat('LETTER')}
              className={`px-3 py-1 rounded text-xs font-bold ${
                paperFormat === 'LETTER'
                  ? 'bg-ocean-800 text-white'
                  : 'bg-white text-slate-700 border border-slate-300'
              }`}
            >
              Hoja Tamaño Carta (8.5&quot; x 11&quot;)
            </button>

            {mode === 'TICKETS' && (
              <button
                onClick={selectAllTickets}
                className="ml-3 text-xs text-mountain-700 hover:underline font-semibold"
              >
                Seleccionar todos ({tickets.length})
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBrowserPrint}
              className="px-4 py-2 rounded-lg bg-mountain-700 hover:bg-mountain-800 text-white text-sm font-bold flex items-center gap-2 shadow"
            >
              <Printer className="w-4 h-4" /> Imprimir Ahora
            </button>
            <button
              onClick={handleDownloadInvoicePdf}
              className="px-3 py-2 rounded-lg bg-ocean-800 hover:bg-ocean-900 text-white text-sm font-semibold flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Descargar PDF
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-1.5"
            >
              <Share2 className="w-4 h-4" /> WhatsApp
            </button>
            <button
              onClick={handleShareEmail}
              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-1.5"
            >
              <Mail className="w-4 h-4" /> Correo
            </button>
          </div>
        </div>

        {/* Selector individual de tickets cuando está en modo TICKETS */}
        {mode === 'TICKETS' && (
          <div className="no-print px-6 py-2.5 bg-earth-100 border-b border-earth-200 flex flex-wrap gap-2 max-h-28 overflow-y-auto">
            {tickets.map((t) => {
              const checked = selectedTicketIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTicket(t.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 border transition ${
                    checked
                      ? 'bg-mountain-700 text-white border-mountain-800'
                      : 'bg-white text-slate-600 border-slate-300'
                  }`}
                >
                  {checked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  <span>
                    #{t.sequenceInSale} {t.service?.name} ({t.visitorNameSnapshot || 'Portador'})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Área de Vista Previa e Impresión Real */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {mode === 'INVOICE' ? (
            <div
              className={`bg-white mx-auto border border-slate-300 shadow-sm p-6 ${
                paperFormat === 'THERMAL_80MM' ? 'max-w-[340px] text-xs' : 'max-w-3xl text-sm'
              }`}
            >
              <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
                <div className="font-extrabold text-base tracking-wide text-mountain-900">
                  ⛰️ {company?.commercialName || 'MONTAÑA REDONDA PARADISE'}
                </div>
                <div className="text-xs text-slate-600">{company?.legalName}</div>
                <div className="text-xs font-semibold">RNC: {company?.rnc || '131-89452-1'}</div>
                <div className="text-[11px] text-slate-500">{company?.address}</div>
                <div className="text-[11px] text-slate-500">Tel: {company?.phone}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-b border-dashed border-slate-300 pb-3 mb-3">
                <div>
                  <div>
                    <span className="font-bold">FACTURA:</span> {sale.invoiceNumber}
                  </div>
                  <div>
                    <span className="font-bold">NCF:</span> {sale.ncfNumber || sale.ncfType}
                  </div>
                  <div>
                    <span className="font-bold">ESTADO:</span> {sale.status}
                  </div>
                </div>
                <div className="text-right">
                  <div>
                    <span className="font-bold">FECHA:</span>{' '}
                    {new Date(sale.createdAt).toLocaleString('es-DO')}
                  </div>
                  <div>
                    <span className="font-bold">CAJERO:</span>{' '}
                    {sale.employee
                      ? `${sale.employee.firstName} ${sale.employee.lastName}`
                      : 'Recepción'}
                  </div>
                  <div>
                    <span className="font-bold">CLIENTE:</span>{' '}
                    {sale.customerName || 'Visitante Directo'}
                  </div>
                  {sale.customerRncCedula && (
                    <div>
                      <span className="font-bold">RNC/CÉD:</span> {sale.customerRncCedula}
                    </div>
                  )}
                </div>
              </div>

              <table className="w-full text-left border-collapse mb-4">
                <thead>
                  <tr className="border-b border-slate-400 text-[11px] uppercase">
                    <th className="py-1">Servicio / Actividad</th>
                    <th className="py-1 text-center">Cant</th>
                    <th className="py-1 text-right">Unitario</th>
                    <th className="py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {(sale.items || []).map((item: any) => (
                    <tr key={item.id}>
                      <td className="py-1.5 font-medium">
                        {item.descriptionSnapshot}
                        <div className="text-[10px] text-slate-500">
                          Genera {item.ticketsExpectedCount} ticket(s) QR
                        </div>
                      </td>
                      <td className="py-1.5 text-center">{item.quantity}</td>
                      <td className="py-1.5 text-right">{formatDop(item.unitPriceDop)}</td>
                      <td className="py-1.5 text-right font-semibold">{formatDop(item.lineTotalDop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-slate-400 pt-2 space-y-1 text-right text-xs">
                <div>Subtotal: {formatDop(sale.subtotalDop)}</div>
                {Number(sale.discountAmountDop) > 0 && (
                  <div className="text-emerald-700">
                    Descuento ({sale.discountReason || 'Autorizado'}): -{formatDop(sale.discountAmountDop)}
                  </div>
                )}
                <div>ITBIS (18%): {formatDop(sale.taxAmountDop)}</div>
                <div className="text-base font-extrabold text-mountain-900 pt-1 border-t border-dashed">
                  TOTAL: {formatDop(sale.totalDop)} ({formatUsd(sale.totalUsd)})
                </div>
                <div>Pagado: {formatDop(sale.paidAmountDop)}</div>
                {Number(sale.changeGivenDop) > 0 && (
                  <div className="font-bold">Devuelta Entregada: {formatDop(sale.changeGivenDop)}</div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-dashed border-slate-300 text-center text-[11px] text-slate-600">
                Total de Tickets QR Individuales Asociados: <strong>{tickets.length}</strong>
                <div className="mt-1">{company?.ticketFooterInstructions}</div>
              </div>
            </div>
          ) : (
            <div
              className={
                paperFormat === 'THERMAL_80MM'
                  ? 'flex flex-col items-center gap-4'
                  : 'grid grid-cols-1 md:grid-cols-2 gap-4 letter-ticket-grid'
              }
            >
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className={
                    paperFormat === 'THERMAL_80MM'
                      ? 'thermal-ticket-page bg-white border border-slate-300 rounded-xl shadow-sm p-4 w-[310px]'
                      : 'letter-ticket-card bg-white border-2 border-dashed border-slate-400 rounded-xl p-4 shadow-sm'
                  }
                >
                  {/* Encabezado con Logotipo e Identidad de Montaña Redonda */}
                  <div className="text-center border-b border-dashed border-slate-300 pb-2 mb-2">
                    <div className="text-xs font-black tracking-wider text-mountain-800 uppercase">
                      ⛰️ {company?.commercialName || 'MONTAÑA REDONDA PARADISE'}
                    </div>
                    <div className="text-[10px] text-slate-500">Michés, República Dominicana • RNC {company?.rnc}</div>
                  </div>

                  {/* Actividad Principal Destacada */}
                  <div className="bg-mountain-900 text-white rounded-lg py-2 px-3 text-center mb-3">
                    <div className="text-[10px] uppercase tracking-widest text-gold-400 font-bold">
                      TICKET INDIVIDUAL DE ACTIVIDAD
                    </div>
                    <div className="text-sm font-extrabold uppercase leading-tight mt-0.5">
                      {ticket.service?.name || 'Actividad Turística'}
                    </div>
                    {ticket.sourcePackage && (
                      <div className="text-[10px] text-mountain-200 mt-0.5">
                        Incluido en: {ticket.sourcePackage.name}
                      </div>
                    )}
                  </div>

                  {/* Código QR Único y Número Legible */}
                  <div className="flex flex-col items-center justify-center my-2">
                    <div className="p-2 bg-white border-2 border-slate-900 rounded-lg">
                      <QRCodeSVG value={ticket.qrPayload} size={148} level="M" />
                    </div>
                    <div className="mt-1.5 font-mono text-xs font-extrabold tracking-wider text-slate-900">
                      {ticket.ticketNumber}
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold">
                      Ticket {ticket.sequenceInSale} de {ticket.totalInSale || tickets.length} • Factura {sale.invoiceNumber}
                    </div>
                  </div>

                  {/* Datos del Visitante, Fechas y Estado */}
                  <div className="border-t border-b border-dashed border-slate-300 py-2 my-2 text-[11px] space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-600">VISITANTE:</span>
                      <span className="font-extrabold text-slate-900">
                        {ticket.visitorNameSnapshot || `Portador (#${ticket.sequenceInSale})`} ({ticket.participantType})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-600">PUNTO ACCESO:</span>
                      <span className="font-semibold text-slate-800">
                        {ticket.service?.accessPointName || 'Control Principal'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-600">EMISIÓN:</span>
                      <span>{new Date(ticket.issuedAt).toLocaleString('es-DO')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-600">VALIDEZ:</span>
                      <span className="font-bold">{ticket.validUntil} (1 solo uso)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-600">ESTADO:</span>
                      <span
                        className={`font-extrabold px-1.5 py-0.2 rounded text-[10px] ${
                          ticket.status === 'AVAILABLE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ticket.status === 'USED'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ticket.status}
                      </span>
                    </div>
                  </div>

                  {/* Instrucciones y Restricciones */}
                  <div className="text-[10px] text-slate-600 leading-snug space-y-1">
                    {ticket.restrictionsSnapshot && (
                      <div>
                        <strong className="text-slate-800">Restricciones:</strong> {ticket.restrictionsSnapshot}
                      </div>
                    )}
                    <div>
                      <strong className="text-slate-800">Instrucciones:</strong>{' '}
                      {ticket.instructionsSnapshot || company?.ticketFooterInstructions}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

