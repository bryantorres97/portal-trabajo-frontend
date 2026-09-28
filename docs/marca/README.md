# Marca Llankana

Guía breve de uso (ADR-017). Los archivos están en `public/images/marca/` y se sirven en `/images/marca/…`.

## Colores

| Uso | Hex | Token CSS |
|---|---|---|
| Persona izquierda | `#136CC6` | `--azul` (y `--primary`) |
| Persona derecha | `#31A286` | `--verde` (texto: `--verde-fuerte`) |
| Rombo | `#D92564` | `--magenta` |
| Palabra «Llankana» | `#0D2A52` | `--marino` (`text-marino`) |

Tipografía de la palabra: **Outfit Black (900)**, convertida a trazos (no depende de la fuente instalada). El resto del portal sigue con Outfit y Figtree.

## Archivos

| Archivo | Para qué |
|---|---|
| `llankana-logo-horizontal.svg` / `.png` | Logotipo principal (encabezados, documentos, correo) |
| `llankana-logo-horizontal-negativo.svg` | Sobre fondos oscuros (palabra en blanco) |
| `llankana-logo-vertical.svg` / `.png` | Versión apilada (portadas, afiches, pantallas de inicio) |
| `llankana-logo-vertical-negativo.svg` | Versión apilada sobre fondos oscuros |
| `llankana-simbolo.svg` / `.png` | Solo el símbolo (avatar, íconos, espacios reducidos) |
| `llankana-simbolo-blanco.svg`, `llankana-simbolo-marino.svg` | Símbolo a una tinta |
| `icono-192.png`, `icono-512.png`, `icono-maskable-512.png` | Íconos de la aplicación web (`src/app/manifest.ts`) |
| `insignia-96.png` | Insignia monocroma de las notificaciones de Android |

En `src/app`: `favicon.ico` (16, 32 y 48 px), `icon.svg`, `apple-icon.png` (180 px) y `opengraph-image.png` (1200 × 630, para vistas previas en redes).

En el código se usa el componente `Logo` (horizontal) o `LogoSimbolo` de `src/components/site/Logo.tsx`. El alto del logo sigue al tamaño de letra (`text-2xl` ≈ 41 px). Para ponerlo en negativo: `className="text-white"`.

## Reglas de uso

- Dejar alrededor del logo un espacio libre de al menos el alto de la cabeza de una persona del símbolo.
- No cambiar los colores, no deformar el logo, no agregarle sombras ni contornos y no separar el símbolo de la palabra en la versión horizontal.
- Tamaño mínimo: 96 px de ancho para el logotipo horizontal y 16 px para el símbolo.
- Sobre fotos o fondos con mucho detalle, usar la versión negativa sobre una franja en `#0D2A52`.
