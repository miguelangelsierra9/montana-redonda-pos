# GUÍA PASO A PASO: INSTALACIÓN HÍBRIDA (HOSTING COMPARTIDO + RENDER + NEON GRATIS)
## Sistema POS, Facturación y Control de Tickets QR — Montaña Redonda Paradise

Esta guía explica cómo poner en producción el sistema usando tu **Hosting Compartido** (cPanel, Hostinger, Namecheap, SiteGround, etc.) para el dominio web principal, mientras la **Base de Datos PostgreSQL** y el **Backend NestJS** corren de forma **100% gratuita ($0/mes)** en la nube.

---

## ARQUITECTURA DE LA OPCIÓN HÍBRIDA

1. **Base de Datos PostgreSQL 16 Gratis (`Neon.tech`):** Guarda de forma segura las 24 tablas, facturas, sesiones de caja, tickets QR y auditoría.
2. **Backend API Gratis (`Render.com`):** Ejecuta el servidor NestJS (`apps/backend`), valida los tickets QR atómicamente y se conecta a Neon.
3. **Frontend Web en tu Hosting Compartido (`public_html`):** Sirve la aplicación visual bajo tu propio dominio (`https://tudominio.com`) con tu certificado SSL.

---

## PASO 1: CREAR LA BASE DE DATOS POSTGRESQL GRATIS EN NEON.TECH (2 MINUTOS)

1. Entra a **[https://neon.tech](https://neon.tech)** y crea una cuenta gratuita (puedes entrar con tu cuenta de Google o GitHub, **no pide tarjeta**).
2. Haz clic en **"Create Project"**:
   - **Project name:** `montana-redonda`
   - **Database name:** `montana_redonda_db`
   - **Postgres version:** `16`
3. Una vez creado, en el panel principal verás un cuadro llamado **Connection string** que empieza por:
   ```text
   postgresql://neondb_owner:xxxx@ep-xxxx.us-east-2.aws.neon.tech/montana_redonda_db?sslmode=require
   ```
4. **Copia ese enlace completo** (lo pegaremos en el Paso 2).

---

## PASO 2: SUBIR EL BACKEND GRATIS EN RENDER.COM (4 MINUTOS)

1. Sube este proyecto a un repositorio en tu cuenta gratuita de **[GitHub.com](https://github.com)**.
2. Entra a **[https://render.com](https://render.com)** e inicia sesión con tu cuenta de GitHub (**no requiere pago**).
3. En Render, haz clic en **"New +"** -> **"Blueprint"** (o **"Web Service"**):
   - **Si eliges Blueprint (Recomendado):** Selecciona tu repositorio de GitHub. Render leerá automáticamente el archivo `render.yaml` que ya dejamos configurado en la raíz del proyecto y te pedirá únicamente pegar el valor de `DATABASE_URL` que copiaste de Neon en el Paso 1.
   - **Si eliges Web Service manual:**
     - **Build Command:** `npm install -g pnpm && pnpm install --no-frozen-lockfile && pnpm --filter @mrp/shared run build && pnpm --filter @mrp/backend run build`
     - **Start Command:** `pnpm --filter @mrp/backend run start`
     - **Instance Type:** `Free ($0/month)`
     - En **Environment Variables**, agrega:
       - `DATABASE_URL` = *(Pega el link de Neon.tech del Paso 1)*
       - `JWT_SECRET` = `montana_redonda_jwt_secret_2026_seguro`
       - `QR_HMAC_SECRET` = `montana_redonda_qr_hmac_secret_2026_seguro`
4. Al terminar el despliegue (tarda unos 2-3 minutos), Render te dará una dirección pública terminada en `.onrender.com`, por ejemplo:
   ```text
   https://montana-redonda-backend.onrender.com
   ```
   *(El sistema creará automáticamente las 24 tablas, los triggers de seguridad, los servicios de Montaña Redonda y los 5 usuarios iniciales en Neon.tech la primera vez que arranque).*

---

## PASO 3: SUBIR EL FRONTEND A TU HOSTING COMPARTIDO (`public_html`) (2 MINUTOS)

Ya hemos generado en la raíz de tu proyecto el archivo listo para subir llamado:
👉 **`hosting-compartido-public_html.zip`**

1. Entra al panel de tu Hosting Compartido (**cPanel** o **hPanel de Hostinger**) y abre el **Administrador de Archivos (File Manager)**.
2. Entra a la carpeta **`public_html`** de tu dominio (o subdominio, por ejemplo `pos.tudominio.com`).
3. Haz clic en **Subir (Upload)** y selecciona el archivo **`hosting-compartido-public_html.zip`**.
4. Haz clic derecho sobre `hosting-compartido-public_html.zip` dentro de `public_html` y elige **Extraer (Extract)**.
5. Conecta tu Frontend con tu Backend de Render de cualquiera de estas **dos maneras**:
   - **Opción A (Para todos los dispositivos de forma permanente):** Dentro de `public_html`, haz clic derecho sobre el archivo **`config.js`** -> **Editar (Edit)** y coloca la URL de tu Backend de Render terminada en `/api`:
     ```javascript
     window.MRP_CONFIG = {
       API_URL: "https://montana-redonda-backend.onrender.com/api"
     };
     ```
     Guarda los cambios.
   - **Opción B (Directamente desde la pantalla de Login):** Abre tu dominio en el navegador, haz clic abajo en **"🌐 Conexión de Servidor API -> Cambiar URL"**, pega la dirección `https://montana-redonda-backend.onrender.com/api` y pulsa **Guardar Servidor**.

---

## CREDENCIALES INICIALES DE ACCESO

| Rol | Usuario | Contraseña |
| :--- | :--- | :--- |
| **Administrador** | `admin` | `Montana2026*` |
| **Gerente / Supervisor** | `gerente` | `Montana2026*` |
| **Cajero POS** | `cajero` | `Montana2026*` |
| **Recepción** | `recepcion` | `Montana2026*` |
| **Operador de Actividad (Escáner QR)** | `operador` | `Montana2026*` |

