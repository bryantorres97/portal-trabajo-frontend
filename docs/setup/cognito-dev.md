# Cognito de desarrollo (cuenta AWS personal)

> ADR-002: **nunca** usar el pool de ciudadanos del GAD (`ambato-contribuyentes`) para local ni para development. Además, el GAD no tiene ambiente de pruebas (instructivo §8).

## 1. Crear el User Pool

1. Consola AWS → Amazon Cognito → **Create user pool**. Cualquier región sirve. El pool dev actual está en `us-east-1`; el del GAD, en `us-east-2`.
2. Tipo de aplicación: **Traditional web application** (genera un client **con secret**, igual que el institucional). Nombre: `acolita-web-dev` (nombre anterior; los recursos externos ya creados no se renombran, ADR-017).
3. Opciones de inicio de sesión: **email** (y teléfono si quieres probarlo). Registro autónomo habilitado.
4. Atributos requeridos: `email`. Opcionales: `given_name`, `family_name` (los mismos que entrega el pool del GAD).
5. Return URL: `http://localhost:3000/api/auth/callback`.
6. Crear. Anotar:
   - **User pool ID** (p. ej. `us-east-2_XXXXXXXXX`);
   - **Client ID** y **Client secret** (App clients → el cliente creado);
   - **Dominio** (Branding → Domain), con el formato `<prefijo>.auth.us-east-2.amazoncognito.com`.

## 2. Configurar el App Client

En *App clients* → `acolita-web-dev` → *Login pages* → **Edit**:

| Campo | Valor |
|---|---|
| Allowed callback URLs | `http://localhost:3000/api/auth/callback` |
| Allowed sign-out URLs | `http://localhost:3000/` |
| Identity providers | Cognito user pool |
| OAuth grant types | Authorization code grant |
| OpenID Connect scopes | `openid`, `email`, `profile` (igual que el pool del GAD, que **no** soporta `phone`) |

En *Authentication flows*, basta con `ALLOW_REFRESH_TOKEN_AUTH`. Tokens: access e ID de 60 min y **refresh de 5 días** (igual que el client de referencia del GAD), para reproducir la expiración real de la sesión.

## 3. Variables en `.env.local`

```bash
COGNITO_REGION=us-east-2
COGNITO_USER_POOL_ID=us-east-2_XXXXXXXXX
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_CLIENT_SECRET=xxxxxxxx   # solo aquí, nunca en git
COGNITO_DOMAIN=<prefijo>.auth.us-east-2.amazoncognito.com
APP_URL=http://localhost:3000
```

### Verificación del login (cierra B2)

1. Completar `.env.local` (Cognito + `SESSION_SECRET` + las claves de Supabase local de `supabase status`).
2. `pnpm db:start` y `pnpm dev`.
3. Abrir `/cuenta` → "Ingresar o crear cuenta" → Managed Login → volver a `/cuenta` con el nombre, el correo y el rol `CLIENTE`.
4. En Studio: la fila en `users`, su identidad en `user_identities` (issuer del pool dev + `sub` + proveedor), la sesión en `auth_sessions` (con `tokens_enc` cifrado) y `USER_FIRST_LOGIN` y `USER_LOGIN` en `audit_log`.
   - Opcional: `/api/auth/login?proveedor=Google` si el pool dev tiene Google configurado. Debe crear **otro** usuario con otra identidad (ADR-008).
5. "Cerrar sesión" → redirección a Cognito y al inicio. La sesión queda con `revoked_at` y `USER_LOGOUT` queda registrado.
6. Asignar `ADMIN_SISTEMA` (sección 4) y abrir `/admin`.

> ⚠️ En la máquina de desarrollo actual el puerto 3000 lo usa Docker. Registrar también `http://localhost:3300/api/auth/callback` y `http://localhost:3300/` en el app client, y usar `NEXT_PUBLIC_APP_URL=http://localhost:3300` con `pnpm dev --port 3300`.

## 4. Usuarios de prueba

- Crea usuarios desde la consola (*Users → Create user*) o regístrate desde el Managed Login.
- Los roles del portal **no** se asignan en Cognito (ADR-006). Para dar un rol interno a un usuario de prueba, después de su primer login:

```sql
insert into public.user_roles (user_id, role_code)
select id, 'ADMIN_SISTEMA' from public.users where email = 'tu-correo@ejemplo.com';
```

(A partir de la Fase 2 esto se hará desde `/admin/usuarios`.)

## 5. Pre Token Generation Lambda: **no se necesita**

ADR-004 decidió que Realtime use tokens emitidos por el propio servidor, así que **no hay que agregar ningún Lambda** al pool (ni al personal ni al del GAD).

Si alguna vez hiciera falta saber en qué plan (tier) está un pool:
- **Consola:** Amazon Cognito → *User pools* → el pool → pestaña **Settings** → *Feature plan* (Lite, Essentials o Plus).
- **AWS CLI:** `aws cognito-idp describe-user-pool --user-pool-id <id> --query "UserPool.UserPoolTier"` → `LITE`, `ESSENTIALS` o `PLUS`.
- Los pools creados desde fines de 2024 son **Essentials** por defecto. El del GAD solo lo puede consultar su equipo.

## 6. Diferencias conocidas con el pool institucional

| Aspecto | Dev | Institucional |
|---|---|---|
| Cédula | No aplica (ADR-008) | No viaja en tokens; solo en el Identity & Onboarding Service |
| Región | `us-east-1` | `us-east-2` |
| Scopes | Los que configures (incluir `openid email profile`) | Solo `openid email profile` (sin `phone`) |
| Refresh token | Configurable | 5 días |
| Federación | Opcional (se puede agregar Google para probar identidades múltiples, ADR-008) | Google activo; Facebook pendiente de aprobación de Meta |
| MFA | Opcional | **Apagado** (P-04 para el personal GAD) |
| Ambiente de pruebas | Este pool | **No existe**: todo es producción. Coordinar con el GAD cualquier prueba |

Registrar aquí cualquier diferencia nueva que se descubra.
