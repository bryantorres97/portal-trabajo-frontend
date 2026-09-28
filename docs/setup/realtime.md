# Tiempo real del chat (Supabase Realtime con JWT propio)

Decisión: ADR-004. El navegador se suscribe a canales **privados** de Realtime (Broadcast) con un JWT de 10 minutos que emite el servidor (`POST /api/v1/realtime/token`):

- `iss = acolita`, `sub = users.id`, `role = authenticated`, firmado con **ES256**.
- La política RLS de `realtime.messages` (`private.can_read_realtime_topic`) solo acepta tokens con `iss = acolita` de usuarios ACTIVOS:
  - `user:{id}` → su dueño (avisos de bandeja);
  - `conversation:{id}` → sus dos partes.
- Nadie publica desde el navegador: los eventos (`message`, `read`, `status`, `inbox`) los emite la base con triggers.

Para que Supabase acepte esos tokens, **la clave pública debe estar registrada en el proyecto** y el servidor debe tener la privada en `REALTIME_JWT_PRIVATE_KEY`. Cada ambiente tiene su propia clave.

Sin esta configuración el chat **igual funciona**: la interfaz actualiza por consulta cada 5 s (conversación) y 15 s (bandeja).

## Local

1. `pnpm db:keys` crea `supabase/signing_keys.json` (ignorado por git). `pnpm db:start` lo hace solo si falta.
2. `supabase/config.toml` ya tiene `[auth] signing_keys_path = "./signing_keys.json"`. Supabase local publica esa clave (`/auth/v1/.well-known/jwks.json`) y Realtime la acepta.
3. Los scripts `pnpm test:integration` y `pnpm test:e2e:local` pasan la clave al servidor automáticamente. Para `pnpm dev` contra la base **local**, copia el objeto (sin los corchetes) a `.env.local` en una sola línea:
   ```
   REALTIME_JWT_PRIVATE_KEY={"kty":"EC","kid":"…","crv":"P-256","x":"…","y":"…","d":"…",…}
   ```

## Nube (Supabase dev, staging, producción)

1. Generar una clave **distinta** para el ambiente: `supabase gen signing-key --algorithm ES256`. La salida es el JWK privado: guárdalo solo en el gestor de secretos.
2. En el dashboard del proyecto: **Settings → JWT Keys → Create standby key → Import an existing private key** y pegar el JWK.
3. Configurar `REALTIME_JWT_PRIVATE_KEY` en el ambiente del servidor (Vercel) con ese mismo JWK en una línea.
4. Verificar: con sesión de cliente, abrir una conversación y comprobar que el indicador dice **«En línea»**.
   - Si dice «Actualizando cada pocos segundos», revisar en la consola del navegador el error de la suscripción.
   - Si es `JwtSignatureError`, la clave en espera no se está usando para verificar. En ese caso, **rotar** para que quede como clave en uso (Rotate keys).
   - El portal no usa Supabase Auth ni JWT de Supabase para nada más (las claves `sb_publishable_`/`sb_secret_` no son JWT), así que la rotación no afecta a otras funciones.

> **Supabase dev (nube):** configurado el 2026-09-26 con la clave `kid 1cae2b7c…` (importada como clave adicional); la clave privada está en `.env.local` y en `supabase/signing_keys.json`, ambos fuera de git. Staging y producción deben usar claves **distintas**. En la primera conexión puede aparecer `MissingPartition`: Realtime crea en ese momento las particiones diarias de `realtime.messages` y el siguiente intento ya conecta.

> Verificado en local (2026-09-26): con un token firmado por la clave del portal, el canal permitido queda `SUBSCRIBED`; un topic ajeno responde `Unauthorized` y un token firmado con otra clave, `JwtSignatureError`.

Detalle técnico: el archivo que genera la CLI trae `key_ops: ["sign","verify"]`. WebCrypto no importa una clave privada con esos usos, así que el servidor ignora `key_ops` y `use` al importarla (`src/server/realtime/token.ts`).
