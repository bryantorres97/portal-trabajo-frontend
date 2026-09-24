# Portal de Empleo y Servicios del GAD Municipal de Ambato

## Prompt para análisis técnico, arquitectura y plan de implementación

## 1. Rol que debes asumir

Actúa como un **arquitecto de software senior, analista funcional, desarrollador full-stack senior y especialista en diseño de sistemas institucionales**.

Tu objetivo inicial NO es comenzar a programar.

Primero debes:

1. Analizar completamente los requerimientos proporcionados.
2. Analizar todos los recursos disponibles en la carpeta `resources`.
3. Revisar especialmente el archivo `cognito-data.md`, si está disponible.
4. Analizar el frontend existente y determinar qué partes pueden reutilizarse.
5. Identificar inconsistencias, ambigüedades, riesgos y requisitos faltantes.
6. Proponer una arquitectura técnica.
7. Definir los módulos funcionales.
8. Definir los principales flujos de negocio.
9. Proponer el modelo de datos.
10. Definir la estrategia de autenticación y autorización con AWS Cognito.
11. Diseñar la separación de ambientes.
12. Definir un roadmap de implementación por fases.
13. Separar claramente el alcance del MVP de las funcionalidades futuras.
14. Formular las preguntas que deban ser respondidas antes de comenzar el desarrollo.

No implementes funcionalidades todavía salvo que posteriormente se solicite explícitamente.

El resultado debe ser un **plan técnico y funcional suficientemente detallado para que posteriormente otro agente pueda implementar el sistema fase por fase**.

---

# 2. Contexto del proyecto

El Gobierno Autónomo Descentralizado Municipal de Ambato, Ecuador, desea implementar una plataforma web de empleo y contratación de servicios.

La plataforma tendrá como objetivo conectar:

* personas que necesitan contratar un servicio;
* personas que ofrecen servicios;
* personal del GAD Municipal encargado de administrar, validar, habilitar y moderar la plataforma.

La plataforma será administrada institucionalmente por el GAD Municipal de Ambato.

El sistema deberá permitir que un ciudadano encuentre trabajadores que ofrecen determinados servicios, revise su información, se comunique con ellos mediante un chat y, si ambas partes están de acuerdo con las condiciones del servicio, formalicen la contratación dentro de la plataforma.

---

# 3. Actores principales

Como mínimo deben contemplarse los siguientes actores.

## 3.1 Cliente

Es la persona que busca contratar un servicio.

Debe poder:

* registrarse e iniciar sesión;
* administrar su perfil;
* buscar trabajadores;
* filtrar trabajadores;
* consultar perfiles;
* consultar servicios ofrecidos;
* revisar calificaciones;
* iniciar conversaciones;
* chatear con trabajadores;
* acordar condiciones del servicio;
* aceptar las condiciones;
* formalizar una contratación;
* consultar sus contrataciones;
* calificar al trabajador;
* dejar un comentario;
* denunciar a un trabajador;
* denunciar mensajes o contenido;
* consultar el estado de sus denuncias;
* recibir notificaciones.

---

## 3.2 Trabajador

Es la persona que ofrece sus servicios en la plataforma.

Su incorporación al sistema será diferente a la del cliente.

El trabajador será registrado presencialmente en puntos de atención del GAD Municipal.

El personal autorizado del GAD recopilará sus datos y lo registrará en el sistema.

Sin embargo, registrarse NO significa que el trabajador pueda aparecer inmediatamente en el portal.

El trabajador deberá:

1. Ser registrado por personal del GAD.
2. Completar el proceso de capacitación establecido por la institución.
3. Aprobar la capacitación.
4. Ser habilitado por personal autorizado del GAD.
5. Una vez habilitado, aparecer públicamente en el portal.

El proceso exacto de capacitación todavía no está definido y debe diseñarse de manera que pueda evolucionar posteriormente.

El trabajador deberá poder:

* consultar y administrar su perfil;
* consultar los servicios que ofrece;
* indicar categorías y especialidades;
* establecer información relacionada con sus servicios;
* recibir solicitudes/contactos;
* responder conversaciones;
* negociar condiciones;
* aceptar o rechazar contrataciones;
* consultar sus contrataciones;
* consultar su historial;
* recibir notificaciones;
* responder a denuncias cuando corresponda.

La aplicación móvil para trabajadores NO forma parte del MVP actual.

