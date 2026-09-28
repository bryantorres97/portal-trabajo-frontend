# 03 — Identidad (Cognito), autenticación/autorización, ambientes y CI/CD

Entregables §37: 11 Análisis de Cognito · 12 Estrategia de ambientes. Cubre también §22, §23, §35 y §36.

---

## 11. Análisis de Cognito del GAD

Fuentes:
- `resources/cognito-data.md`: propiedades de **Spring Boot** de otra aplicación del GAD que ya usa el pool.
- `resources/instructivo-integracion-cognito.md`: guía oficial del GAD para integrar terceros, v1.0 del 24/09/2026, Unidad de Innovación. **Es la fuente prioritaria.**

| Dato | Valor | Observación |
|---|---|---|
| Pool | `contribuyentes-externos` (ciudadanos), `us-east-2` | [CONFIRMADO] Pool para el público general. El **pool del personal del GAD es otro** (federado con Azure AD) y no admite integraciones de terceros → P-04 |
| Issuer / JWKS | `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_L4p…` + `/.well-known/jwks.json` | Validación con `aws-jwt-verify`, como recomienda el instructivo |
| Dominio Hosted UI | `ambato-contribuyentes.auth.us-east-2.amazoncognito.com` | `/oauth2/authorize`, `/oauth2/token`, `/logout` |
| Métodos de login | Usuario y contraseña nativo, Google, Facebook | Facebook solo funciona para testers hasta que Meta lo apruebe (aprox. 20 días desde el 23/09/2026). El portal admite `/api/auth/login?proveedor=Google` (parámetro `identity_provider`) |
| Scopes | `openid`, `email`, `profile` | [CONFIRMADO] **No incluye `phone`** → el portal usa `openid email profile` |
| Claims del ID token | `sub`, `email`, `email_verified`, `given_name`, `family_name` | **Sin cédula ni teléfono** |
| `sub` | UUID técnico | ⚠️ **Distinto para la misma persona según el proveedor** (nativo, Google, Facebook). No sirve como identificador de negocio → ADR-008 |
| Identity & Onboarding Service | `GET /identity/me` y `POST /onboarding` con `Bearer <ID_TOKEN>` | Entrega el `userId` maestro estable, pero exige cédula. **No se integra en el MVP** (el portal no maneja cédula, ADR-008). `users.master_user_id` queda preparado |
| App Client | Dedicado por aplicación, lo crea el GAD | Hay que **solicitarlo** con: tipo (backend/confidencial), callbacks, logout URLs y contacto técnico → P-02 |
| Flujo | Confidencial: authorization code con `client_secret` (Basic) | El portal además usa PKCE y `nonce` (defensa en profundidad; Cognito lo admite en clientes confidenciales) |
| Roles | Catálogo compartido opcional del GAD → claims `app_roles`, `app_permissions` | Opción futura para ADR-006 → P-20 |
| MFA | **Apagado** en el pool de ciudadanos | El personal del GAD usa MFA corporativo de **Microsoft 365** → cómo ingresa al panel: P-21 |
| Vida de tokens | Acceso e ID: 60 min · refresh: **5 días** (referencia) | La sesión web dura como máximo lo que permita el refresh token: al fallar la renovación, la sesión se revoca |
| Ambiente de pruebas | **No existe** (todo es producción) | Desarrollo con pool personal (ADR-002). Las pruebas contra el pool real deben coordinarse con el GAD |
| Client secret de `cognito-data.md` | Presente en texto plano | ⚠️ Pertenece a **otra** aplicación. No se usa ni se copia. El instructivo prohíbe reutilizar credenciales ajenas. Recomendación: que el GAD lo rote (B3) |
| `cedula-claim=sub` (Spring) | — | El instructivo confirma que la cédula **nunca** viaja en los tokens. Ese valor de la otra app no aplica al portal |

Conclusiones:
1. El portal necesita **su propio App Client confidencial** en el pool de ciudadanos (P-02).
2. La identidad en el portal es `users` + `user_identities (issuer, sub)`, sin cédula (ADR-008).
3. El pool es compartido y productivo: el portal **no** depende de modificarlo (Lambdas, grupos). La autorización se resuelve en la base de datos (ADR-006).
4. **Acceso del personal del GAD:** decidido (ADR-012). El personal ingresa con **Microsoft Entra ID** (Microsoft 365, MFA corporativo por acceso condicional), integrado directamente por el portal. Los permisos internos solo se ejercen en sesiones de Entra.

