# Propuesta: Tarificación para viajes cortos con búsqueda lejana (origen alejado de la base)

**Estado:** Pendiente de definición con el Dueño de Remises Bruno  
**Fecha:** 27/11/2026

## Problema a resolver
En varios casos un pasajero solicita un vehículo desde una zona alejada de la base (**Av. Sarmiento 271, Chivilcoy**) para realizar un trayecto muy corto:
- **Ejemplo 1:** Eustaquia Sánchez 64 (~30 cuadras desde la base) → Guardia del Hospital (< 10 cuadras).
- **Ejemplo 2:** Parque Industrial (~7 km desde la base) → Parador La Posta (~1 km).

Con la fórmula actual (cobro únicamente de `origen → destino`), el pasajero abona solo la bajada de bandera (`$3.500`), mientras que el chofer recorre muchos kilómetros vacío de ida y vuelta, generando pérdida de combustible y tiempo.

---

## Opciones propuestas

### Opción 1: Mínimos por Anillos / Zonas desde la Base *(simple y predecible)*
Definir 2 o 3 radios configurables por el Dueño desde la agencia:
- **Zona 1 (hasta 2,5 km de la base):** mínimo normal (`$3.500`).
- **Zona 2 (2,5 a 5 km — barrios periféricos / San Ceferino):** mínimo configurable (ej. `$4.500`–`$5.000`).
- **Zona 3 (5 a 12 km — Parque Industrial / Accesos / La Posta):** mínimo configurable (ej. `$6.500`–`$7.000`).

**Efecto:**
- Parque Industrial → Centro (~7 km): ya supera el mínimo → **no cambia el precio**.
- Parque Industrial → La Posta (~1 km): cobra el mínimo de Zona 3 (`$6.500`–`$7.000`).
- **Ventaja:** precio fijo antes de pedir y muy fácil de explicar al cliente.

---

### Opción 2: Radio libre desde la base + adicional por acercamiento
Definir un radio sin cargo desde la base (ej. **2 km / 20 cuadras**). Si el origen supera ese radio (y el viaje es corto o no vuelve hacia el centro), sumar un porcentaje del valor del km urbano (ej. `50%` = `$600/km`) por los km excedentes de aproximación.

**Ejemplos (radio libre 2 km + `$600/km` extra):**
- Casa a 3 km de base → Hospital (0,8 km): `1 km extra × $600` → **`$4.100`**.
- Parque Industrial (7 km) → La Posta (1 km): `5 km extra × $600` → **`$6.500`**.
- **Ventaja:** progresivo (sin saltos bruscos) y fijo antes de pedir.

---

### Opción 3: Bajar el umbral del "Ajuste por Origen Remoto" existente
En `backend/src/lib/pricingUtils.ts` ya existe la fórmula:
```
distanciaFacturable = max(distanciaViaje, (Base→Origen + Viaje + Destino→Base) / 2)
```
Actualmente se activa recién a partir de **12 km** (localidades vecinas como Alberti o Moquehuá).  
Si se baja el umbral a **3–4 km** (solo cuando el viaje es corto, ej. `< 2 km`):
- **Parque Industrial (7 km) → La Posta (1 km, a 7 km de base):** `(7 + 1 + 7) / 2 = 7,5 km` → **`$11.300`** (cubre el recorrido real ida y vuelta del móvil).
- **Parque Industrial (7 km) → Centro (7 km, a 0 km de base):** `(7 + 7 + 0) / 2 = 7 km` → **sin recargo**.
- **Ventaja:** cubre exactamente los km reales del móvil y no encarece viajes desde barrios alejados hacia el centro.

---

### Opción 4: Recargo por distancia real del móvil libre más cercano (estilo Uber)
Medir en tiempo real la distancia del chofer disponible más cercano al origen; si supera un umbral (ej. > 15 cuadras), aplicar un recargo por recogida lejana.
- **Desventaja:** el precio del mismo trayecto puede variar según dónde haya móviles libres en ese minuto.

---

## Próximo paso
Definir con el Dueño cuál de las opciones (y los valores de radio/mínimo) prefiere aplicar, para implementarlo en `pricingUtils.ts` y exponer los parámetros editables en el Panel de Configuración del Dueño.