Sin embargo, toda la arquitectura debe diseñarse teniendo en cuenta que posteriormente existirá una aplicación móvil para trabajadores.

Al final, el trabajador podrá iniciar sesión en el local a través de cognito, de la misma manera que los otros actores de este sistema.

---

# 4. Personal del GAD Municipal

La plataforma debe disponer de un área administrativa para funcionarios autorizados del GAD.

No todos los funcionarios tendrán las mismas capacidades.

Debe contemplarse un modelo de roles y permisos.

Como mínimo deberían analizarse roles como:

* administrador del sistema;
* administrador de trabajadores;
* operador de puntos de atención;
* responsable de capacitación;
* moderador;
* responsable de denuncias;
* supervisor.

Los nombres definitivos y permisos deben proponerse durante el análisis.

El personal autorizado debe poder:

* registrar trabajadores;
* consultar trabajadores;
* modificar información administrativa;
* gestionar documentación;
* gestionar estados del trabajador;
* registrar o validar capacitación;
* habilitar trabajadores;
* suspender trabajadores;
* revisar denuncias;
* revisar conversaciones cuando exista una denuncia;
* revisar comentarios denunciados;
* tomar acciones de moderación;
* consultar historial de acciones;
* generar reportes;
* consultar métricas.

Todas las acciones administrativas importantes deben quedar auditadas.

---

# 5. Registro de clientes

Los clientes podrán registrarse directamente desde el portal web.

Debe analizarse el flujo de:

* registro;
* verificación;
* inicio de sesión;
* recuperación de contraseña;
* actualización de datos;
* cierre de sesión;
* administración de sesiones;
* bloqueo o suspensión;
* consentimiento para tratamiento de datos.

La autenticación y autorización deberán integrarse con AWS Cognito.

---

# 6. Registro de trabajadores

El registro de trabajadores será principalmente presencial.

Debe existir una interfaz administrativa para que los funcionarios del GAD puedan:

1. Crear el registro del trabajador.
2. Registrar información personal.
3. Registrar información de contacto.
4. Registrar información relacionada con los servicios.
5. Registrar categorías/especialidades.
6. Registrar documentación requerida.
7. Registrar información relacionada con capacitación.
8. Consultar el estado del proceso de habilitación.
9. Habilitar o suspender al trabajador.

Debe diseñarse un flujo de estados.

Por ejemplo:

```text
REGISTRADO
    ↓
DOCUMENTACIÓN_PENDIENTE
    ↓
PENDIENTE_CAPACITACIÓN
    ↓
CAPACITACIÓN_EN_PROCESO
    ↓
CAPACITACIÓN_APROBADA
    ↓
HABILITADO
```

También deben analizarse estados como:

```text
RECHAZADO
SUSPENDIDO
INACTIVO
PENDIENTE_REVISION
```

No asumas que estos estados son definitivos. Evalúa y propón el modelo adecuado.

---

# 7. Capacitación de trabajadores

El GAD ha indicado que un trabajador debe completar una capacitación antes de ser habilitado.

Actualmente no existe suficiente información sobre el curso.

Por lo tanto, NO debe construirse una solución excesivamente acoplada a un LMS específico.

La arquitectura debe permitir inicialmente registrar información como:

* curso;
* trabajador;
* fecha de inicio;
* fecha de finalización;
* resultado;
* aprobación;
* funcionario que validó;
* evidencia o documento;
* observaciones.

Posteriormente podría integrarse un sistema externo de capacitación.

El diseño debe permitir evolucionar hacia:

* cursos;
* módulos;
* evaluaciones;
* intentos;
* calificaciones;
* certificados;
* vencimiento de certificaciones.

---

# 8. Catálogo de servicios

El portal debe permitir organizar los trabajadores mediante categorías y servicios.

Debe analizarse un modelo flexible para:

* categorías;
* subcategorías;
* servicios;
* especialidades;
* experiencia;
* ubicación;
* disponibilidad;
* descripción;
* rango de precios, si corresponde.

Ejemplo conceptual:

```text
Construcción
 ├── Albañilería
 ├── Pintura
 └── Electricidad

Servicios para el hogar
 ├── Limpieza
 ├── Jardinería
 └── Reparaciones
```

El modelo definitivo debe ser propuesto por el agente.

---

# 9. Portal público

El portal debe permitir a los usuarios descubrir trabajadores habilitados.

Debe contemplar como mínimo:

