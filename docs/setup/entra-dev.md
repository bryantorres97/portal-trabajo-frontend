# Microsoft Entra ID de desarrollo (acceso del personal)

> ADR-012. En desarrollo **no** se usa el tenant del GAD: se usa un tenant propio con un app registration de prueba.

## 1. Conseguir un tenant de Entra ID

Cualquiera de estas opciones sirve (todas tienen costo 0 para este uso):
- Si ya tienes una suscripción de Azure o una cuenta de Microsoft 365 de trabajo propia: usa ese tenant.
- Si no: crea una cuenta gratuita de Azure (portal.azure.com). Incluye un tenant de Microsoft Entra ID (plan Free).

Anota el **Tenant ID**: Entra ID → *Overview* → *Tenant ID*.

## 2. Registrar la aplicación

Microsoft Entra admin center (entra.microsoft.com) → *Identity* → *Applications* → **App registrations** → *New registration*:

| Campo | Valor |
|---|---|
| Name | `acolita-admin-dev` |
| Supported account types | **Accounts in this organizational directory only** (single tenant) |
| Redirect URI | Plataforma **Web**: `http://localhost:3000/api/auth/staff/callback` |

Después, en la app:
- **Certificates & secrets** → *New client secret* → copia el **Value** (se muestra una sola vez).
- **Authentication** → *Front-channel logout URL*: `http://localhost:3000/`.
- **Token configuration** → *Add optional claim* → ID token → `email` (opcional, solo para mostrarlo).
- **API permissions**: basta `openid`, `profile`, `email` y `offline_access` de Microsoft Graph (delegados, vienen por defecto o se agregan sin consentimiento de administrador).

Anota el **Application (client) ID**.

## 3. Variables en `.env.local`

```bash
ENTRA_TENANT_ID=<tenant id>
ENTRA_CLIENT_ID=<application (client) id>
ENTRA_CLIENT_SECRET=<value del secreto>   # solo servidor
ENTRA_BOOTSTRAP_ADMIN_OIDS=<tu oid>       # opcional: te crea como ADMIN_SISTEMA en tu primer ingreso
```

Tu `oid`: Entra ID → *Users* → tu usuario → *Object ID*.

MFA en desarrollo: opcional. En el tenant de prueba puedes activar *Security defaults* para exigirlo.

## 4. Pedido al GAD (para staging y producción)

> Solicitamos un **app registration** en el tenant de Microsoft Entra ID del GAD Municipalidad de Ambato para el panel administrativo del Portal de Empleo (Acolita.App):
> - Tipo: aplicación web, **single tenant**, cliente confidencial (secreto o certificado).
> - Redirect URI: `https://<dominio-del-portal>/api/auth/staff/callback` (y el de staging, si aplica).
> - Front-channel logout URL: `https://<dominio-del-portal>/`.
> - Permisos delegados: `openid`, `profile`, `email`, `offline_access`.
> - **Acceso condicional con MFA obligatorio** para esta aplicación (el portal no puede verificar el MFA por sí mismo).
> - Recomendado: *Assignment required* = Sí, con acceso asignado solo al personal que administrará el portal.
> - Entregar: Tenant ID, Client ID y secreto por un canal seguro.