## 23. Autenticación vs. autorización vs. permisos de negocio

| Capa | Pregunta | Responsable | Implementación |
|---|---|---|---|
| **Autenticación** | ¿Quién eres? | Cognito | OIDC authorization code + PKCE. El servidor valida firma, `iss`, `aud`/`client_id`, `exp` y `token_use` con `aws-jwt-verify` y JWKS en caché |
| **Autorización** | ¿Qué tipo de usuario eres en este portal? | Postgres (`user_roles`) | `getCurrentUser()` resuelve `(iss, sub) → user_identities → users.id` y carga roles y permisos (caché por request) |
| **Permisos de negocio** | ¿Puedes hacer *esto* sobre *este* recurso ahora? | Capa de dominio | `authorize(user, "contract.accept", contract)`: permiso + propiedad + estado. Ejemplo: solo una parte del contrato, y solo en `PROPUESTA_ENVIADA` |

Manejo de tokens:

| Token | Uso | Almacenamiento web |
|---|---|---|
| ID token | Datos de perfil en el login (email, nombres, proveedor) | No se persiste más allá del callback |
| Access token | Autorizar llamadas a la API (validado en el servidor) | Cifrado en `auth_sessions`; la cookie solo lleva un identificador opaco (ADR-005) |
| Refresh token | Renovar el access token sin volver a hacer login (5 días en el pool del GAD) | Cifrado en `auth_sessions` |

- **Expiración:** access token de 60 min (valor por defecto de Cognito, configurable). El servidor renueva con el refresh token cuando faltan menos de 5 min.
- **Revocación:** en el logout se llama a `/oauth2/revoke` con el refresh token, se borra la cookie y se redirige a `/logout` de Cognito.
  - "Cerrar todas las sesiones" usa `GlobalSignOut` (Fase 2).
  - Un usuario bloqueado en el portal (`users.status = 'BLOQUEADO'`) queda denegado aunque su token de Cognito siga siendo válido, porque se comprueba en cada request.
- **MFA y recuperación de cuenta:** los maneja Cognito (Managed Login). **[RECOMENDACIÓN]** MFA obligatorio para los roles GAD. El portal lo verifica leyendo `amr` del ID token o exigiéndolo mediante un app client o pool administrativo separado. **[PENDIENTE]** P-04.
- **CSRF:** la cookie es SameSite=Lax. Las Server Actions de Next verifican el Origin. Los Route Handlers mutables exigen el header `Origin` del mismo sitio o un token Bearer. El `state` y el `nonce` del flujo OIDC se guardan en una cookie temporal.
- **App móvil:** usará Cognito con PKCE (cliente público, sin secret) y enviará el access token como Bearer. El mismo `verify.ts` lo valida, aceptando los `client_id` web y móvil.

### Vinculación de la identidad de Cognito con el trabajador registrado presencialmente

1. El operador registra al trabajador (sin cédula, ADR-008). `worker_profiles.user_id` queda `NULL`.
2. El sistema genera un **código de activación** (8 caracteres, un solo uso, expira en 14 días, se guarda con hash).
3. El trabajador inicia sesión con Cognito (cuenta nueva o existente) y en `/cuenta/activar` ingresa el código. Se vinculan `users.id` y `worker_profiles.user_id` y se registra `WORKER_ACCOUNT_LINKED` en auditoría.
4. El código vincula **la identidad con la que inició sesión**. Si luego entra con otro proveedor, la vinculación de identidades de la Fase 2 une ambas cuentas (ADR-008).

## 22 / 12. Estrategia de ambientes para Cognito

