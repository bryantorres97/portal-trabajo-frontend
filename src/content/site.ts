/**
 * Contenido institucional estático (portado de resources/src/content/site.ts).
 * Los oficios se migran a la tabla `categories` en la Fase 3; mientras tanto,
 * este archivo alimenta las páginas públicas y el seed de la base de datos.
 * Los textos marcados como [PENDIENTE] en docs/analysis deben validarse con el GAD.
 */

export const institucion = {
  gad: "GAD Municipalidad de Ambato",
  direccion: "Dirección de Desarrollo Económico, Social y Deportivo",
  ordenanza: "Ordenanza RC-025-2019, Art. 12",
  telefono: "(03) 299 8700",
  whatsapp: "593998765432",
  correo: "acolita@ambato.gob.ec",
  correoDpd: "protecciondedatos@ambato.gob.ec",
  sede: "Av. Atahualpa y Jorge Larrea, Edificio Municipal, Ambato",
  horario: "Lunes a viernes, 08:00 a 17:00",
};

export type ColorMarca = "verde" | "azul" | "magenta" | "amarillo" | "naranja";

export type Oficio = {
  slug: string;
  nombre: string;
  descripcion: string;
  jornal: string;
  imagen: string;
  color: ColorMarca;
};

/** Imágenes provisionales tomadas del prototipo (ADR-009): reemplazar por material oficial del GAD. */
export const oficios: Oficio[] = [
  {
    slug: "albanileria",
    nombre: "Albañilería",
    descripcion: "Mampostería, enlucidos, contrapisos y reparaciones menores.",
    jornal: "$25 – $35 por jornal",
    imagen: "/images/oficios/albanileria.jpg",
    color: "verde",
  },
  {
    slug: "plomeria",
    nombre: "Plomería y gasfitería",
    descripcion: "Fugas, cambio de grifería, desagües y sanitarios.",
    jornal: "$25 – $40 por jornal",
    imagen: "/images/oficios/plomeria.jpg",
    color: "azul",
  },
  {
    slug: "electricidad",
    nombre: "Electricidad",
    descripcion: "Puntos de luz, tomacorrientes y revisión de tableros.",
    jornal: "$30 – $45 por jornal",
    imagen: "/images/oficios/electricidad.jpg",
    color: "amarillo",
  },
  {
    slug: "carpinteria",
    nombre: "Carpintería",
    descripcion: "Muebles a medida, puertas, closets y arreglos de madera.",
    jornal: "$28 – $42 por jornal",
    imagen: "/images/oficios/carpinteria.jpg",
    color: "naranja",
  },
  {
    slug: "jardineria",
    nombre: "Jardinería",
    descripcion: "Poda, mantenimiento de césped y sembrado de plantas.",
    jornal: "$20 – $30 por jornal",
    imagen: "/images/oficios/jardineria.jpg",
    color: "verde",
  },
  {
    slug: "limpieza",
    nombre: "Limpieza del hogar",
    descripcion: "Limpieza profunda de viviendas, oficinas y locales.",
    jornal: "$20 – $30 por jornal",
    imagen: "/images/oficios/limpieza.jpg",
    color: "magenta",
  },
  {
    slug: "pintura",
    nombre: "Pintura",
    descripcion: "Pintura interior y exterior, empaste y acabados.",
    jornal: "$25 – $38 por jornal",
    imagen: "/images/oficios/pintura.jpg",
    color: "azul",
  },
  {
    slug: "cerrajeria",
    nombre: "Cerrajería",
    descripcion: "Apertura de puertas, cambio de cerraduras y llaves.",
    jornal: "$15 – $35 por servicio",
    imagen: "/images/oficios/cerrajeria.jpg",
    color: "naranja",
  },
  {
    slug: "mudanzas",
    nombre: "Mudanzas y fletes",
    descripcion: "Carga, transporte y embalaje de muebles y enseres.",
    jornal: "$30 – $60 por servicio",
    imagen: "/images/oficios/mudanzas.jpg",
    color: "amarillo",
  },
  {
    slug: "cuidado",
    nombre: "Cuidado de personas",
    descripcion: "Acompañamiento de adultos mayores y cuidado infantil.",
    jornal: "$20 – $35 por jornada",
    imagen: "/images/oficios/cuidado.jpg",
    color: "magenta",
  },
];

/**
 * Proceso público. Solo describe pasos confirmados en IMPLEMENTATION_PLAN.md:
 * registro presencial → capacitación → habilitación por el GAD.
 * Se retiraron del prototipo afirmaciones no confirmadas (Registro Civil en línea,
 * credencial QR, botón SOS); ver docs/analysis/06-frontend-existente.md.
 */
export const pasos = [
  {
    numero: "01",
    titulo: "El trabajador se registra",
    detalle:
      "De forma presencial, en un punto de atención del Municipio. El personal del GAD revisa sus datos y documentos.",
  },
  {
    numero: "02",
    titulo: "Se capacita y es habilitado",
    detalle:
      "Completa la capacitación institucional. Solo después de aprobarla, el GAD lo habilita para aparecer en el portal.",
  },
  {
    numero: "03",
    titulo: "Tú contratas con respaldo",
    detalle:
      "Busca el oficio que necesitas, conversa por el chat de la plataforma y acuerda las condiciones por escrito.",
  },
];

/** Puntos de atención (seed de `registration_points`). [PENDIENTE] confirmar con el GAD. */
export const puntosDeAcopio = [
  { nombre: "Mercado Mayorista", detalle: "Módulo de atención, planta baja. Martes y viernes." },
  { nombre: "Mercado Central", detalle: "Oficina de administración. Lunes y jueves." },
  { nombre: "Escuela de Emprendimientos", detalle: "Atención permanente en horario de oficina." },
  { nombre: "Brigadas itinerantes", detalle: "Parroquias rurales, según calendario mensual." },
];

/** [PENDIENTE] P-06: lista oficial de requisitos y documentos. */
export const requisitos = [
  "Ser mayor de edad y residir o trabajar en el cantón Ambato.",
  "Un número de teléfono celular activo.",
  "Aprobar la capacitación establecida por el GAD Municipalidad de Ambato.",
  "Consentimiento informado para el tratamiento de datos personales (LOPDP).",
];

export const garantias = [
  {
    titulo: "Habilitados por el Municipio",
    detalle: "Solo aparecen trabajadores registrados, capacitados y habilitados por el GAD.",
  },
  {
    titulo: "Acuerdos por escrito",
    detalle: "Las condiciones aceptadas por ambas partes quedan registradas y no pueden alterarse.",
  },
  {
    titulo: "Chat trazado",
    detalle: "La conversación queda registrada y sirve como evidencia ante una denuncia.",
  },
  {
    titulo: "Denuncias atendidas",
    detalle: "Puedes reportar perfiles, mensajes o incumplimientos; el GAD revisa cada caso.",
  },
];
