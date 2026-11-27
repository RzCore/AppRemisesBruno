'use client';

import React from 'react';
import { Car, Wrench, FileText, Phone, DollarSign, RefreshCw, AlertCircle, X } from 'lucide-react';

export default function ArtIncidentModals(props: Record<string, any>) {
  const {
    choferesList,
    isModalReasignarOpen,
    setIsModalReasignarOpen,
    viajeParaReasignar,
    nuevoChoferId,
    setNuevoChoferId,
    motivoReasignacion,
    setMotivoReasignacion,
    savingReasignacion,
    handleGuardarReasignar,
    isModalAuxilioOpen,
    setIsModalAuxilioOpen,
    viajeParaAuxilio,
    choferAuxilioId,
    setChoferAuxilioId,
    puntoTrasbordo,
    setPuntoTrasbordo,
    kmChoferInicial,
    setKmChoferInicial,
    savingAuxilio,
    handleGuardarAuxilio,
    isModalSiniestroOpen,
    setIsModalSiniestroOpen,
    viajeParaSiniestro,
    tipoAccionSiniestro,
    setTipoAccionSiniestro,
    nuevoNumeroSiniestro,
    setNuevoNumeroSiniestro,
    motivoSiniestro,
    setMotivoSiniestro,
    savingSiniestro,
    handleGuardarSiniestro,
    isModalCoordinacionOpen,
    setIsModalCoordinacionOpen,
    viajeParaCoordinacion,
    estadoCoordinacionSeleccionado,
    setEstadoCoordinacionSeleccionado,
    motivoRechazoPaciente,
    setMotivoRechazoPaciente,
    observacionesCoordinacion,
    setObservacionesCoordinacion,
    savingCoordinacion,
    handleGuardarCoordinacion,
    isModalPeajesOpen,
    setIsModalPeajesOpen,
    viajeParaPeajes,
    montoPeajesInput,
    setMontoPeajesInput,
    observacionesPeajeInput,
    setObservacionesPeajeInput,
    savingPeajes,
    handleGuardarPeajes,
  } = props;

  return (
    <>
      {/* MODAL 1: REASIGNAR CHOFER ANTES DE SALIR (Punto 1) */}
      {isModalReasignarOpen && viajeParaReasignar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Reasignar Chofer (Antes de Salir)</h3>
                  <p className="text-xs text-slate-500">Avería o indisponibilidad previa a la salida</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalReasignarOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/70 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Pasajero / Paciente:</span>
                <span className="font-semibold text-slate-800">{viajeParaReasignar.clienteNombre || viajeParaReasignar.nombrePasajero || 'Sin especificar'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ART:</span>
                <span className="font-semibold text-primary-700">{viajeParaReasignar.artEmpresa?.nombre || 'ART'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Trayecto:</span>
                <span className="font-medium text-slate-700 break-words flex-1 min-w-0 text-right">{viajeParaReasignar.origen} &rarr; {viajeParaReasignar.destino}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Chofer asignado actual:</span>
                <span className="font-semibold text-amber-800">
                  {viajeParaReasignar.chofer ? `${viajeParaReasignar.chofer.nombre} ${viajeParaReasignar.chofer.apellido}` : 'Sin chofer'}
                </span>
              </div>
            </div>

            <form onSubmit={handleGuardarReasignar} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nuevo Chofer a Asignar <span className="text-red-500">*</span>
                </label>
                <select
                  value={nuevoChoferId}
                  onChange={(e) => setNuevoChoferId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="">-- Seleccionar chofer disponible --</option>
                  {choferesList
                    .filter((c: any) => c.id !== viajeParaReasignar.choferId)
                    .map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} {c.apellido} ({c.autoModelo || 'Vehículo'} {c.autoPatente ? `- ${c.autoPatente}` : ''})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motivo de la reasignación
                </label>
                <input
                  type="text"
                  value={motivoReasignacion}
                  onChange={(e) => setMotivoReasignacion(e.target.value)}
                  placeholder="Ej: Vehículo averiado, pinchadura de neumático, imprevisto..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  El chofer anterior será desvinculado de este viaje y el nuevo chofer recibirá la notificación inmediata en su celular para iniciar el recorrido.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalReasignarOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingReasignacion || !nuevoChoferId}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {savingReasignacion ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Reasignando...
                    </>
                  ) : (
                    'Confirmar Reasignación'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: AUXILIO MECÁNICO / TRASBORDO EN VIAJE (Punto 2) */}
      {isModalAuxilioOpen && viajeParaAuxilio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Auxilio Mecánico en Viaje</h3>
                  <p className="text-xs text-slate-500">Enviar móvil de relevo y registrar trasbordo</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalAuxilioOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/70 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Paciente a bordo:</span>
                <span className="font-semibold text-slate-800">{viajeParaAuxilio.clienteNombre || viajeParaAuxilio.nombrePasajero}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Chofer averiado:</span>
                <span className="font-semibold text-red-700">
                  {viajeParaAuxilio.chofer ? `${viajeParaAuxilio.chofer.nombre} ${viajeParaAuxilio.chofer.apellido}` : 'Sin chofer'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Trayecto planificado:</span>
                <span className="font-medium text-slate-700 break-words flex-1 min-w-0 text-right">{viajeParaAuxilio.origen} &rarr; {viajeParaAuxilio.destino}</span>
              </div>
            </div>

            <form onSubmit={handleGuardarAuxilio} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Móvil / Chofer que acude al auxilio <span className="text-red-500">*</span>
                </label>
                <select
                  value={choferAuxilioId}
                  onChange={(e) => setChoferAuxilioId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="">-- Seleccionar chofer de relevo --</option>
                  {choferesList
                    .filter((c: any) => c.id !== viajeParaAuxilio.choferId)
                    .map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} {c.apellido} ({c.autoModelo || 'Vehículo'} {c.autoPatente ? `- ${c.autoPatente}` : ''})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Punto de encuentro / Trasbordo
                </label>
                <input
                  type="text"
                  value={puntoTrasbordo}
                  onChange={(e) => setPuntoTrasbordo(e.target.value)}
                  placeholder="Ej: Autopista La Plata Km 24 / Estación YPF Mitre y Av. Belgrano"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Km recorridos por el 1° chofer antes de la falla (aprox.)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={kmChoferInicial}
                  onChange={(e) => setKmChoferInicial(e.target.value)}
                  placeholder="Ej: 14.2"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Sirve para liquidar los kilómetros proporcionales a cada móvil según el tramo realizado.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalAuxilioOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAuxilio || !choferAuxilioId}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {savingAuxilio ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Activando Auxilio...
                    </>
                  ) : (
                    'Confirmar Trasbordo'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: MODIFICAR / ANULAR SINIESTRO (Punto 3) */}
      {isModalSiniestroOpen && viajeParaSiniestro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tipoAccionSiniestro === 'MODIFICAR' ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'}`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {tipoAccionSiniestro === 'MODIFICAR' ? 'Corregir N° de Siniestro' : 'Anular Siniestro / Emiten Nuevo'}
                  </h3>
                  <p className="text-xs text-slate-500">Gestión de inconsistencias enviadas por la ART</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalSiniestroOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setTipoAccionSiniestro('MODIFICAR')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  tipoAccionSiniestro === 'MODIFICAR'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Corregir Tipeo
              </button>
              <button
                type="button"
                onClick={() => setTipoAccionSiniestro('ANULAR')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  tipoAccionSiniestro === 'ANULAR'
                    ? 'bg-white text-rose-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Anular Siniestro
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/70 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Siniestro actual:</span>
                <span className="font-bold text-slate-900 font-mono">{viajeParaSiniestro.numeroSiniestro || 'Sin registrar'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ART:</span>
                <span className="font-semibold text-primary-700">{viajeParaSiniestro.artEmpresa?.nombre || 'ART'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Paciente:</span>
                <span className="font-semibold text-slate-800">{viajeParaSiniestro.clienteNombre || viajeParaSiniestro.nombrePasajero}</span>
              </div>
            </div>

            <form onSubmit={handleGuardarSiniestro} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tipoAccionSiniestro === 'MODIFICAR' ? 'Nuevo Número de Siniestro *' : 'Nuevo Siniestro emitido de reemplazo (opcional)'}
                </label>
                <input
                  type="text"
                  value={nuevoNumeroSiniestro}
                  onChange={(e) => setNuevoNumeroSiniestro(e.target.value)}
                  placeholder="Ej: ART-2025-88421"
                  required={tipoAccionSiniestro === 'MODIFICAR'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-primary-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motivo o justificación de la ART
                </label>
                <input
                  type="text"
                  value={motivoSiniestro}
                  onChange={(e) => setMotivoSiniestro(e.target.value)}
                  placeholder={tipoAccionSiniestro === 'MODIFICAR' ? 'Ej: Error de tipeo en dígito verificador' : 'Ej: Anulado por ART por cambio de prestador o error de emisión'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalSiniestroOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingSiniestro}
                  className={`px-4 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm ${
                    tipoAccionSiniestro === 'MODIFICAR' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {savingSiniestro ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    tipoAccionSiniestro === 'MODIFICAR' ? 'Guardar Corrección' : 'Anular Siniestro'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: COORDINACIÓN CON PASAJERO (Punto 4) */}
      {isModalCoordinacionOpen && viajeParaCoordinacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Coordinación con el Pasajero</h3>
                  <p className="text-xs text-slate-500">Llamada previa de confirmación o rechazo del paciente</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalCoordinacionOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/70 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Paciente:</span>
                <span className="font-semibold text-slate-800">{viajeParaCoordinacion.clienteNombre || viajeParaCoordinacion.nombrePasajero}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Teléfono:</span>
                <span className="font-mono font-semibold text-primary-700">{viajeParaCoordinacion.telefonoPasajero || viajeParaCoordinacion.telefonoCliente || 'No registrado'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recorrido:</span>
                <span className="font-medium text-slate-700 break-words flex-1 min-w-0 text-right">{viajeParaCoordinacion.origen} &rarr; {viajeParaCoordinacion.destino}</span>
              </div>
            </div>

            <form onSubmit={handleGuardarCoordinacion} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Resultado del Contacto <span className="text-red-500">*</span>
                </label>
                <select
                  value={estadoCoordinacionSeleccionado}
                  onChange={(e) => setEstadoCoordinacionSeleccionado(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-primary-500"
                >
                  <option value="PENDIENTE_CONTACTO">🟡 Pendiente de contacto (Aún no se llamó)</option>
                  <option value="CONFIRMADO">🟢 Confirmado (El paciente acepta y espera el móvil)</option>
                  <option value="NO_RESPONDE">🟠 No responde al llamado telefónico</option>
                  <option value="RECHAZADO_POR_PACIENTE">🔴 Rechazado por el paciente (No quiere viajar)</option>
                </select>
              </div>

              {estadoCoordinacionSeleccionado === 'RECHAZADO_POR_PACIENTE' && (
                <div className="space-y-2 p-3 bg-red-50 rounded-xl border border-red-200 animate-in fade-in duration-200">
                  <label className="block text-xs font-semibold text-red-800">
                    Motivo por el cual no desea viajar <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={motivoRechazoPaciente}
                    onChange={(e) => setMotivoRechazoPaciente(e.target.value)}
                    placeholder="Ej: Fue por sus propios medios / Se siente indispuesto / Canceló turno médico"
                    className="w-full px-3 py-2 bg-white border border-red-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-red-400"
                    required
                  />
                  <p className="text-[11px] text-red-700 leading-tight">
                    El viaje pasará a estado <strong>CANCELADO</strong> con causa justificada para que la remisería pueda facturar el intento si corresponde según el convenio con la ART.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observaciones / Notas de la llamada
                </label>
                <textarea
                  value={observacionesCoordinacion}
                  onChange={(e) => setObservacionesCoordinacion(e.target.value)}
                  rows={2}
                  placeholder="Detalles hablados con el paciente o familiar..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalCoordinacionOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCoordinacion}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {savingCoordinacion ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar Coordinación'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: PEAJES DEL VIAJE (Punto 6) */}
      {isModalPeajesOpen && viajeParaPeajes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Peajes Pagados por Chofer</h3>
                  <p className="text-xs text-slate-500">Reembolso al móvil y cargo a la ART</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalPeajesOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/70 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Chofer:</span>
                <span className="font-semibold text-slate-800">
                  {viajeParaPeajes.chofer ? `${viajeParaPeajes.chofer.nombre} ${viajeParaPeajes.chofer.apellido}` : 'Sin chofer'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Paciente:</span>
                <span className="font-semibold text-slate-800">{viajeParaPeajes.clienteNombre || viajeParaPeajes.nombrePasajero}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ART:</span>
                <span className="font-semibold text-primary-700">{viajeParaPeajes.artEmpresa?.nombre || 'ART'}</span>
              </div>
            </div>

            <form onSubmit={handleGuardarPeajes} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Monto Total de Peajes ($) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={montoPeajesInput}
                    onChange={(e) => setMontoPeajesInput(e.target.value)}
                    placeholder="0"
                    required
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Detalle de cabinas / Comprobante
                </label>
                <input
                  type="text"
                  value={observacionesPeajeInput}
                  onChange={(e) => setObservacionesPeajeInput(e.target.value)}
                  placeholder="Ej: Peaje Dock Sud + Hudson ida y vuelta"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Este importe se sumará automáticamente a la <strong>liquidación a pagar al chofer</strong> y a la <strong>facturación final remitida a la ART</strong>.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalPeajesOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPeajes}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {savingPeajes ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar Peajes'
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
