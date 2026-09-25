/**
 * Contenido institucional estático (portado de resources/src/content/site.ts).
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

// El catálogo de oficios vive en la base de datos (tabla `services`, Fase 3).

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
