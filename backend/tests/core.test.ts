import test from 'node:test';
import assert from 'node:assert/strict';
import {
  redondearPrecioMultiplo100,
  redondearKmArt,
  calcularDistanciaHaversineKm,
} from '../src/lib/pricingUtils';
import { requireRoles } from '../src/middleware/auth';

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
