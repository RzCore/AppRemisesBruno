'use client';

import React from 'react';
import { getArtColorClasses } from '@/lib/artColorUtils';
import { DollarSign, FileText, Car, User, RefreshCw, Phone, MapPin, X } from 'lucide-react';

export default function ArtPortalDetailModals(props: Record<string, any>) {
  const {
    artList,
    portalModalArt,
    setPortalModalArt,
    portalConfigForm,
    setPortalConfigForm,
    savingPortalConfig,
    sincronizandoPortal,
    handleGuardarPortalConfig,
    handleSincronizarPortalAhora,
    viajeDetalleModal,
    setViajeDetalleModal,
  } = props;

  return (
    <>
      {/* MODAL: SINCRONIZACIÓN AUTOMÁTICA CON PORTAL FELEVAL */}
      {portalModalArt && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Sincronización Portal {portalConfigForm.portalExternoTipo === 'SIMAR2' ? 'SIMAR2' : 'Feleval'}
                  </h3>
                  <p className="text-xs text-slate-500">{portalModalArt.nombre} • Automática diaria a las 23:59 hs</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPortalModalArt(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarPortalConfig} className="p-6 space-y-4">
              {portalModalArt.portalExternoUltimoEstado && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    portalModalArt.portalExternoUltimoEstado === 'OK'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  <div className="font-bold">
                    {portalModalArt.portalExternoUltimoEstado === 'OK'
                      ? 'Última sincronización exitosa'
                      : portalModalArt.portalExternoUltimoEstado === 'ERROR_CLAVE'
                      ? '⚠️ Clave vencida o incorrecta (alerta enviada por email)'
                      : 'Error de conexión'}
                  </div>
                  {portalModalArt.portalExternoUltimoMensaje && (
                    <p className="text-[11px] mt-0.5">{portalModalArt.portalExternoUltimoMensaje}</p>
                  )}
                  {portalModalArt.portalExternoUltimaSync && (
                    <p className="text-[10px] opacity-75 mt-1">
                      {new Date(portalModalArt.portalExternoUltimaSync).toLocaleString('es-AR')}
                    </p>
                  )}
                </div>
              )}

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Activar sincronización diaria (23:59 hs)</span>
                  <span className="text-[11px] text-slate-500">Importa los viajes pendientes sin duplicarlos.</span>
                </div>
                <input
                  type="checkbox"
                  checked={portalConfigForm.portalExternoActivo}
                  onChange={(e) =>
                    setPortalConfigForm((prev: any) => ({ ...prev, portalExternoActivo: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Sistema / Portal externo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPortalConfigForm((prev: any) => ({
                        ...prev,
                        portalExternoTipo: 'FELEVAL',
                        portalExternoUrl: 'https://app.feleval.com.ar'
                      }))
                    }
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      portalConfigForm.portalExternoTipo === 'FELEVAL'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Feleval
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPortalConfigForm((prev: any) => ({
                        ...prev,
                        portalExternoTipo: 'SIMAR2',
                        portalExternoUrl: 'https://simar2.com.ar/nacion/prestadores'
                      }))
                    }
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      portalConfigForm.portalExternoTipo === 'SIMAR2'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    SIMAR2 (Central Nación)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {portalConfigForm.portalExternoTipo === 'SIMAR2'
                    ? 'Usuario / CUIT de acceso a SIMAR2'
                    : 'Email de acceso a Feleval'}
                </label>
                <input
                  type={portalConfigForm.portalExternoTipo === 'SIMAR2' ? 'text' : 'email'}
                  required
                  placeholder={
                    portalConfigForm.portalExternoTipo === 'SIMAR2'
                      ? '20369969464'
                      : 'usuario@ejemplo.com'
                  }
                  value={portalConfigForm.portalExternoEmail}
                  onChange={(e) =>
                    setPortalConfigForm((prev: any) => ({ ...prev, portalExternoEmail: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Contraseña del portal
                </label>
                <input
                  type="password"
                  placeholder="Dejar vacío para mantener la contraseña guardada"
                  value={portalConfigForm.portalExternoPassword}
                  onChange={(e) =>
                    setPortalConfigForm((prev: any) => ({ ...prev, portalExternoPassword: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Se guarda cifrada en el servidor. Si cambia la clave del portal, actualizala acá.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email de alerta si vence la contraseña
                </label>
                <input
                  type="email"
                  required
                  placeholder="rizzofs@gmail.com"
                  value={portalConfigForm.portalExternoEmailAlerta}
                  onChange={(e) =>
                    setPortalConfigForm((prev: any) => ({ ...prev, portalExternoEmailAlerta: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={sincronizandoPortal || savingPortalConfig}
                  onClick={handleSincronizarPortalAhora}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${sincronizandoPortal ? 'animate-spin' : ''}`} />
                  {sincronizandoPortal ? 'Sincronizando...' : 'Sincronizar ahora'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPortalModalArt(null)}
                    className="px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    disabled={savingPortalConfig}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs"
                  >
                    {savingPortalConfig ? 'Guardando...' : 'Guardar Config'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DETALLE COMPLETO DE VIAJE ART (IMPORTES Y DATOS) */}
      {viajeDetalleModal && (() => {
        const v = viajeDetalleModal;
        const artObj = v.artEmpresa || artList.find((a: any) => a.id === v.artEmpresaId);
        const artColors = getArtColorClasses(artObj?.nombre, v.artEmpresaId);
        const peajes = Number(v.montoPeajes || 0);
        const esperaMin = Math.round(Number(v.tiempoEsperaSegundos || 0) / 60);
        const km = Number(v.distanciaKmConPasajero || 0);
        const precioArtBase = Number(v.precioFacturaArt ?? v.precioArt ?? 0);
        const precioChoferBase = Number(v.pagaChofer ?? v.precio ?? 0);
        const totalFacturaArt = precioArtBase + peajes;
        const totalPagaChofer = precioChoferBase + peajes;
        const gananciaNeta =
          v.gananciaNeta !== undefined && v.gananciaNeta !== null
            ? Number(v.gananciaNeta)
            : Math.max(0, totalFacturaArt - totalPagaChofer);
        const obsStr = String(v.observaciones || '');
        const esLocal = obsStr.includes('[LOCAL]');
        const desdeBase = obsStr.includes('DESDE BASE');
        const origenSistema = v.externoId?.startsWith('FELEVAL:')
          ? 'Importado de Feleval'
          : v.externoId?.startsWith('SIMAR2:')
          ? 'Importado de SIMAR2'
          : 'Carga manual';
        const pasajeroNombre =
          v.clienteNombre ||
          `${v.cliente?.nombre || ''} ${v.cliente?.apellido || ''}`.trim() ||
          'Sin nombre';
        const pasajeroTel = v.clienteTelefono || v.cliente?.telefono || '';
        const choferNombre = v.chofer
          ? `${v.chofer.nombre || ''} ${v.chofer.apellido || ''}`.trim() +
            (v.chofer.numeroChofer ? ` (#${v.chofer.numeroChofer})` : '')
          : '';

        return (
          <div
            className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
            onClick={() => setViajeDetalleModal(null)}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border font-bold text-xs ${artColors.badge}`}>
                      <span className={`w-2 h-2 rounded-full ${artColors.dot}`} />
                      ART - {artObj?.nombre || 'Sin asignar'}
                    </span>
                    {v.numeroSiniestro && (
                      <span className={`px-2 py-0.5 rounded-md border text-xs font-mono font-bold ${artColors.siniestro}`}>
                        Sin: {v.numeroSiniestro}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                      v.estado === 'COMPLETADO' || v.estado === 'FINALIZADO'
                        ? 'bg-emerald-100 text-emerald-800'
                        : v.estado === 'CANCELADO'
                        ? 'bg-rose-100 text-rose-800'
                        : v.estado === 'ACEPTADO' || v.estado === 'EN_CAMINO' || v.estado === 'EN_CURSO'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {v.estado || 'PENDIENTE'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                      {origenSistema}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Detalle del Viaje ART
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setViajeDetalleModal(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs sm:text-sm">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Fecha</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">
                      {v.fecha ? new Date(v.fecha).toLocaleDateString('es-AR') : '-'}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Hora Turno</span>
                    <span className="font-bold text-indigo-700 mt-0.5 block">
                      {v.horaTurno || (v.fecha ? new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-')} hs
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Hora Salida</span>
                    <span className="font-bold text-amber-700 mt-0.5 block">
                      {v.horaSalidaChofer ? `${v.horaSalidaChofer} hs` : 'Sin definir'}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Modalidad / Km</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">
                      {esLocal ? 'Local (Fijo)' : desdeBase ? 'Por Km (Base)' : 'Por Km'}
                      {km > 0 ? ` • ${km} km` : ''}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4" /> Importes Cargados
                    </span>
                    {artObj && (
                      <span className="text-[11px] text-emerald-700 font-medium">
                        Tarifa {artObj.nombre}: ${Number(artObj.valorKm || 0).toLocaleString('es-AR')}/km • Local ${Number(artObj.precioTramo || 0).toLocaleString('es-AR')}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-xl bg-white border border-emerald-200/70">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Facturar a ART</span>
                      <span className="text-lg font-black text-emerald-700 block mt-0.5">
                        {totalFacturaArt > 0 ? `$${totalFacturaArt.toLocaleString('es-AR')}` : 'A calcular'}
                      </span>
                      {peajes > 0 && (
                        <span className="text-[10px] text-slate-500">Incluye ${peajes.toLocaleString('es-AR')} de peajes</span>
                      )}
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-slate-200/70">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Paga al Chofer</span>
                      <span className="text-lg font-black text-slate-900 block mt-0.5">
                        {totalPagaChofer > 0 ? `$${totalPagaChofer.toLocaleString('es-AR')}` : 'A calcular'}
                      </span>
                      {esperaMin > 0 && (
                        <span className="text-[10px] text-slate-500">Espera registrada: {esperaMin} min</span>
                      )}
                    </div>
                    <div className="p-3 rounded-xl bg-white border border-slate-200/70">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Ganancia Agencia</span>
                      <span className="text-lg font-black text-indigo-700 block mt-0.5">
                        {totalFacturaArt > 0 ? `$${gananciaNeta.toLocaleString('es-AR')}` : '-'}
                      </span>
                      {totalFacturaArt === 0 && (
                        <span className="text-[10px] text-amber-700">Se calcula al cargar/finalizar km</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                      <User className="w-3.5 h-3.5" /> Pasajero
                    </span>
                    <p className="font-bold text-slate-900">{pasajeroNombre}</p>
                    {pasajeroTel ? (
                      <a
                        href={`tel:${pasajeroTel}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline"
                      >
                        <Phone className="w-3.5 h-3.5" /> {pasajeroTel}
                      </a>
                    ) : (
                      <p className="text-xs text-slate-400">Sin teléfono registrado</p>
                    )}
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                      <Car className="w-3.5 h-3.5" /> Chofer Asignado
                    </span>
                    {choferNombre ? (
                      <>
                        <p className="font-bold text-slate-900">{choferNombre}</p>
                        {v.vehiculo && (
                          <p className="text-xs text-slate-500">
                            {v.vehiculo.patente} • {v.vehiculo.marca} {v.vehiculo.modelo}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs font-semibold text-amber-700">Sin chofer asignado todavía</p>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> Recorrido
                  </span>
                  <div className="space-y-1.5 text-xs sm:text-sm">
                    <div className="break-words">
                      <span className="font-bold text-emerald-700">Origen: </span>
                      <span className="text-slate-800">{v.origen || 'A confirmar'}</span>
                    </div>
                    <div className="break-words">
                      <span className="font-bold text-indigo-700">Destino: </span>
                      <span className="text-slate-800">{v.destino || 'A confirmar'}</span>
                    </div>
                  </div>
                </div>

                {obsStr && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" /> Observaciones y Datos del Portal
                    </span>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                      {obsStr}
                    </p>
                  </div>
                )}
              </div>

              <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setViajeDetalleModal(null)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
