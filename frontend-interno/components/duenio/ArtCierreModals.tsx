'use client';

import React from 'react';
import { Calendar, FileText, CheckCircle2, RefreshCw, AlertCircle, X } from 'lucide-react';

export default function ArtCierreModals(props: Record<string, any>) {
  const {
    artList,
    isModalGenerarCierreOpen,
    setIsModalGenerarCierreOpen,
    artCierreId,
    setArtCierreId,
    fechaDesdeCierre,
    setFechaDesdeCierre,
    fechaHastaCierre,
    setFechaHastaCierre,
    observacionesCierre,
    setObservacionesCierre,
    savingGenerarCierre,
    handleGenerarCierre,
    isModalRegistrarFacturaOpen,
    setIsModalRegistrarFacturaOpen,
    cierreParaFactura,
    numeroFacturaInput,
    setNumeroFacturaInput,
    fechaEmisionInput,
    setFechaEmisionInput,
    fechaEnvioFacturaInput,
    setFechaEnvioFacturaInput,
    observacionesFacturaInput,
    setObservacionesFacturaInput,
    savingFactura,
    handleGuardarFacturaCierre,
    isModalMarcarCobradoOpen,
    setIsModalMarcarCobradoOpen,
    cierreParaCobrado,
    fechaCobroInput,
    setFechaCobroInput,
    metodoCobroInput,
    setMetodoCobroInput,
    comprobanteCobroInput,
    setComprobanteCobroInput,
    observacionesCobroInput,
    setObservacionesCobroInput,
    savingCobro,
    handleGuardarCobroCierre,
  } = props;

  return (
    <>
      {/* MODAL 6: GENERAR CIERRE DE FACTURACIÓN (Punto 7) */}
      {isModalGenerarCierreOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center text-primary-600">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Generar Cierre de Facturación</h3>
                  <p className="text-xs text-slate-500">Consolidar viajes del periodo para facturar a la ART</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalGenerarCierreOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerarCierre} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ART / Aseguradora <span className="text-red-500">*</span>
                </label>
                <select
                  value={artCierreId}
                  onChange={(e) => setArtCierreId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white"
                  required
                >
                  <option value="">-- Seleccionar ART --</option>
                  {artList.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} (Corte: {a.periodoFacturacion || 'MENSUAL'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha Desde <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={fechaDesdeCierre}
                    onChange={(e) => setFechaDesdeCierre(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha Hasta <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={fechaHastaCierre}
                    onChange={(e) => setFechaHastaCierre(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observaciones internas del periodo
                </label>
                <textarea
                  value={observacionesCierre}
                  onChange={(e) => setObservacionesCierre(e.target.value)}
                  rows={2}
                  placeholder="Ej: Cierre 1ra quincena de mes. Se incluyen viajes de traslado con peajes..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div className="p-3 bg-primary-50 rounded-xl border border-primary-100 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-primary-800 leading-relaxed">
                  El sistema calculará automáticamente el monto facturado a la ART, las liquidaciones a los choferes y los peajes, generando el registro oficial de cierre pendiente de cobro.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalGenerarCierreOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingGenerarCierre || !artCierreId || !fechaDesdeCierre || !fechaHastaCierre}
                  className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {savingGenerarCierre ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Generando Cierre...
                    </>
                  ) : (
                    'Generar Cierre Ahora'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: REGISTRAR FACTURA EMITIDA (Punto 7) */}
      {isModalRegistrarFacturaOpen && cierreParaFactura && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Registrar Factura Emitida</h3>
                  <p className="text-xs text-slate-500">Control de envío y vencimiento con la ART</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalRegistrarFacturaOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/70 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Cierre:</span>
                <span className="font-bold text-slate-900 font-mono">#{cierreParaFactura.id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ART:</span>
                <span className="font-semibold text-primary-700">{cierreParaFactura.artEmpresa?.nombre || 'ART'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total a Facturar:</span>
                <span className="font-bold text-emerald-700 text-sm">
                  ${Number(cierreParaFactura.totalFacturadoArt || 0).toLocaleString('es-AR')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cantidad de Viajes:</span>
                <span className="font-semibold text-slate-800">{cierreParaFactura.totalViajes} servicios</span>
              </div>
            </div>

            <form onSubmit={handleGuardarFacturaCierre} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Número de Factura Emitida <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={numeroFacturaInput}
                  onChange={(e) => setNumeroFacturaInput(e.target.value)}
                  placeholder="Ej: A-0001-00045231 o FACT-88192"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha de Emisión
                  </label>
                  <input
                    type="date"
                    value={fechaEmisionInput}
                    onChange={(e) => setFechaEmisionInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha de Envío a la ART
                  </label>
                  <input
                    type="date"
                    value={fechaEnvioFacturaInput}
                    onChange={(e) => setFechaEnvioFacturaInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observaciones / Notas de facturación
                </label>
                <textarea
                  value={observacionesFacturaInput}
                  onChange={(e) => setObservacionesFacturaInput(e.target.value)}
                  rows={2}
                  placeholder="Ej: Enviada por portal de proveedores / Enviada a facturacion@art.com..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalRegistrarFacturaOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingFactura || !numeroFacturaInput.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {savingFactura ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    'Agendar y Guardar Factura'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: REGISTRAR COBRO DEL CIERRE (Punto 7) */}
      {isModalMarcarCobradoOpen && cierreParaCobrado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Registrar Cobranza de la ART</h3>
                  <p className="text-xs text-slate-500">Marcar cierre como cobrado e ingresar datos bancarios</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalMarcarCobradoOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/70 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Factura / Cierre:</span>
                <span className="font-bold text-slate-900 font-mono">{cierreParaCobrado.numeroFactura || '#' + cierreParaCobrado.id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ART:</span>
                <span className="font-semibold text-primary-700">{cierreParaCobrado.artEmpresa?.nombre || 'ART'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Monto Cobrado:</span>
                <span className="font-bold text-emerald-700 text-sm">
                  ${Number(cierreParaCobrado.totalFacturadoArt || 0).toLocaleString('es-AR')}
                </span>
              </div>
            </div>

            <form onSubmit={handleGuardarCobroCierre} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha de Cobro / Acreditación <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={fechaCobroInput}
                    onChange={(e) => setFechaCobroInput(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Método de Pago <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={metodoCobroInput}
                    onChange={(e) => setMetodoCobroInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white"
                  >
                    <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                    <option value="ECHEQ">E-Cheq</option>
                    <option value="CHEQUE">Cheque Físico</option>
                    <option value="DEBITO_AUTOMATICO">Débito Automático</option>
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="OTRO">Otro Medio</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  N° Comprobante / Orden de Pago (OP)
                </label>
                <input
                  type="text"
                  value={comprobanteCobroInput}
                  onChange={(e) => setComprobanteCobroInput(e.target.value)}
                  placeholder="Ej: OP-992384 o Ref. Transferencia 10293847"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observaciones de Cobro
                </label>
                <textarea
                  value={observacionesCobroInput}
                  onChange={(e) => setObservacionesCobroInput(e.target.value)}
                  rows={2}
                  placeholder="Detalles sobre retenciones impositivas, cuenta de acreditación, etc."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalMarcarCobradoOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCobro || !fechaCobroInput}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {savingCobro ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Registrando Cobro...
                    </>
                  ) : (
                    'Confirmar Cobro'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