* página principal;
* buscador;
* categorías;
* listado de trabajadores;
* filtros;
* perfil del trabajador;
* servicios;
* experiencia;
* ubicación;
* calificaciones;
* comentarios;
* estado de disponibilidad;
* información relevante para contactar.

El sistema debe evitar mostrar información personal sensible que no sea necesaria.

---

# 10. Perfil del trabajador

El perfil público debe permitir mostrar únicamente información aprobada para publicación.

Como mínimo podría incluir:

* fotografía;
* nombre;
* descripción profesional;
* categorías;
* servicios;
* experiencia;
* ubicación aproximada;
* calificación promedio;
* número de contrataciones;
* comentarios;
* estado de habilitación;
* información adicional relevante.

Analiza qué información debe ser pública y cuál debe mantenerse privada.

---

# 11. Sistema de búsqueda

El sistema deberá permitir buscar trabajadores.

Debe analizarse la implementación de:

* búsqueda por texto;
* categoría;
* servicio;
* ubicación;
* disponibilidad;
* experiencia;
* calificación;
* otros filtros relevantes.

Para el MVP debe mantenerse una solución sencilla, pero la arquitectura debe permitir incorporar posteriormente mecanismos de búsqueda más avanzados.

---

# 12. Chat entre cliente y trabajador

El sistema deberá disponer de comunicación entre cliente y trabajador.

Cuando un cliente esté interesado en contratar a un trabajador podrá iniciar una conversación.

El chat deberá permitir:

* mensajes de texto;
* fecha y hora;
* estado de lectura;
* historial;
* notificaciones;
* bloqueo de conversación cuando corresponda;
* reporte de mensajes;
* asociación de la conversación con una posible contratación.

El chat debe considerarse información potencialmente sensible.

Debe existir una política clara de acceso al contenido.

El personal del GAD NO debe poder consultar arbitrariamente cualquier conversación sin justificación.

Cuando exista una denuncia, deberá existir un mecanismo de acceso controlado y auditado a la conversación relacionada.

---

# 13. Proceso de contratación

Una conversación NO significa automáticamente que existe una contratación.

La contratación solamente se considerará formalizada cuando ambas partes hayan aceptado las condiciones acordadas.

Debe diseñarse un flujo similar a:

```text
CONTACTO_INICIADO
       ↓
NEGOCIACIÓN
       ↓
CONDICIONES_PROPUESTAS
       ↓
ACEPTACIÓN_CLIENTE
       ↓
ACEPTACIÓN_TRABAJADOR
       ↓
CONTRATADO
```

Debe analizarse cuidadosamente cómo manejar:

* precio;
* descripción del trabajo;
* fecha;
* lugar;
* condiciones;
* observaciones;
* cancelaciones;
* rechazo;
* expiración;
* modificaciones;
* finalización;
* disputas.

Las condiciones aceptadas deberían quedar registradas como una versión inmutable de las condiciones de la contratación.

Esto es importante para posteriores procesos de denuncia o auditoría.

---

# 14. Calificaciones y comentarios

Una vez finalizada una contratación, el cliente podrá calificar al trabajador.

Debe analizarse:

* escala de calificación;
* cuándo se permite calificar;
* quién puede calificar;
* si ambas partes pueden calificarse;
* posibilidad de editar;
* posibilidad de eliminar;
* moderación;
* comentarios denunciados;
* prevención de múltiples calificaciones fraudulentas.

El comentario tendrá un máximo de **200 palabras**.

Debe validarse este límite tanto en frontend como backend.

La calificación debe estar vinculada a una contratación real para evitar reseñas falsas.

---

# 15. Denuncias

La plataforma debe permitir denunciar:

* trabajadores;
* clientes;
* perfiles;
* comentarios;
* mensajes;
* conversaciones;
* posibles incumplimientos.

Debe existir un módulo de denuncias.

Una denuncia debería contener como mínimo:

* denunciante;
* denunciado;
* tipo;
* motivo;
* descripción;
* evidencia;
* fecha;
* estado;
* responsable;
* resolución;
* observaciones.

Estados posibles:

```text
ABIERTA
EN_REVISION
EN_ESPERA_DE_INFORMACION
RESUELTA
DESCARTADA
ESCALADA
```

El modelo debe ser validado durante el análisis.

---

# 16. Moderación

Los funcionarios autorizados del GAD podrán revisar denuncias.

Dependiendo del tipo de denuncia podrían consultar:

