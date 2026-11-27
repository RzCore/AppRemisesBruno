'use client';

import React from 'react';
import { Car, Navigation, MapPin, CheckCircle, X } from 'lucide-react';

export default function ArtNuevoViajeModal(props: Record<string, any>) {
  const {
    artList,
    choferesList,
    isModalNuevoViajeArtOpen,
    setIsModalNuevoViajeArtOpen,
    pasoNuevoViajeArt,
    setPasoNuevoViajeArt,
    creandoViajeArt,
    calculandoRutaArt,
    artOrigenSuggestions,
    setArtOrigenSuggestions,
    artDestinoSuggestions,
    setArtDestinoSuggestions,
    setIsArtOrigenSelected,
    setIsArtDestinoSelected,
    buscandoArtOrigen,
    buscandoArtDestino,
    setArtOrigenCoords,
    setArtDestinoCoords,
    pasajeroSuggestionsArt,
    pasajeroSeleccionadoArt,
    setPasajeroSeleccionadoArt,
    nuevoViajeArtForm,
    setNuevoViajeArtForm,
    calcularPreciosLocalArt,
    handleSeleccionarPasajeroArt,
    handleSiguientePasoViajeArt,
    handleCalcularRutaNuevoViajeArt,
    handleCrearViajeArtSubmit,
  } = props;

  if (!isModalNuevoViajeArtOpen) return null;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white px-6 py-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Crear y Asignar Viaje ART</h3>
                <p className="text-xs text-slate-500">Paso {pasoNuevoViajeArt} de 3</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsModalNuevoViajeArtOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              { n: 1 as const, label: '1. ART y Pasajero' },
              { n: 2 as const, label: '2. Recorrido y Horario' },
              { n: 3 as const, label: '3. Tarifa y Confirmar' }
            ]).map((step) => (
              <button
                key={step.n}
                type="button"
                onClick={() => {
                  if (step.n < pasoNuevoViajeArt) setPasoNuevoViajeArt(step.n);
                }}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold text-center border transition-all ${
                  pasoNuevoViajeArt === step.n
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : pasoNuevoViajeArt > step.n
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-pointer'
                    : 'bg-slate-50 text-slate-400 border-slate-200 cursor-default'
                }`}
              >
                {step.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleCrearViajeArtSubmit} className="p-6 space-y-5">
          {pasoNuevoViajeArt === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ART *</label>
                  <select
                    required
                    value={nuevoViajeArtForm.artEmpresaId}
                    onChange={(e) => {
                      const artId = e.target.value;
                      const precios = calcularPreciosLocalArt(artId, nuevoViajeArtForm.esViajeLocal, nuevoViajeArtForm.distanciaKm);
                      setNuevoViajeArtForm((prev: any) => ({
                        ...prev,
                        artEmpresaId: artId,
                        precioArt: precios.precioArt,
                        precio: precios.precioChofer
                      }));
                    }}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Seleccionar ART --</option>
                    {artList.filter((a: any) => a.activo).map((art: any) => (
                      <option key={art.id} value={art.id}>
                        {art.nombre} (Local: ${art.precioTramo} | Km: ${art.valorKm})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Chofer Asignado *</label>
                  <select
                    required
                    value={nuevoViajeArtForm.choferId}
                    onChange={(e) => setNuevoViajeArtForm((prev: any) => ({ ...prev, choferId: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Seleccionar Chofer --</option>
                    {choferesList.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} {c.apellido} (#{c.numeroChofer}) {c.vehiculo?.patente ? `• ${c.vehiculo.patente}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pasajero / Paciente *</label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="Nombre y Apellido"
                    value={nuevoViajeArtForm.clienteNombre}
                    onChange={(e) => {
                      setPasajeroSeleccionadoArt(null);
                      setNuevoViajeArtForm((prev: any) => ({ ...prev, clienteNombre: e.target.value }));
                    }}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-800"
                  />
                  {pasajeroSuggestionsArt.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 sm:w-80 mt-1 bg-white border border-emerald-200 rounded-xl shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
                      <div className="px-3 py-1.5 bg-emerald-50 text-[10px] font-bold text-emerald-800 uppercase">
                        Pasajeros frecuentes encontrados
                      </div>
                      {pasajeroSuggestionsArt.map((c: any) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSeleccionarPasajeroArt(c)}
                          className="w-full text-left px-3 py-2 hover:bg-emerald-50/70 transition-colors"
                        >
                          <div className="text-xs font-bold text-slate-900">
                            {c.nombre} {c.apellido}
                            {c.telefono && !String(c.telefono).startsWith('S/T-') && (
                              <span className="font-normal text-slate-500 ml-1.5">• {c.telefono}</span>
                            )}
                          </div>
                          {(c.origenesHabituales?.[0] || c.destinosHabituales?.[0]) && (
                            <div className="text-[10px] text-slate-500 truncate mt-0.5">
                              {c.origenesHabituales?.[0] || c.direccion || 'Sin origen'} → {c.destinosHabituales?.[0] || 'Sin destino'}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej: 2346..."
                    value={nuevoViajeArtForm.clienteTelefono}
                    onChange={(e) => {
                      setPasajeroSeleccionadoArt(null);
                      setNuevoViajeArtForm((prev: any) => ({ ...prev, clienteTelefono: e.target.value }));
                    }}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">N° Siniestro / Bono</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={nuevoViajeArtForm.numeroSiniestro}
                    onChange={(e) => setNuevoViajeArtForm((prev: any) => ({ ...prev, numeroSiniestro: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-800"
                  />
                </div>
              </div>
            </div>
          )}

          {pasoNuevoViajeArt === 2 && (
            <div className="space-y-4">
              {pasajeroSeleccionadoArt && (pasajeroSeleccionadoArt.origenesHabituales?.length > 0 || pasajeroSeleccionadoArt.destinosHabituales?.length > 0) && (
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                    Direcciones habituales de {pasajeroSeleccionadoArt.nombre}
                  </span>
                  {pasajeroSeleccionadoArt.origenesHabituales?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-500">Orígenes:</span>
                      {pasajeroSeleccionadoArt.origenesHabituales.slice(0, 3).map((dir: string, i: number) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setNuevoViajeArtForm((prev: any) => ({ ...prev, origen: dir }));
                            setIsArtOrigenSelected(true);
                            setArtOrigenCoords(null);
                          }}
                          className="px-2 py-0.5 rounded-lg bg-white border border-emerald-200 hover:bg-emerald-100 text-[10px] font-semibold text-slate-700 truncate max-w-[200px]"
                          title={dir}
                        >
                          {dir}
                        </button>
                      ))}
                    </div>
                  )}
                  {pasajeroSeleccionadoArt.destinosHabituales?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-500">Destinos:</span>
                      {pasajeroSeleccionadoArt.destinosHabituales.slice(0, 3).map((dir: string, i: number) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setNuevoViajeArtForm((prev: any) => ({ ...prev, destino: dir }));
                            setIsArtDestinoSelected(true);
                            setArtDestinoCoords(null);
                          }}
                          className="px-2 py-0.5 rounded-lg bg-white border border-indigo-200 hover:bg-indigo-100 text-[10px] font-semibold text-slate-700 truncate max-w-[200px]"
                          title={dir}
                        >
                          {dir}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Origen *</label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="Escribí dirección y localidad de origen..."
                    value={nuevoViajeArtForm.origen}
                    onChange={(e) => {
                      setIsArtOrigenSelected(false);
                      setArtOrigenCoords(null);
                      setNuevoViajeArtForm((prev: any) => ({ ...prev, origen: e.target.value }));
                    }}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
                  />
                  {buscandoArtOrigen && (
                    <span className="text-[10px] text-slate-400 mt-1 block">Buscando direcciones...</span>
                  )}
                  {artOrigenSuggestions.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {artOrigenSuggestions.map((sug: any, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setNuevoViajeArtForm((prev: any) => ({ ...prev, origen: sug.display_name || sug.label || prev.origen }));
                            setIsArtOrigenSelected(true);
                            setArtOrigenSuggestions([]);
                            if (sug.lat && sug.lon) {
                              setArtOrigenCoords({ lat: parseFloat(sug.lat), lon: parseFloat(sug.lon) });
                            }
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-[11px] text-slate-700 flex items-start gap-2 transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{sug.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Destino *</label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="Escribí dirección y localidad de destino..."
                    value={nuevoViajeArtForm.destino}
                    onChange={(e) => {
                      setIsArtDestinoSelected(false);
                      setArtDestinoCoords(null);
                      setNuevoViajeArtForm((prev: any) => ({ ...prev, destino: e.target.value }));
                    }}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
                  />
                  {buscandoArtDestino && (
                    <span className="text-[10px] text-slate-400 mt-1 block">Buscando direcciones...</span>
                  )}
                  {artDestinoSuggestions.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {artDestinoSuggestions.map((sug: any, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setNuevoViajeArtForm((prev: any) => ({ ...prev, destino: sug.display_name || sug.label || prev.destino }));
                            setIsArtDestinoSelected(true);
                            setArtDestinoSuggestions([]);
                            if (sug.lat && sug.lon) {
                              setArtDestinoCoords({ lat: parseFloat(sug.lat), lon: parseFloat(sug.lon) });
                            }
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-[11px] text-slate-700 flex items-start gap-2 transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{sug.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={nuevoViajeArtForm.fecha}
                    onChange={(e) => setNuevoViajeArtForm((prev: any) => ({ ...prev, fecha: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hora Salida Chofer *</label>
                  <input
                    type="time"
                    required
                    value={nuevoViajeArtForm.horaSalidaChofer}
                    onChange={(e) => setNuevoViajeArtForm((prev: any) => ({ ...prev, horaSalidaChofer: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hora Turno Médico</label>
                  <input
                    type="time"
                    value={nuevoViajeArtForm.horaTurno}
                    onChange={(e) => setNuevoViajeArtForm((prev: any) => ({ ...prev, horaTurno: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-800"
                  />
                </div>
              </div>
            </div>
          )}

          {pasoNuevoViajeArt === 3 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 uppercase">Tipo de Viaje y Tarifa</span>
                  <button
                    type="button"
                    disabled={calculandoRutaArt || !nuevoViajeArtForm.origen.trim() || !nuevoViajeArtForm.destino.trim()}
                    onClick={() => handleCalcularRutaNuevoViajeArt()}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-[11px] font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    {calculandoRutaArt ? 'Calculando...' : 'Calcular distancia y precios'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const precios = calcularPreciosLocalArt(nuevoViajeArtForm.artEmpresaId, true, nuevoViajeArtForm.distanciaKm);
                      setNuevoViajeArtForm((prev: any) => ({
                        ...prev,
                        esViajeLocal: true,
                        cobrarDesdeBase: false,
                        precioArt: precios.precioArt,
                        precio: precios.precioChofer
                      }));
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      nuevoViajeArtForm.esViajeLocal
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    Viaje Local (Tarifa fija)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const precios = calcularPreciosLocalArt(nuevoViajeArtForm.artEmpresaId, false, nuevoViajeArtForm.distanciaKm);
                      setNuevoViajeArtForm((prev: any) => ({
                        ...prev,
                        esViajeLocal: false,
                        precioArt: precios.precioArt,
                        precio: precios.precioChofer
                      }));
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                      !nuevoViajeArtForm.esViajeLocal
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    Por Km (No local)
                  </button>
                </div>

                {!nuevoViajeArtForm.esViajeLocal && (
                  <label className="flex items-start gap-2 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={nuevoViajeArtForm.cobrarDesdeBase}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setNuevoViajeArtForm((prev: any) => ({ ...prev, cobrarDesdeBase: checked }));
                        if (nuevoViajeArtForm.origen.trim() && nuevoViajeArtForm.destino.trim()) {
                          handleCalcularRutaNuevoViajeArt({ cobrarDesdeBase: checked, esViajeLocal: false });
                        }
                      }}
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-[11px] text-slate-700 leading-tight">
                      <strong className="text-slate-900">Cobrar desde la base hasta el destino</strong>
                      <span className="block text-[10px] text-slate-500">
                        Para cuando el móvil debe salir a buscar al pasajero a otra localidad.
                      </span>
                    </span>
                  </label>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Distancia (km)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={nuevoViajeArtForm.distanciaKm || ''}
                      onChange={(e) => {
                        const km = parseFloat(e.target.value) || 0;
                        const precios = calcularPreciosLocalArt(nuevoViajeArtForm.artEmpresaId, nuevoViajeArtForm.esViajeLocal, km);
                        setNuevoViajeArtForm((prev: any) => ({
                          ...prev,
                          distanciaKm: km,
                          precioArt: precios.precioArt,
                          precio: precios.precioChofer
                        }));
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-700 mb-1">Factura a ART ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={nuevoViajeArtForm.precioArt || ''}
                      onChange={(e) => setNuevoViajeArtForm((prev: any) => ({ ...prev, precioArt: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-blue-700 mb-1">Pago al Chofer ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={nuevoViajeArtForm.precio || ''}
                      onChange={(e) => setNuevoViajeArtForm((prev: any) => ({ ...prev, precio: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-blue-300 rounded-xl text-xs font-bold text-blue-800 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  placeholder="Indicaciones para el chofer, piso/consultorio, espera, etc."
                  value={nuevoViajeArtForm.observaciones}
                  onChange={(e) => setNuevoViajeArtForm((prev: any) => ({ ...prev, observaciones: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                if (pasoNuevoViajeArt === 1) {
                  setIsModalNuevoViajeArtOpen(false);
                } else {
                  setPasoNuevoViajeArt((prev: any) => (prev === 3 ? 2 : 1));
                }
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              {pasoNuevoViajeArt === 1 ? 'Cancelar' : '← Anterior'}
            </button>

            {pasoNuevoViajeArt < 3 ? (
              <button
                type="button"
                onClick={handleSiguientePasoViajeArt}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                Siguiente →
              </button>
            ) : (
              <button
                type="submit"
                disabled={creandoViajeArt}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                {creandoViajeArt ? 'Creando viaje...' : 'Crear y Asignar al Chofer'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
