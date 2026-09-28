/**
 * Código de activación de un solo uso que el operador entrega en persona al trabajador para
 * vincular su cuenta ciudadana con su ficha (01-negocio.md §7.1, paso 6).
 * Formato `XXXX-XXXX` con un alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L): 31^8 ≈ 8,5·10¹¹
 * combinaciones, vigencia corta, un único código vigente por trabajador y canje limitado a
 * 5 intentos fallidos cada 15 minutos. En la base solo se guarda su HMAC.
 */

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 8;
export const CODE_VALIDITY_DAYS = 7;

export function generateActivationCode(random: (n: number) => Uint8Array = randomBytes): string {
  const chars: string[] = [];
  // Muestreo por rechazo para no sesgar el alfabeto (256 no es múltiplo de 31).
  const limite = 256 - (256 % CODE_ALPHABET.length);
  while (chars.length < CODE_LENGTH) {
    for (const b of random(16)) {
      if (b < limite && chars.length < CODE_LENGTH) chars.push(CODE_ALPHABET[b % CODE_ALPHABET.length]);
    }
  }
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/**
 * Normaliza lo que escribe el trabajador (ignora espacios, guiones y minúsculas). Devuelve null
 * si no tiene el formato o usa caracteres fuera del alfabeto.
 */
export function normalizeActivationCode(input: string): string | null {
  const limpio = input.toUpperCase().replace(/[\s-]/g, "");
  if (limpio.length !== CODE_LENGTH) return null;
  for (const c of limpio) if (!CODE_ALPHABET.includes(c)) return null;
  return `${limpio.slice(0, 4)}-${limpio.slice(4)}`;
}

export function activationExpiry(desde = new Date()): Date {
  return new Date(desde.getTime() + CODE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}