* perfil;
* contratación;
* comentario;
* mensajes relacionados;
* información relevante de la operación.

Toda consulta administrativa de información sensible debe quedar registrada en auditoría.

El sistema debe permitir tomar acciones como:

* advertencia;
* ocultar contenido;
* suspender temporalmente;
* deshabilitar trabajador;
* bloquear usuario;
* cerrar denuncia;
* escalar caso.

Las acciones concretas deben definirse posteriormente con la institución.

---

# 17. Notificaciones

Las notificaciones push serán implementadas utilizando Firebase Cloud Messaging.

Deben considerarse eventos como:

* nuevo contacto;
* nuevo mensaje;
* aceptación de contratación;
* rechazo;
* actualización de contratación;
* capacitación;
* habilitación;
* denuncia;
* resolución de denuncia;
* comunicados institucionales.

La arquitectura debe desacoplar el sistema de notificaciones del resto del negocio.

Debe ser posible incorporar posteriormente:

* email;
* SMS;
* WhatsApp;
* notificaciones dentro del portal.

---

# 18. Aplicación móvil futura

La aplicación móvil para trabajadores NO forma parte del MVP.

Sin embargo, el backend debe diseñarse como una API-first platform.

La futura aplicación móvil debería poder:

* autenticarse;
* consultar perfil;
* consultar clientes;
* recibir notificaciones;
* consultar conversaciones;
* responder mensajes;
* aceptar/rechazar contrataciones;
* consultar historial;
* actualizar disponibilidad.

No crear funcionalidades móviles durante esta fase.

Solamente dejar preparada la arquitectura.

---

# 19. Stack tecnológico

## Frontend web

Utilizar:

* Next.js
* TypeScript
* React
* Tailwind CSS, si resulta adecuado
* librerías modernas de UI según criterio técnico

El frontend debe utilizar una arquitectura mantenible y escalable.

Debe priorizar:

* accesibilidad;
* responsive design;
* SEO para el portal público;
* rendimiento;
* seguridad;
* buena experiencia de usuario.

---

# 20. Backend y Supabase

Se ha establecido el uso de Supabase.

Debe analizarse exactamente qué responsabilidades tendrá Supabase.

Como mínimo debe evaluarse:

* PostgreSQL;
* almacenamiento de archivos;
* realtime;
* Row Level Security;
* funciones;
* almacenamiento de documentos;
* posibles mecanismos para chat.

No asumir automáticamente que Supabase Auth debe utilizarse.

La autenticación institucional deberá estar centralizada en AWS Cognito.

Debe definirse claramente qué componente es responsable de:

```text
Identidad → Cognito
Datos de negocio → Supabase/PostgreSQL
Archivos → Supabase Storage o alternativa
Notificaciones → Firebase
```

La decisión final debe justificarse técnicamente.

---

# 21. AWS Cognito

El GAD ha indicado que desea utilizar Amazon Cognito para centralizar autenticación y autorización con otras aplicaciones institucionales.

El archivo:

```text
resources/cognito-data.md
```

contiene información proporcionada por la institución.

Debes analizarlo detalladamente.

Extrae de este archivo, cuando exista:

* User Pool;
* App Client;
* Client ID;
* dominios;
* regiones;
* grupos;
* claims;
* scopes;
* configuración OAuth/OIDC;
* atributos;
* federación;
* endpoints;
* configuración relevante;
* cualquier otra información útil.

NO expongas secretos ni credenciales sensibles en el resultado.

Si existen valores que parecen secretos, únicamente indica que fueron encontrados y recomienda su manejo seguro.

---

# 22. Separación de ambientes de Cognito

Uno de los objetivos del análisis es determinar cómo trabajar sin afectar el ambiente productivo del GAD.

Evalúa alternativas para:

### Opción A

Cognito completamente separado para:

```text
local
development
staging
production
```

### Opción B

Utilizar una cuenta AWS personal para desarrollo.

### Opción C

Utilizar una cuenta AWS institucional separada para desarrollo.

### Opción D

Utilizar distintos User Pools dentro de una cuenta AWS.

Analiza ventajas, desventajas, costos, seguridad y facilidad de administración.

Determina si Cognito puede ser simulado localmente para desarrollo y qué limitaciones tendría dicha estrategia.

La recomendación debe priorizar aislamiento y seguridad.

Nunca modificar ni utilizar directamente recursos productivos para desarrollo.