| Opción | Descripción | Ventajas | Desventajas | Costo | Seguridad |
|---|---|---|---|---|---|
| A | Pools separados para local, dev, staging y prod | Aislamiento total | Más pools que mantener sincronizados | Bajo (Cognito cobra por MAU; en dev es casi 0) | Alta |
| B | Cuenta AWS personal para desarrollo | Autonomía inmediata, sin trámites | Recursos fuera del control del GAD; hay que migrar la configuración | ~0 USD (free tier/MAU mínimos) | Alta para prod (aislado); depende de la higiene personal |
| C | Cuenta AWS institucional separada para dev | Gobernanza del GAD, aislamiento real | Requiere trámites con TI del GAD | Bajo | Muy alta |
| D | Varios pools en la misma cuenta institucional | Administración centralizada | Un error de IAM puede afectar a producción; mezcla de ambientes | Bajo | Media |
| Mock | Emulador local (`cognito-local`, LocalStack) | Offline, tests automatizados | Sin Managed Login real ni MFA; APIs incompletas; puede dar falsa confianza | 0 / LocalStack Pro de pago | N/A |

**Decisión (ADR-002):**
- Local y development: **Opción B**, un pool propio en la cuenta personal del desarrollador.
- Staging y production: el GAD confirmó que **no tiene pool de pruebas ni de staging**. Staging usa el **pool personal** del equipo, con un app client aparte (P-03 respondida). Producción usa el app client del portal en el pool de ciudadanos del GAD.
- Mock: solo para **tests automatizados**. El verificador de JWT acepta un JWKS local de prueba en `NODE_ENV=test`, de modo que los tests no dependan de AWS.

Reglas: **nunca** usar el pool productivo ni sus usuarios en local o dev; cada ambiente tiene su app client y sus callback URLs; los secretos van por ambiente en el gestor de secrets del proveedor de despliegue.

## 35. Ambientes

| Recurso | local | development | staging | production |
|---|---|---|---|---|
| Next.js | `pnpm dev` | Deploy automático de la rama `development` | Deploy de `main` + tag RC | Deploy de tag de release |
| Cognito | Pool dev personal (us-east-1) | Pool dev personal (app client aparte) | Pool de staging propio del proyecto | App Client del portal en `contribuyentes-externos` |
| Supabase | CLI local (Docker) | Proyecto `Portal Empleo` | Proyecto `llankana-staging` | Proyecto `llankana-prod` (plan Pro, PITR) |
| Storage | Local (CLI) | Proyecto dev | Proyecto staging | Proyecto prod |
| Firebase | Proyecto `acolita-3fa4a` (creado con el nombre anterior) | `acolita-3fa4a` | `llankana-staging` | `llankana-prod` |
| Dominio | `localhost:3000` | `dev.<dominio>` | `staging.<dominio>` | [PENDIENTE] p. ej. `llankana.ambato.gob.ec` |
| Datos | Seed sintético | Seed sintético | Datos sintéticos o anonimizados | Reales |
| Secrets | `.env.local` (no versionado) | Gestor del proveedor | Gestor del proveedor | Gestor del proveedor, con acceso restringido |

- **Nunca se usan datos productivos en otros ambientes.** Si hace falta un volumen realista, se generan datos sintéticos.
- La migración de schema se promueve local → dev → staging → prod por CI. Nunca se cambia el schema a mano en producción.

## 36. CI/CD

CI con **GitHub Actions** y despliegue en **Vercel**, región `cle1` (ADR-007, confirmado por el GAD).

```text
PR → development / main
 ├── install (pnpm, caché)
 ├── lint (ESLint) + format check (Prettier)
 ├── typecheck (tsc --noEmit)
 ├── test unit/integration (Vitest; Postgres de Supabase CLI en el job de integración)
 ├── db: supabase db lint + advisors + aplicar migraciones sobre una base efímera
 ├── build (next build)
 ├── security: pnpm audit (nivel high), CodeQL, detección de secretos (gitleaks)
 └── e2e smoke (Playwright) contra el build

merge development → deploy dev (migraciones con `supabase db push` hacia dev)
tag vX.Y.Z-rc     → deploy staging (migraciones staging) → e2e completos
tag vX.Y.Z        → aprobación manual → deploy prod (migraciones prod) → smoke
```

- **Migraciones:** solo hacia adelante y compatibles con la versión anterior del código (patrón *expand/contract*), para poder hacer rollback del código sin rollback de la base.
- **Rollback:** se redespliega el artefacto anterior. Para problemas de datos: restauración PITR (plan Pro) y migraciones correctivas.
