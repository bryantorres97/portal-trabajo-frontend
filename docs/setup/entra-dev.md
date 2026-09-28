# Microsoft Entra ID de desarrollo (acceso del personal)

> ADR-012. En desarrollo **no** se usa el tenant del GAD: se usa un tenant propio con un app registration de prueba.

## 1. Conseguir un tenant de Entra ID

Cualquiera de estas opciones sirve (todas tienen costo 0 para este uso):
- Si ya tienes una suscripción de Azure o una cuenta de Microsoft 365 de trabajo propia: usa ese tenant.
- Si no: crea una cuenta gratuita de Azure (portal.azure.com). Incluye un tenant de Microsoft Entra ID (plan Free).

Anota el **Tenant ID**: Entra ID → *Overview* → *Tenant ID*.

> **Importante:** la cuenta personal (outlook/hotmail/gmail) con la que creas el tenant queda en el directorio como cuenta **externa** (su token trae `idp` = `live.com`), y el portal **rechaza invitados**. Para probar el ingreso crea usuarios **nativos** del tenant (`…@<tenant>.onmicrosoft.com`), ver §2b.

## 2. Registrar la aplicación

Microsoft Entra admin center (entra.microsoft.com) → *Identity* → *Applications* → **App registrations** → *New registration*:

| Campo | Valor |
|---|---|
| Name | `acolita-admin-dev` (nombre anterior; los recursos externos ya creados no se renombran, ADR-017) |
| Supported account types | **Accounts in this organizational directory only** (single tenant) |
| Redirect URI | Plataforma **Web**: `http://localhost:3000/api/auth/staff/callback` (agrega también `http://localhost:3300/api/auth/staff/callback` si usas el puerto 3300) |

Después, en la app:
- **Certificates & secrets** → *New client secret* → copia el **Value** (se muestra una sola vez).
- **Authentication** → *Redirect URIs* (Web): agrega también `http://localhost:3000/admin/ingresar` (y `:3300`). Es el destino tras cerrar sesión (`post_logout_redirect_uri`), y Entra exige que esté registrado.
- **Authentication** → *Front-channel logout URL*: opcional en desarrollo (si el portal no acepta `http://localhost`, déjala vacía).
- **Token configuration** → *Add optional claim* → ID token → `email` (opcional, solo para mostrarlo).
- **API permissions**: basta `openid`, `profile`, `email` y `offline_access` de Microsoft Graph (delegados, vienen por defecto o se agregan sin consentimiento de administrador).

Anota el **Application (client) ID**.

## 2b. Usuarios de prueba (nativos del tenant)

Entra ID → *Users* → *New user* → *Create new user*:

| Usuario | Para qué |
|---|---|
| `admin.dev@<tenant>.onmicrosoft.com` | Primer `ADMIN_SISTEMA` (su `oid` va en `ENTRA_BOOTSTRAP_ADMIN_OIDS`) |
| `personal.dev@<tenant>.onmicrosoft.com` | Personal sin roles (debe entrar y recibir 403 en `/admin`) |

En *Properties* → *Contact information* llena **Email** (sin buzón, el claim `email` no viene). Inicia sesión una vez con cada uno en una ventana privada (`https://myapps.microsoft.com`) para cambiar la contraseña temporal y, con *Security defaults* activos, registrar Microsoft Authenticator.

## 3. Variables en `.env.local`

```bash
ENTRA_TENANT_ID=<tenant id>
ENTRA_CLIENT_ID=<application (client) id>
ENTRA_CLIENT_SECRET=<value del secreto>   # solo servidor
ENTRA_BOOTSTRAP_ADMIN_OIDS=<tu oid>       # opcional: ADMIN_SISTEMA si aún no hay administradores del personal
```

El bootstrap solo actúa mientras **ninguna** cuenta del personal tenga `ADMIN_SISTEMA` vigente. Una vez que existe un administrador, los demás roles se asignan desde `/admin/usuarios`.

## 3b. Probar el ingreso

1. `pnpm dev` (o `pnpm dev --port 3300` con `NEXT_PUBLIC_APP_URL=http://localhost:3300`).
2. Ventana privada → `http://localhost:3000/admin` → redirige a `/admin/ingresar` → **Ingresar con cuenta institucional**.
3. Con `admin.dev`: entra al panel como `ADMIN_SISTEMA` (bootstrap). En `/admin/usuarios` aparece con la forma de ingreso "Cuenta institucional (Microsoft)".
4. Con `personal.dev`: entra, pero sin roles ve el aviso "Tu cuenta institucional todavía no tiene roles". Desde `admin.dev` se le asigna un rol en `/admin/usuarios`.
5. Con una sesión ciudadana (Cognito) abierta, `/admin` muestra "requiere tu cuenta institucional". Los roles internos de una cuenta ciudadana no tienen efecto.
6. **Cerrar sesión** en el panel → pasa por el logout de Microsoft y vuelve a `/admin/ingresar`.

Tu `oid`: Entra ID → *Users* → tu usuario → *Object ID*.

MFA en desarrollo: opcional. En el tenant de prueba puedes activar *Security defaults* para exigirlo.

## 4. Pedido al GAD (para staging y producción)

> Solicitamos un **app registration** en el tenant de Microsoft Entra ID del GAD Municipalidad de Ambato para el panel administrativo del Portal de Empleo (Llankana):
> - Tipo: aplicación web, **single tenant**, cliente confidencial (secreto o certificado).
> - Redirect URIs: `https://<dominio-del-portal>/api/auth/staff/callback` y `https://<dominio-del-portal>/admin/ingresar` (destino tras cerrar sesión), y los de staging si aplica.
> - Permisos delegados: `openid`, `profile`, `email`, `offline_access`.
> - **Acceso condicional con MFA obligatorio** para esta aplicación (el portal no puede verificar el MFA por sí mismo).
> - Recomendado: *Assignment required* = Sí, con acceso asignado solo al personal que administrará el portal.
> - Entregar: Tenant ID, Client ID y secreto por un canal seguro.
