'use client';

import React from 'react';
import { Briefcase, DollarSign, Car, Calendar } from 'lucide-react';

export default function ArtConfigModals(props: Record<string, any>) {
  const {
    isModalOpen,
    setIsModalOpen,
    editingArt,
    savingArt,
    formData,
    setFormData,
    remiseriaNombre,
    handleGuardarArt,
    modalViajeArtOpen,
    setModalViajeArtOpen,
    viajeSeleccionado,
    nuevoArtIdViaje,
    setNuevoArtIdViaje,
    artList,
    nuevoSiniestroViaje,
    setNuevoSiniestroViaje,
    recalcularTarifaViaje,
    setRecalcularTarifaViaje,
    guardandoViajeArt,
    guardarCambioViajeArt,
  } = props;

  return (
    <>
      {/* ============================================================== */}
      {/* MODAL CREAR / EDITAR ART                                       */}
      {/* ============================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Encabezado del Modal */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center font-bold">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingArt ? `Editar ART: ${editingArt.nombre}` : 'Nueva ART'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Fijá los precios especiales de kilómetro, tramo local y hora de espera.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleGuardarArt} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Datos Generales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nombre de la ART *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Provincia ART, La Segunda ART, Prevención ART"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    CUIT de Facturación
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 30-70809012-4"
                    value={formData.cuit || ''}
                    onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Razón Social
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Provincia ART S.A."
                    value={formData.razonSocial || ''}
                    onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Teléfono Contacto / Autorizaciones
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 0800-333-1234"
                    value={formData.telefono || ''}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Email para Facturas
                  </label>
                  <input
                    type="email"
                    placeholder="facturacion@art.com.ar"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* SECCIÓN CRÍTICA DE TARIFAS SOLICITADAS POR EL USUARIO */}
              <div className="p-4 rounded-2xl bg-primary-50/50 border border-primary-100 space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-primary-800">
                    Tarifas Acordadas con esta ART
                  </span>
                </div>
                <p className="text-xs text-primary-600">
                  Precios que se usarán automáticamente para cotizar y facturar los viajes de esta ART en {remiseriaNombre}.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {/* Precio por Tramo (Viajes Locales) */}
                  <div className="bg-white p-3 rounded-xl border border-primary-200 shadow-xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Precio Tramo Local ($) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        required
                        placeholder="0"
                        value={formData.precioTramo || ''}
                        onChange={(e) => setFormData({ ...formData, precioTramo: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">Tarifa fija para viajes locales (sin importar distancia)</span>
                  </div>

                  {/* Precio por Kilómetro */}
                  <div className="bg-white p-3 rounded-xl border border-primary-200 shadow-xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Precio por Km ($/km) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        required
                        placeholder="0"
                        value={formData.valorKm || ''}
                        onChange={(e) => setFormData({ ...formData, valorKm: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-primary-700 focus:bg-white focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">Por cada km adicional</span>
                  </div>

                  {/* Precio Hora de Espera */}
                  <div className="bg-white p-3 rounded-xl border border-primary-200 shadow-xs">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Hora de Espera ($/h) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        required
                        placeholder="0"
                        value={formData.valorHoraEspera || ''}
                        onChange={(e) => setFormData({ ...formData, valorHoraEspera: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-amber-700 focus:bg-white focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">Espera en clínica / turno</span>
                  </div>
                </div>
              </div>

              {/* SECCIÓN DE TARIFA PAGADA AL CHOFER (CONFIDENCIAL) */}
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-amber-700" />
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                      Tarifa Pagada al Chofer (Liquidación del Móvil)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                    Confidencial
                  </span>
                </div>
                <p className="text-xs text-amber-800">
                  Bajo ningún punto de vista el chofer o coordinador conocerá el precio pactado con la ART. Seleccioná cómo se le liquida al chofer:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      formData.pagaChoferTipo === 'LISTA_NORMAL'
                        ? 'border-amber-500 bg-white shadow-xs'
                        : 'border-amber-200/60 bg-amber-50/40 hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pagaChoferTipo"
                      value="LISTA_NORMAL"
                      checked={formData.pagaChoferTipo === 'LISTA_NORMAL'}
                      onChange={() => setFormData({ ...formData, pagaChoferTipo: 'LISTA_NORMAL' })}
                      className="mt-0.5 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Lista Normal de la Remisería</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        El chofer cobra la bajada de bandera y precio por km normal de {remiseriaNombre}.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      formData.pagaChoferTipo === 'PERSONALIZADO'
                        ? 'border-amber-500 bg-white shadow-xs'
                        : 'border-amber-200/60 bg-amber-50/40 hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pagaChoferTipo"
                      value="PERSONALIZADO"
                      checked={formData.pagaChoferTipo === 'PERSONALIZADO'}
                      onChange={() => setFormData({ ...formData, pagaChoferTipo: 'PERSONALIZADO' })}
                      className="mt-0.5 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Tarifa Especial para Chofer</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        Fijar precios específicos a liquidar al chofer para los viajes de esta ART.
                      </span>
                    </div>
                  </label>
                </div>

                {formData.pagaChoferTipo === 'PERSONALIZADO' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                    <div className="bg-white p-2.5 rounded-xl border border-amber-300">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                        Tramo Chofer ($)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={formData.choferPrecioTramo || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, choferPrecioTramo: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-slate-900"
                      />
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-amber-300">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                        Por Km Chofer ($/km)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={formData.choferValorKm || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, choferValorKm: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-slate-900"
                      />
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-amber-300">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                        Espera Chofer ($/h)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={formData.choferValorHoraEspera || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, choferValorHoraEspera: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* CICLO DE FACTURACIÓN DE LA ART */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                    Ciclo de Cierre y Facturación de la ART
                  </span>
                </div>
                <p className="text-xs text-indigo-700">
                  Configurá la periodicidad con la que esta aseguradora exige el envío de la facturación y cierre de cuenta.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Frecuencia de Cierre *
                    </label>
                    <select
                      value={formData.periodoFacturacion || 'MENSUAL'}
                      onChange={(e) => setFormData({ ...formData, periodoFacturacion: e.target.value as any })}
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="SEMANAL">Semanal (Cierre cada 7 días)</option>
                      <option value="QUINCENAL">Quincenal (Día 1 al 15 y 16 a fin de mes)</option>
                      <option value="MENSUAL">Mensual (Mes calendario completo)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Día de Corte / Vencimiento
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formData.diaCorteFacturacion ?? 1}
                      onChange={(e) => setFormData({ ...formData, diaCorteFacturacion: parseInt(e.target.value) || 1 })}
                      placeholder="Ej: 1 o 15"
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">
                      Día del mes o semana en que se genera la liquidación
                    </span>
                  </div>
                </div>
              </div>

              {/* Observaciones y Estado */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Notas de Facturación u Observaciones
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej. Exige número de bono o autorización en cada viaje. Facturación del 1 al 5."
                  value={formData.observaciones || ''}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="artActivo"
                  checked={formData.activo}
                  onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                  className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 border-slate-300"
                />
                <label htmlFor="artActivo" className="text-sm font-semibold text-slate-800 cursor-pointer">
                  ART activa para asignación de viajes
                </label>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingArt}
                  className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold shadow-sm shadow-primary-200 transition-colors disabled:opacity-50"
                >
                  {savingArt ? 'Guardando...' : editingArt ? 'Guardar Cambios' : 'Registrar ART'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL REASIGNAR ART O SINIESTRO A VIAJE                        */}
      {/* ============================================================== */}
      {modalViajeArtOpen && viajeSeleccionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Asignar ART o Siniestro al Viaje</h3>
            <p className="text-xs text-slate-500">
              Modificá la cuenta o número de siniestro del viaje de{' '}
              <span className="font-semibold text-slate-800">
                {viajeSeleccionado.clienteNombre || 'Pasajero'}
              </span>
              .
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ART
                </label>
                <select
                  value={nuevoArtIdViaje}
                  onChange={(e) => setNuevoArtIdViaje(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white"
                >
                  <option value="">Sin ART (Viaje Particular Normal)</option>
                  {artList.map((art: any) => (
                    <option key={art.id} value={art.id}>
                      {art.nombre} (Tramo: ${art.precioTramo} - Km: ${art.valorKm})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  N° de Siniestro o Autorización
                </label>
                <input
                  type="text"
                  placeholder="Ej. SIN-98234-A"
                  value={nuevoSiniestroViaje}
                  onChange={(e) => setNuevoSiniestroViaje(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white"
                />
              </div>

              {nuevoArtIdViaje && (
                <div className="flex items-center gap-2 p-3 bg-primary-50 rounded-xl">
                  <input
                    type="checkbox"
                    id="recalcTarifa"
                    checked={recalcularTarifaViaje}
                    onChange={(e) => setRecalcularTarifaViaje(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-600"
                  />
                  <label htmlFor="recalcTarifa" className="text-xs font-medium text-primary-900 cursor-pointer">
                    Recalcular precio del viaje usando las tarifas de la ART seleccionada
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setModalViajeArtOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={guardarCambioViajeArt}
                disabled={guardandoViajeArt}
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {guardandoViajeArt ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
