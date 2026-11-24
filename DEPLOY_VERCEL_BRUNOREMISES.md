# 🚀 Guía de Despliegue en Vercel - Remises Bruno (2 Apps Separadas)

La plataforma **Remises Bruno** está dividida en **dos aplicaciones Frontend independientes** que consumen el mismo **Backend**:

1. **`frontend-clientes`**: App pública y liviana exclusiva para pasajeros (DNI + PIN / WhatsApp OTP, pedir remís, reservas y seguimiento GPS en vivo).
2. **`frontend-interno`**: Plataforma operativa interna exclusiva para **Choferes, Coordinadores y Dueño/Administración** (con sesiones, cookies y PWA totalmente aisladas de la app de pasajeros).

---

## 🌐 Mapa de Dominios por Proyecto en Vercel

### Proyecto 1 en Vercel: `remises-bruno-clientes`
- **Root Directory:** `frontend-clientes`
- **Dominios asignados:**
  - `brunoremises.com.ar`
  - `www.brunoremises.com.ar`
  - `cliente.brunoremises.com.ar`
  - `clientes.brunoremises.com.ar`

### Proyecto 2 en Vercel: `remises-bruno-interno`
- **Root Directory:** `frontend-interno`
- **Dominios asignados:**
  - `choferes.brunoremises.com.ar` ➔ Abre directo la App de Choferes (`/chofer/app`)
  - `coordinacion.brunoremises.com.ar` ➔ Abre directo la Central de Coordinación (`/coordinador/dashboard`)
  - `admin.brunoremises.com.ar` ➔ Abre directo el Panel del Dueño / Administración (`/duenio/dashboard`)

---

## 🛠️ Cómo actualizar tus proyectos en Vercel (Paso a Paso)

### 1️⃣ Configurar `frontend-clientes` en Vercel
1. En Vercel, hacé clic en **Add New...** ➔ **Project** y seleccioná el repositorio `AppRemisesBruno` (o reutilizá tu proyecto existente si preferís).
2. En **Root Directory**, hacé clic en **Edit** y elegí:
   ```text
   frontend-clientes
   ```
3. Agregá las **Environment Variables**:
   - `NEXT_PUBLIC_API_URL`: URL de tu backend con `/api` al final (ej: `https://api.brunoremises.com.ar/api`).
   - `NEXT_PUBLIC_SOCKET_URL`: URL base de tu backend (ej: `https://api.brunoremises.com.ar`).
4. Desplegá (**Deploy**) y en **Settings ➔ Domains** asignale únicamente:
   - `brunoremises.com.ar`
   - `www.brunoremises.com.ar`
   - `cliente.brunoremises.com.ar`
   - `clientes.brunoremises.com.ar`

### 2️⃣ Configurar `frontend-interno` en Vercel
1. En Vercel, creá el segundo proyecto (**Add New...** ➔ **Project**) conectado al **mismo repositorio** `AppRemisesBruno` (o actualizá el **Root Directory** de tu proyecto anterior en **Settings ➔ General ➔ Root Directory**).
2. En **Root Directory**, seleccioná:
   ```text
   frontend-interno
   ```
3. Agregá las mismas **Environment Variables**:
   - `NEXT_PUBLIC_API_URL`
   - `NEXT_PUBLIC_SOCKET_URL`
4. Desplegá (**Deploy**) y en **Settings ➔ Domains** asignale únicamente los 3 subdominios internos:
   - `choferes.brunoremises.com.ar`
   - `coordinacion.brunoremises.com.ar`
   - `admin.brunoremises.com.ar`

*(Nota: Si alguno de esos subdominios estaba asignado al proyecto anterior en Vercel, primero quitalo de ese proyecto en Settings ➔ Domains y agregalo al nuevo; los registros DNS CNAME en tu proveedor no necesitan cambiarse porque siguen apuntando a `cname.vercel-dns.com.`).*

---

## 💻 Desarrollo Local

- **Backend:** `http://localhost:3001` (`npm run dev:backend`)
- **App Clientes (`frontend-clientes`):** `http://localhost:3000` (`npm run dev:clientes`)
- **App Interna (`frontend-interno`):** `http://localhost:3002` (`npm run dev:interno`)
- **Levantar todo junto:** `npm run dev` desde la raíz del proyecto.