---

# 23. Autenticación y autorización

Diseña una arquitectura donde Cognito sea responsable de la identidad.

El backend deberá validar tokens emitidos por Cognito.

Analiza cómo manejar:

* JWT;
* access token;
* ID token;
* refresh token;
* grupos;
* roles;
* claims personalizados;
* permisos;
* expiración;
* revocación;
* sesiones;
* MFA;
* recuperación de cuenta.

Diferencia claramente:

```text
Autenticación
vs.
Autorización
vs.
Permisos de negocio
```

---

# 24. Seguridad

Debido a que se trata de una plataforma institucional, la seguridad debe considerarse desde el diseño.

Analiza como mínimo:

* OWASP Top 10;
* control de acceso;
* protección de endpoints;
* validación de inputs;
* rate limiting;
* protección contra spam;
* protección contra abuso del chat;
* XSS;
* CSRF cuando corresponda;
* SQL injection;
* almacenamiento seguro de archivos;
* control de MIME types;
* límites de archivos;
* sanitización;
* logs;
* auditoría;
* trazabilidad;
* protección de información personal;
* privacidad;
* políticas de retención.

También considera la legislación ecuatoriana aplicable a protección de datos personales y señala qué aspectos deben ser validados jurídicamente por la institución.

No inventes requisitos legales específicos si no puedes verificarlos.

---

# 25. Auditoría

El sistema debe disponer de auditoría.

Debe poder registrarse como mínimo:

* usuario;
* acción;
* recurso;
* identificador;
* fecha;
* IP cuando corresponda;
* resultado;
* información relevante.

Ejemplos:

```text
WORKER_CREATED
WORKER_ENABLED
WORKER_SUSPENDED
TRAINING_APPROVED
CONTRACT_CREATED
CONTRACT_ACCEPTED
REPORT_CREATED
REPORT_REVIEWED
USER_BLOCKED
MESSAGE_REVIEWED
```

La auditoría debe ser especialmente estricta para las acciones administrativas.

---

# 26. Documentos

El sistema puede requerir documentos asociados a trabajadores.

Analiza:

* qué documentos deberían existir;
* quién puede cargarlos;
* quién puede consultarlos;
* quién puede reemplazarlos;
* fechas de vencimiento;
* estados;
* almacenamiento;
* control de acceso;
* auditoría.

No almacenar archivos sensibles directamente en la base de datos.

---

# 27. Modelo de datos

Propón un modelo relacional inicial.

Como mínimo analiza entidades como:

```text
User
Worker
WorkerProfile
ClientProfile
Category
Service
WorkerService
WorkerDocument
Training
TrainingEnrollment
WorkerVerification
Conversation
ConversationParticipant
Message
HiringRequest
Contract
ContractTerms
Rating
Review
Report
ReportEvidence
ModerationAction
Notification
AuditLog
```

No asumas que todas deben convertirse literalmente en tablas.

Normaliza y simplifica el modelo según corresponda.

Entrega:

1. Diagrama conceptual.
2. Entidades.
3. Relaciones.
4. Cardinalidades.
5. Campos importantes.
6. Estados.
7. Índices recomendados.
8. Restricciones.
9. Consideraciones de privacidad.

---

# 28. Arquitectura general

Propón una arquitectura similar a:

```text
                    ┌─────────────────────┐
                    │     Next.js Web     │
                    │ Public + Dashboard  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Backend API     │
                    │ Business Logic      │
                    └───────┬─────┬───────┘
                            │     │
                ┌───────────┘     └─────────────┐
                ▼                               ▼
        ┌───────────────┐               ┌──────────────┐
        │    Cognito    │               │   Supabase   │
        │ Authentication│               │ PostgreSQL   │
        └───────────────┘               └──────────────┘
                                                │
                                                ▼
                                        ┌──────────────┐
                                        │   Storage    │
                                        └──────────────┘

                            ┌──────────────────────┐
                            │ Firebase Cloud Msg   │
                            │ Notifications        │
                            └──────────────────────┘

Future:

        ┌─────────────────────┐
        │ Worker Mobile App   │
        └──────────┬──────────┘
                   │
                   ▼
              Backend API
```

Esta arquitectura es solamente conceptual.

Puedes modificarla si encuentras una solución técnicamente superior.

---

# 29. Repositorio existente

En la carpeta `resources` existe un frontend proporcionado como propuesta inicial.

Debes analizarlo.

