/*
 * Service worker de las notificaciones push de Llankana (Firebase Cloud Messaging).
 * No carga el SDK de Firebase: muestra la notificación que llega en el evento `push` y, al
 * tocarla, abre la dirección interna del portal que trae el mensaje (`data.link`).
 */

function rutaInterna(valor) {
  return typeof valor === "string" && /^\/(?![/\\])/.test(valor) ? valor : "/cuenta";
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let carga = {};
  try {
    carga = event.data ? event.data.json() : {};
  } catch {
    carga = { notification: { body: event.data ? event.data.text() : "" } };
  }
  const n = carga.notification || {};
  const datos = carga.data || {};
  const titulo = n.title || "Llankana";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: n.body || "",
      icon: "/images/marca/icono-192.png",
      badge: "/images/marca/insignia-96.png",
      lang: "es-EC",
      tag: datos.campaignId ? `aviso-${datos.campaignId}` : undefined,
      data: { link: rutaInterna(datos.link) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(rutaInterna(event.notification.data && event.notification.data.link), self.location.origin)
    .href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin && "focus" in v) {
          return v.focus().then(() => ("navigate" in v ? v.navigate(destino) : undefined));
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
