'use client';

import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  QrCode,
  Camera,
  Keyboard,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  FileWarning,
  UserCheck,
  Clock,
  MapPin,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface ScannerAndOperationsViewProps {
  services: any[];
  currentUser: any;
  onRefreshSystem: () => void;
}

export function ScannerAndOperationsView({
  services,
  currentUser,
  onRefreshSystem,
}: ScannerAndOperationsViewProps) {
  const [scanInput, setScanInput] = useState('');
  const [stationServiceId, setStationServiceId] = useState<string>('');
  const [accessPoint, setAccessPoint] = useState<string>('Punto de Control Principal');
  const [cameraActive, setCameraActive] = useState(false);

  // Estado de inspección y validación
  const [inspectedData, setInspectedData] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Controles de seguridad obligatorios (Zip Line, Buggies, etc.)
  const [safetyInstructionsAccepted, setSafetyInstructionsAccepted] = useState(false);
  const [safetyHarnessChecked, setSafetyHarnessChecked] = useState(false);
  const [safetyHelmetChecked, setSafetyHelmetChecked] = useState(false);
  const [operatorNotes, setOperatorNotes] = useState('');

  // Resumen operativo e incidencias
  const [opsSummary, setOpsSummary] = useState<any>(null);
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    serviceId: '',
    severity: 'MEDIUM',
    incidentType: 'SAFETY_GEAR',
    description: '',
    resolutionTaken: '',
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const html5QrCodeRef = useRef<any>(null);

  const loadOperationalSummary = async () => {
    try {
      const data = await apiFetch(
        `/activities/summary${stationServiceId ? `?serviceId=${stationServiceId}` : ''}`
      );
      setOpsSummary(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadOperationalSummary();
  }, [stationServiceId]);

  // Manejo de cámara con html5-qrcode
  useEffect(() => {
    let scannerInstance: any = null;
    if (cameraActive && typeof window !== 'undefined') {
      import('html5-qrcode')
        .then(({ Html5Qrcode }) => {
          scannerInstance = new Html5Qrcode('mrp-qr-reader');
          html5QrCodeRef.current = scannerInstance;
          scannerInstance
            .start(
              { facingMode: 'environment' },
              { fps: 10, qrbox: { width: 230, height: 230 } },
              (decodedText: string) => {
                setScanInput(decodedText);
                handleInspectCode(decodedText);
                setCameraActive(false);
              },
              () => {}
            )
            .catch(() => {
              setErrorMsg('No se pudo acceder a la cámara en este dispositivo. Puede usar lector QR USB o ingreso directo.');
              setCameraActive(false);
            });
        })
        .catch(() => {
          setCameraActive(false);
        });
    }

    return () => {
      if (scannerInstance) {
        scannerInstance.stop().catch(() => {});
      }
    };
  }, [cameraActive]);

  const handleInspectCode = async (codeToInspect?: string) => {
    const targetCode = (codeToInspect ?? scanInput).trim();
    if (!targetCode) return;

    setLoading(true);
    setErrorMsg(null);
    setValidationResult(null);

    try {
      const res = await apiFetch(`/validations/inspect?code=${encodeURIComponent(targetCode)}`);
      setInspectedData(res);

      // Si el ticket pertenece a una actividad que NO requiere control de seguridad, preparar checks por defecto
      if (res?.ticket?.service && !res.ticket.service.requiresSafetyCheck) {
        setSafetyInstructionsAccepted(true);
        setSafetyHarnessChecked(true);
        setSafetyHelmetChecked(true);
      } else {
        setSafetyInstructionsAccepted(false);
        setSafetyHarnessChecked(false);
        setSafetyHelmetChecked(false);
      }

      if (res?.ticket?.service?.accessPointName) {
        setAccessPoint(res.ticket.service.accessPointName);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al consultar el código QR');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmValidation = async (directCode?: string) => {
    const code = (directCode || inspectedData?.ticket?.qrPayload || scanInput).trim();
    if (!code) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await apiFetch('/validations/consume', {
        method: 'POST',
        body: JSON.stringify({
          qrOrTicketCode: code,
          stationServiceId: stationServiceId || undefined,
          accessPoint,
          deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : 'Terminal Operador',
          safetyInstructionsAccepted,
          safetyHarnessChecked,
          safetyHelmetChecked,
          operatorNotes,
        }),
      });
      setValidationResult(result);
      await handleInspectCode(code);
      await loadOperationalSummary();
      onRefreshSystem();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmitIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentForm.serviceId || !incidentForm.description) return;
    await apiFetch('/activities/incidents', {
      method: 'POST',
      body: JSON.stringify({
        ...incidentForm,
        ticketId: inspectedData?.ticket?.id || null,
      }),
    });
    setIncidentModalOpen(false);
    setIncidentForm({
      serviceId: services[0]?.id || '',
      severity: 'MEDIUM',
      incidentType: 'SAFETY_GEAR',
      description: '',
      resolutionTaken: '',
    });
    await loadOperationalSummary();
  };

  const ticket = inspectedData?.ticket;
  const requiresSafety = !!ticket?.service?.requiresSafetyCheck;

  return (
    <div className="space-y-6">
      {/* Indicadores Operativos en Tiempo Real */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-xs font-bold uppercase text-slate-500">Tickets Vendidos</div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {opsSummary?.indicators?.totalSold ?? 0}
          </div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 shadow-sm">
          <div className="text-xs font-bold uppercase text-emerald-700">Tickets Disponibles</div>
          <div className="text-2xl font-black text-emerald-800 mt-1">
            {opsSummary?.indicators?.totalAvailable ?? 0}
          </div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 shadow-sm">
          <div className="text-xs font-bold uppercase text-blue-700">Tickets Utilizados</div>
          <div className="text-2xl font-black text-blue-800 mt-1">
            {opsSummary?.indicators?.totalUsed ?? 0}
          </div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200 shadow-sm">
          <div className="text-xs font-bold uppercase text-red-700">Tickets Anulados</div>
          <div className="text-2xl font-black text-red-800 mt-1">
            {opsSummary?.indicators?.totalCancelled ?? 0}
          </div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 shadow-sm">
          <div className="text-xs font-bold uppercase text-amber-800">Participantes Atendidos</div>
          <div className="text-2xl font-black text-amber-900 mt-1">
            {opsSummary?.indicators?.participantsAttended ?? 0}
          </div>
        </div>
      </div>

      {/* Área Principal: Escáner QR Izquierda + Resultado e Inspección Derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Panel de Escaneo QR (Cámara / Lector USB / Selección rápida) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-mountain-900 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-mountain-700" /> Terminal de Escaneo y Validación QR
            </h3>
            <button
              onClick={() => {
                setIncidentForm((prev) => ({
                  ...prev,
                  serviceId: stationServiceId || services[0]?.id || '',
                }));
                setIncidentModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1"
            >
              <FileWarning className="w-3.5 h-3.5" /> Registrar Incidencia
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Estación / Actividad Asignada
              </label>
              <select
                value={stationServiceId}
                onChange={(e) => setStationServiceId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white font-medium"
              >
                <option value="">Todas las actividades (Multi-Acceso)</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Punto de Acceso</label>
              <input
                type="text"
                value={accessPoint}
                onChange={(e) => setAccessPoint(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ej. Torre Zip Line #1"
              />
            </div>
          </div>

          {/* Entrada compatible con Lector QR USB (HID) y Teclado */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleInspectCode();
            }}
            className="space-y-2"
          >
            <label className="block text-xs font-bold text-slate-700">
              Escanear con Lector QR USB o introducir Número / Token QR:
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Keyboard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  ref={inputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Escanee el código QR aquí (ej. MRP1.TKT-...) o TKT-..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-mountain-600 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-mountain-500"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2.5 rounded-xl bg-mountain-700 hover:bg-mountain-800 text-white font-bold text-sm flex items-center gap-1.5"
              >
                <Search className="w-4 h-4" /> Consultar
              </button>
            </div>
          </form>

          {/* Botón para activar Cámara en Teléfonos / Tablets / PC */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setCameraActive((prev) => !prev)}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition ${
                cameraActive
                  ? 'bg-red-600 text-white border-red-700'
                  : 'bg-ocean-800 hover:bg-ocean-900 text-white border-ocean-900'
              }`}
            >
              <Camera className="w-4 h-4" />
              {cameraActive
                ? 'Detener Cámara QR'
                : 'Activar Cámara (Móvil / Tablet / Computadora)'}
            </button>
          </div>

          {cameraActive && (
            <div className="rounded-xl overflow-hidden border-2 border-ocean-700 bg-black p-2">
              <div id="mrp-qr-reader" className="w-full min-h-[240px]" />
            </div>
          )}

          {/* Lista Rápida de Tickets Disponibles para Probar o Validar con 1 Clic */}
          <div className="border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase text-slate-500">
                Tickets Disponibles en Cola ({opsSummary?.indicators?.totalAvailable ?? 0})
              </span>
              <button
                onClick={loadOperationalSummary}
                className="text-xs text-mountain-700 hover:underline flex items-center gap-1 font-semibold"
              >
                <RefreshCw className="w-3 h-3" /> Actualizar
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {(opsSummary?.byActivity || [])
                .flatMap((act: any) => act.availableTicketsList || [])
                .slice(0, 15)
                .map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setScanInput(t.qrPayload);
                      handleInspectCode(t.qrPayload);
                    }}
                    className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-mountain-600 hover:bg-mountain-50/50 transition flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {t.ticketNumber} • <span className="text-mountain-700">{t.service?.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Visitante: {t.visitorNameSnapshot || `Portador (#${t.sequenceInSale})`}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                      ESCANEAR
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Panel Derecho: Resultado Inmediato de Validación y Controles de Seguridad */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-300 text-red-800 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" /> {errorMsg}
            </div>
          )}

          {/* Banner de Resultado de la Validación Atómica */}
          {validationResult && (
            <div
              className={`p-5 rounded-2xl border-2 flex items-start gap-4 ${
                validationResult.allowed
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                  : validationResult.resultCode === 'REJECTED_ALREADY_USED'
                  ? 'bg-amber-50 border-amber-500 text-amber-950'
                  : 'bg-red-50 border-red-500 text-red-950'
              }`}
            >
              {validationResult.allowed ? (
                <CheckCircle2 className="w-10 h-10 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-10 h-10 text-red-600 shrink-0" />
              )}
              <div className="space-y-1">
                <div className="text-xs font-black uppercase tracking-wider">
                  RESULTADO DE VALIDACIÓN: {validationResult.resultCode}
                </div>
                <div className="text-lg font-extrabold">{validationResult.message}</div>
                {validationResult.previousUse && (
                  <div className="mt-2 p-3 rounded-lg bg-white/80 border border-amber-300 text-xs space-y-1">
                    <div className="font-bold text-amber-900">
                      ⚠️ REGISTRO DE UTILIZACIÓN ANTERIOR:
                    </div>
                    <div>
                      <strong>Fecha y Hora:</strong>{' '}
                      {new Date(validationResult.previousUse.usedAt).toLocaleString('es-DO')}
                    </div>
                    <div>
                      <strong>Punto de Acceso:</strong> {validationResult.previousUse.accessPoint}
                    </div>
                    <div>
                      <strong>Validado por:</strong> {validationResult.previousUse.validatedBy}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ficha del Ticket Escaneado */}
          {!inspectedData ? (
            <div className="h-72 flex flex-col items-center justify-center text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl p-6">
              <QrCode className="w-14 h-14 mb-2 text-slate-300" />
              <p className="font-bold text-slate-600">
                Escanee un código QR o seleccione un ticket de la cola izquierda
              </p>
              <p className="text-xs mt-1 max-w-md">
                El sistema verificará de forma atómica en PostgreSQL la firma criptográfica, el estado de pago, la actividad, la vigencia y los controles de seguridad.
              </p>
            </div>
          ) : !ticket ? (
            <div className="p-6 rounded-2xl bg-red-50 border-2 border-red-400 text-red-900 flex items-center gap-4">
              <XCircle className="w-10 h-10 text-red-600 shrink-0" />
              <div>
                <h4 className="font-black text-base">CÓDIGO QR RECHAZADO ({inspectedData.code})</h4>
                <p className="text-sm">{inspectedData.message}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 text-white p-4 rounded-xl">
                <div>
                  <div className="text-xs uppercase text-gold-400 font-bold">
                    ACTIVIDAD CORRESPONDIENTE
                  </div>
                  <div className="text-xl font-black">{ticket.service?.name}</div>
                  {ticket.sourcePackage && (
                    <div className="text-xs text-slate-300">
                      Paquete de Origen: {ticket.sourcePackage.name}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                      ticket.status === 'AVAILABLE'
                        ? 'bg-emerald-500 text-slate-950'
                        : ticket.status === 'USED'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-red-500 text-white'
                    }`}
                  >
                    ESTADO: {ticket.status}
                  </span>
                  <div className="font-mono text-xs text-slate-300 mt-1">{ticket.ticketNumber}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-500 font-bold flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" /> VISITANTE ASIGNADO
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 mt-1">
                    {ticket.visitorNameSnapshot || `Portador (#${ticket.sequenceInSale})`}
                  </div>
                  <div className="text-slate-500">Categoría: {ticket.participantType}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-500 font-bold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> VALIDEZ Y FACTURA
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 mt-1">
                    Válido: {ticket.validUntil}
                  </div>
                  <div className="text-slate-500">
                    Factura: {ticket.sale?.invoiceNumber} ({ticket.sale?.status})
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-slate-500 font-bold flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> ACCESO
                    </div>
                    <div className="text-sm font-extrabold text-slate-900 mt-1">
                      {ticket.service?.accessPointName}
                    </div>
                  </div>
                  <QRCodeSVG value={ticket.qrPayload} size={52} />
                </div>
              </div>

              {/* Si el ticket YA FUE UTILIZADO, mostrar alerta destacada */}
              {ticket.status === 'USED' && (
                <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs space-y-1">
                  <div className="font-black text-sm flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700" /> ESTE TICKET YA FUE UTILIZADO
                  </div>
                  <div>
                    <strong>Fecha y hora de uso:</strong>{' '}
                    {ticket.usedAt ? new Date(ticket.usedAt).toLocaleString('es-DO') : 'Registrado'}
                  </div>
                  <div>
                    <strong>Lugar / Punto de acceso:</strong> {ticket.usedAtAccessPoint}
                  </div>
                  <div>
                    <strong>Operador que validó:</strong> {ticket.usedByUsername || 'Operador'}
                  </div>
                </div>
              )}

              {/* Controles de Seguridad Obligatorios para Zip Line / Buggies (Sección 9) */}
              {ticket.status === 'AVAILABLE' && requiresSafety && (
                <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-300 space-y-2.5">
                  <div className="font-extrabold text-xs uppercase text-blue-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-700" /> Protocolo de Seguridad Obligatorio ({ticket.service?.name})
                  </div>
                  <p className="text-xs text-blue-800">
                    La validación del ticket no sustituye las comprobaciones físicas de seguridad. Marque cada verificación antes de autorizar el ingreso:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-semibold text-slate-800">
                    <label className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-blue-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={safetyInstructionsAccepted}
                        onChange={(e) => setSafetyInstructionsAccepted(e.target.checked)}
                        className="w-4 h-4 accent-mountain-700"
                      />
                      Aceptó instrucciones de seguridad
                    </label>
                    <label className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-blue-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={safetyHarnessChecked}
                        onChange={(e) => setSafetyHarnessChecked(e.target.checked)}
                        className="w-4 h-4 accent-mountain-700"
                      />
                      Arnés / Cinturón verificado
                    </label>
                    <label className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-blue-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={safetyHelmetChecked}
                        onChange={(e) => setSafetyHelmetChecked(e.target.checked)}
                        className="w-4 h-4 accent-mountain-700"
                      />
                      Casco y equipo comprobado
                    </label>
                  </div>
                  <input
                    type="text"
                    value={operatorNotes}
                    onChange={(e) => setOperatorNotes(e.target.value)}
                    placeholder="Observaciones del operador (opcional, ej. Peso verificado, equipo #14)..."
                    className="w-full rounded-lg border border-blue-200 px-3 py-1.5 text-xs bg-white"
                  />
                </div>
              )}

              {/* Botón de Confirmación Atómica de Utilización */}
              <div className="flex items-center justify-end gap-3 pt-2">
                {ticket.status === 'AVAILABLE' ? (
                  <button
                    onClick={() => handleConfirmValidation(ticket.qrPayload)}
                    disabled={loading}
                    className="w-full py-3.5 px-6 rounded-xl bg-mountain-700 hover:bg-mountain-800 text-white font-black text-base shadow-lg flex items-center justify-center gap-2 transition"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    CONFIRMAR Y REGISTRAR UTILIZACIÓN DEL TICKET
                  </button>
                ) : (
                  <button
                    onClick={() => handleConfirmValidation(ticket.qrPayload)}
                    disabled={loading}
                    className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs"
                  >
                    Probar Intento de Re-Validación (Quedará registrado rechazo en Auditoría)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabla de Control Operativo por Actividad e Historial de Validaciones Recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h4 className="font-extrabold text-sm text-slate-900 mb-3 uppercase">
            Estado Operativo por Actividad
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase">
                  <th className="py-2">Actividad</th>
                  <th className="py-2 text-center">Vendidos</th>
                  <th className="py-2 text-center">Disponibles</th>
                  <th className="py-2 text-center">Utilizados</th>
                  <th className="py-2 text-center">Anulados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(opsSummary?.byActivity || []).map((row: any) => (
                  <tr key={row.service.id}>
                    <td className="py-2 font-bold text-slate-800">
                      {row.service.name}
                      {row.service.requiresSafetyCheck && (
                        <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px]">
                          Seguridad Oblig.
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-center font-semibold">{row.ticketsSold}</td>
                    <td className="py-2 text-center font-bold text-emerald-700">{row.ticketsAvailable}</td>
                    <td className="py-2 text-center font-bold text-blue-700">{row.ticketsUsed}</td>
                    <td className="py-2 text-center font-bold text-red-600">{row.ticketsCancelled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h4 className="font-extrabold text-sm text-slate-900 mb-3 uppercase">
            Historial en Vivo de Validaciones QR e Incidencias
          </h4>
          <div className="max-h-64 overflow-y-auto space-y-2 text-xs">
            {(opsSummary?.recentValidations || []).map((v: any) => (
              <div
                key={v.id}
                className="p-2.5 rounded-lg border border-slate-200 flex items-center justify-between"
              >
                <div>
                  <span
                    className={`font-extrabold px-1.5 py-0.5 rounded text-[10px] mr-2 ${
                      v.validationResult === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {v.validationResult}
                  </span>
                  <span className="font-bold">{v.ticket?.ticketNumber || 'QR Inválido'}</span> —{' '}
                  <span>{v.service?.name || v.accessPoint}</span>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Operador: {v.validatedByUser?.username || currentUser?.username} • Punto: {v.accessPoint}
                    {v.safetyHarnessChecked && ' • [Arnés y Casco OK]'}
                  </div>
                </div>
                <div className="text-[11px] text-slate-500">
                  {new Date(v.validatedAt).toLocaleTimeString('es-DO')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal de Registro de Incidencia en Actividad */}
      {incidentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSubmitIncident}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-extrabold text-slate-900">
              Registrar Incidencia Operativa o de Seguridad
            </h3>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Actividad</label>
              <select
                value={incidentForm.serviceId}
                onChange={(e) => setIncidentForm({ ...incidentForm, serviceId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Severidad</label>
                <select
                  value={incidentForm.severity}
                  onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                  <option value="CRITICAL">Crítica</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Tipo</label>
                <select
                  value={incidentForm.incidentType}
                  onChange={(e) => setIncidentForm({ ...incidentForm, incidentType: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="SAFETY_GEAR">Equipo de Seguridad</option>
                  <option value="WEATHER_PAUSE">Pausa por Clima / Viento</option>
                  <option value="VISITOR_REFUSAL">Restricción de Visitante</option>
                  <option value="EQUIPMENT">Mantenimiento</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Descripción</label>
              <textarea
                value={incidentForm.description}
                onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                rows={3}
                placeholder="Detalle lo ocurrido y el operador responsable..."
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIncidentModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
              >
                Guardar Incidencia
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