Determina:

* framework;
* estructura;
* componentes;
* diseño;
* páginas existentes;
* funcionalidades existentes;
* problemas técnicos;
* código reutilizable;
* código que debería reemplazarse;
* deuda técnica;
* oportunidades de mejora.

No asumas que debe mantenerse exactamente igual.

Tienes libertad para:

* rediseñar;
* refactorizar;
* eliminar;
* agregar;
* modernizar.

El objetivo es obtener una aplicación institucional moderna, accesible, rápida y mantenible.

---

# 30. UX/UI

La plataforma debe tener una experiencia sencilla para ciudadanos con diferentes niveles de experiencia tecnológica.

Debe priorizar:

* simplicidad;
* claridad;
* accesibilidad;
* responsive design;
* navegación intuitiva;
* formularios claros;
* estados visibles;
* mensajes de error comprensibles;
* confirmaciones;
* indicadores de carga;
* empty states;
* feedback de acciones.

Para el portal público se debe priorizar descubrimiento de servicios y trabajadores.

Para el área administrativa se debe priorizar productividad y gestión.

---

# 31. Funcionalidades adicionales que debes evaluar

Además de los requisitos originales, analiza si conviene incorporar:

* favoritos;
* trabajadores recientemente vistos;
* historial de búsquedas;
* disponibilidad;
* ubicación aproximada;
* búsqueda por mapa;
* perfiles verificados;
* insignia de trabajador habilitado;
* historial de contrataciones;
* cancelación;
* reprogramación;
* bloqueo entre usuarios;
* sistema anti-spam;
* límites de mensajes;
* reportes;
* métricas;
* panel administrativo;
* estadísticas;
* exportación de información;
* comunicados institucionales;
* centro de ayuda;
* preguntas frecuentes;
* términos y condiciones;
* política de privacidad;
* consentimiento;
* sistema de banners;
* mantenimiento de categorías;
* mantenimiento de servicios.

No agregues funcionalidades solamente por agregarlas.

Clasifícalas como:

```text
MVP
FASE POST-MVP
FUTURO
NO RECOMENDADO
```

y justifica brevemente cada decisión.

---

# 32. Alcance del MVP

Define un MVP realista.

El MVP debería permitir como mínimo:

```text
Cliente
 ├── Registro/Login
 ├── Perfil
 ├── Buscar trabajadores
 ├── Consultar perfil
 ├── Iniciar conversación
 ├── Chat
 ├── Acordar condiciones
 ├── Contratar
 ├── Consultar contratación
 ├── Calificar
 └── Denunciar

Trabajador
 ├── Registro administrativo
 ├── Capacitación/validación
 ├── Habilitación
 ├── Perfil
 ├── Servicios
 ├── Chat
 ├── Contrataciones
 └── Notificaciones

GAD
 ├── Login administrativo
 ├── Gestión trabajadores
 ├── Capacitación
 ├── Habilitación
 ├── Denuncias
 ├── Moderación
 ├── Auditoría
 └── Reportes básicos
```

Ajusta este alcance si el análisis determina que algún elemento debería moverse de fase.

---

# 33. Roadmap por fases

Genera un plan de implementación dividido en fases.

Como mínimo considera:

## Fase 0 — Descubrimiento y definición

* análisis de requisitos;
* análisis del frontend;
* análisis de Cognito;
* definición de roles;
* definición de estados;
* definición de reglas de negocio;
* arquitectura;
* modelo de datos.

## Fase 1 — Fundación técnica

* repositorio;
* estructura;
* configuración;
* ambientes;
* CI/CD;
* Supabase;
* Cognito;
* backend;
* frontend;
* observabilidad.

## Fase 2 — Usuarios y perfiles

* autenticación;
* clientes;
* trabajadores;
* perfiles;
* roles.

## Fase 3 — Catálogo y búsqueda

* categorías;
* servicios;
* trabajadores;
* búsqueda;
* filtros.

## Fase 4 — Gestión de trabajadores

* registro administrativo;
* documentos;
* capacitación;
* habilitación;
* suspensión.

## Fase 5 — Chat

* conversaciones;
* mensajes;
* realtime;
* notificaciones;
* seguridad.

## Fase 6 — Contrataciones

* negociación;
* condiciones;
* aceptación;
* contratación;
* estados;
* finalización.

## Fase 7 — Calificaciones

* ratings;
* comentarios;
* moderación.

