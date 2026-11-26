import test from 'node:test';
import assert from 'node:assert/strict';
import {
  redondearPrecioMultiplo100,
  redondearKmArt,
  calcularDistanciaHaversineKm,
} from '../src/lib/pricingUtils';
import { requireRoles } from '../src/middleware/auth';
import {
  calcularLiquidacionViajes,
  calcularBaseLiquidacionViaje,
} from '../src/controllers/liquidacionController';

test('redondearPrecioMultiplo100 redondea viajes normales al múltiplo de 100 más cercano', () => {
  assert.equal(redondearPrecioMultiplo100(10450), 10500);
  assert.equal(redondearPrecioMultiplo100(10449), 10400);
  assert.equal(redondearPrecioMultiplo100(3500), 3500);
  assert.equal(redondearPrecioMultiplo100(3520), 3500);
  assert.equal(redondearPrecioMultiplo100(3560), 3600);
  assert.equal(redondearPrecioMultiplo100(0), 0);
  assert.equal(redondearPrecioMultiplo100(-500), 0);
  assert.equal(redondearPrecioMultiplo100(Number.NaN), 0);
});

test('redondearKmArt redondea > 0.5 hacia arriba y <= 0.5 hacia abajo', () => {
  assert.equal(redondearKmArt(183.7), 184);
  assert.equal(redondearKmArt(183.51), 184);
  assert.equal(redondearKmArt(183.5), 183);
  assert.equal(redondearKmArt(183.4), 183);
  assert.equal(redondearKmArt(183.0), 183);
  assert.equal(redondearKmArt(0), 0);
  assert.equal(redondearKmArt(-10), 0);
  assert.equal(redondearKmArt(Number.NaN), 0);
});

test('calcularDistanciaHaversineKm calcula distancias coherentes en Chivilcoy', () => {
  // Mismo punto => 0 km
  assert.equal(calcularDistanciaHaversineKm(-34.9011, -60.0138, -34.9011, -60.0138), 0);
  // Agencia (Av. Sarmiento 271) -> UNLu Chivilcoy (~2.6 km en línea recta)
  const dist = calcularDistanciaHaversineKm(-34.9011383, -60.0137782, -34.9189524, -59.99465);
  assert.ok(dist > 2.0 && dist < 3.5, `Distancia esperada entre 2 y 3.5 km, fue ${dist}`);
});

test('requireRoles bloquea solicitudes sin usuario (401) y roles no autorizados (403)', () => {
  const middleware = requireRoles('DUENIO', 'COORDINADOR');

  const createMockRes = () => {
    let statusCode = 200;
    let payload: any = null;
    return {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        payload = body;
        return this;
      },
      getStatus: () => statusCode,
      getPayload: () => payload,
    };
  };

  // 1) Sin usuario -> 401
  let nextCalled = false;
  const res401 = createMockRes();
  middleware({} as any, res401 as any, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res401.getStatus(), 401);

  // 2) Rol CLIENTE intentando entrar -> 403
  nextCalled = false;
  const res403Cliente = createMockRes();
  middleware({ user: { id: 'u1', rol: 'CLIENTE' } } as any, res403Cliente as any, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res403Cliente.getStatus(), 403);

  // 3) Rol CHOFER intentando entrar -> 403
  nextCalled = false;
  const res403Chofer = createMockRes();
  middleware({ user: { id: 'u2', rol: 'CHOFER' } } as any, res403Chofer as any, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res403Chofer.getStatus(), 403);

  // 4) Rol DUENIO permitido -> next()
  nextCalled = false;
  const resOk = createMockRes();
  middleware({ user: { id: 'u3', rol: 'DUENIO' } } as any, resOk as any, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(resOk.getStatus(), 200);
});

test('calcularLiquidacionViajes calcula correctamente propietario (corta 20% / larga 15%)', () => {
  const res = calcularLiquidacionViajes(
    [
      { precio: 10000, metodoPago: 'EFECTIVO', distanciaKmConPasajero: 5 }, // corta: agencia 2000, chofer 8000
      { precio: 20000, metodoPago: 'EFECTIVO', distanciaKmConPasajero: 25 }, // larga: agencia 3000, chofer 17000
    ],
    true,
    5000 // combustible se ignora para propietario
  );
  assert.equal(res.totalRecaudado, 30000);
  assert.equal(res.comisionAgencia20, 2000);
  assert.equal(res.comisionAgencia15, 3000);
  assert.equal(res.comisionAgencia, 5000);
  assert.equal(res.comisionChofer, 25000);
  assert.equal(res.montoARendirChofer, 5000);
  assert.equal(res.saldoAFavorChofer, 0);
});

test('calcularLiquidacionViajes calcula comisionista con efectivo, transferencia, cta cte y combustible', () => {
  const res = calcularLiquidacionViajes(
    [
      { precio: 10000, metodoPago: 'EFECTIVO', distanciaKmConPasajero: 4 },
      { precio: 10000, metodoPago: 'CUENTA_CORRIENTE', distanciaKmConPasajero: 6 },
      { precio: 10000, metodoPago: 'TRANSFERENCIA', destinoTransferencia: 'CUENTA_AGENCIA', distanciaKmConPasajero: 5 },
    ],
    false,
    3000
  );
  // Total 30000 -> chofer 30% = 9000, agencia 20% = 6000, dueño bruto = 15000 - 3000 comb = 12000
  // Efectivo cobrado por chofer = 10000 -> saldoNeto = 10000 - 9000 - 3000 = -2000 (a favor chofer)
  assert.equal(res.totalRecaudado, 30000);
  assert.equal(res.comisionChofer, 9000);
  assert.equal(res.comisionAgencia, 6000);
  assert.equal(res.gananciaPropietario, 12000);
  assert.equal(res.saldoAFavorChofer, 2000);
  assert.equal(res.montoARendirChofer, 0);
});

test('calcularBaseLiquidacionViaje aplica tarifa personalizada de pago a chofer en empresas (ej. Amcor)', () => {
  const viajeAmcor = {
    precio: 12000, // Lo que se cobra a Amcor
    metodoPago: 'CUENTA_CORRIENTE',
    distanciaKmConPasajero: 5, // 1 km base + 4 km adicionales
    cliente: {
      pagaChoferTipo: 'PERSONALIZADO',
      choferPrecioTramo: 3500,
      choferValorKm: 1000,
      choferValorHoraEspera: 0,
    },
  };
  // Base para chofer = 3500 + 4 * 1000 = 7500 (no 12000)
  assert.equal(calcularBaseLiquidacionViaje(viajeAmcor), 7500);

  const liq = calcularLiquidacionViajes([viajeAmcor], true, 0);
  assert.equal(liq.totalRecaudado, 7500);
  assert.equal(liq.comisionAgencia, 1500); // 20% de 7500
  assert.equal(liq.comisionChofer, 6000); // 80% de 7500
  assert.equal(liq.saldoAFavorChofer, 6000);
});