## Fase 8 — Denuncias y moderación

* reportes;
* revisión;
* evidencias;
* acciones;
* auditoría.

## Fase 9 — Panel administrativo

* dashboards;
* reportes;
* métricas;
* administración.

## Fase 10 — Calidad y producción

* testing;
* seguridad;
* performance;
* accesibilidad;
* CI/CD;
* monitoreo;
* backups;
* documentación;
* despliegue.

## Fase 11 — Aplicación móvil futura

Definir arquitectura y reutilización del backend para una aplicación móvil destinada a trabajadores.

---

# 34. Testing

Define una estrategia de pruebas que incluya:

* unit tests;
* integration tests;
* API tests;
* end-to-end;
* pruebas de autorización;
* pruebas de seguridad;
* pruebas de concurrencia del chat;
* pruebas de contratación;
* pruebas de moderación;
* pruebas de notificaciones.

Identifica los flujos críticos que deben tener pruebas automatizadas.

---

# 35. Ambientes

Propón una estrategia clara:

```text
local
development
staging
production
```

Determina qué servicios deben tener recursos independientes por ambiente.

Especialmente analiza:

* Cognito;
* Supabase;
* Firebase;
* storage;
* dominios;
* secrets;
* base de datos.

Nunca utilizar datos productivos directamente en desarrollo.

---

# 36. CI/CD

Propón una estrategia de integración y despliegue continuo.

Debe contemplar:

* lint;
* type checking;
* tests;
* build;
* análisis de seguridad;
* migraciones;
* despliegue;
* rollback.

No asumas un proveedor específico sin justificarlo.

---

# 37. Entregables esperados del análisis

Antes de comenzar a programar, entrega un documento estructurado con:

### 1. Resumen ejecutivo

### 2. Comprensión del negocio

### 3. Actores

### 4. Casos de uso

### 5. Reglas de negocio

### 6. Estados de cada proceso

### 7. Flujos principales

### 8. Requisitos funcionales

### 9. Requisitos no funcionales

### 10. Arquitectura propuesta

### 11. Análisis de Cognito

### 12. Estrategia de ambientes

### 13. Análisis de Supabase

### 14. Modelo de datos

### 15. API propuesta

### 16. Estrategia de realtime/chat

### 17. Sistema de notificaciones

### 18. Seguridad

### 19. Auditoría

### 20. Análisis del frontend existente

### 21. MVP

### 22. Funcionalidades futuras

### 23. Roadmap por fases

### 24. Dependencias entre fases

### 25. Riesgos técnicos

### 26. Riesgos funcionales

### 27. Preguntas pendientes

### 28. Recomendaciones finales

---

# 38. Reglas importantes para el análisis

No inventes información institucional que no haya sido proporcionada.

Cuando algo no esté definido:

```text
NO ASUMIR
↓
IDENTIFICAR COMO PENDIENTE
↓
PROPONER ALTERNATIVAS
↓
RECOMENDAR UNA OPCIÓN
↓
EXPLICAR LAS IMPLICACIONES
```

Diferencia claramente:

* requisito confirmado;
* requisito inferido;
* recomendación técnica;
* decisión pendiente.

No comiences a desarrollar hasta completar el análisis inicial.

---

# 39. Preguntas que debes identificar

Al finalizar el análisis, genera una sección denominada:

## Preguntas que deben responderse antes del desarrollo

Incluye todas las preguntas cuya respuesta pueda cambiar significativamente:

* arquitectura;
* modelo de datos;
* seguridad;
* UX;
* flujo de contratación;
* moderación;
* autenticación;
* capacitación;
* almacenamiento;
* notificaciones;
* infraestructura.

No hagas preguntas triviales.

Prioriza aquellas que realmente puedan bloquear decisiones técnicas.

---

# 40. Criterio final

El resultado debe ser un **plan de implementación profesional para un sistema institucional**, no simplemente una lista de tareas.

Cada fase debe indicar:

* objetivo;
* funcionalidades;
* componentes involucrados;
* dependencias;
* decisiones técnicas;
* entregables;
* pruebas;
* criterios de aceptación;
* riesgos.

La prioridad es construir una solución:

* segura;
* mantenible;
* escalable;
* auditable;
* accesible;
* preparada para una futura aplicación móvil;
* compatible con la infraestructura institucional;
* y con una clara separación entre ambientes.

No empezar la implementación hasta terminar este análisis.
