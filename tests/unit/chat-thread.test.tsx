// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatThread } from "@/components/chat/ChatThread";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const base = {
  conversationId: "00000000-0000-4000-8000-0000000000c1",
  currentUserId: "00000000-0000-4000-8000-0000000000a1",
  counterpartName: "Walter P.",
  initialMessages: [
    { id: 1, isMine: false, body: "Hola, ¿en qué le ayudo?", hidden: false, createdAt: "2026-09-26T15:00:00Z" },
    { id: 2, isMine: true, body: "Tengo una fuga", hidden: false, createdAt: "2026-09-26T15:01:00Z" },
  ],
  initialHasMore: false,
  initialOtherLastReadId: 2,
  blockedByMe: false,
  blockedByOther: false,
  closed: false,
  workerLinked: true,
  myRole: "CLIENTE" as const,
  reasons: [{ code: "MENSAJE_SPAM", label: "Spam" }],
};

type Llamada = { url: string; init?: RequestInit };
let llamadas: Llamada[];
let responder: (url: string, init?: RequestInit) => Response;

beforeEach(() => {
  llamadas = [];
  responder = (url) =>
    url.endsWith("/messages") ? Response.json({ id: 3 }, { status: 201 }) : Response.json({ items: [], lastReadId: 1 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, init });
      return responder(url, init);
    }),
  );
  Element.prototype.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChatThread", () => {
  it("muestra el historial, el «Visto» y marca como leído lo recibido", async () => {
    render(<ChatThread {...base} />);
    expect(screen.getByText("Hola, ¿en qué le ayudo?")).toBeTruthy();
    expect(screen.getByLabelText("Visto")).toBeTruthy();
    await waitFor(() => expect(llamadas.some((l) => l.url.endsWith("/read"))).toBe(true));
    const lectura = llamadas.find((l) => l.url.endsWith("/read"))!;
    expect(JSON.parse(String(lectura.init?.body))).toEqual({ lastMessageId: 1 });
  });

  it("envía de forma optimista con un clientMessageId y confirma con el id del servidor", async () => {
    render(<ChatThread {...base} />);
    const caja = screen.getByLabelText("Escribe un mensaje");
    fireEvent.change(caja, { target: { value: "  ¿Puede mañana?  " } });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Enviar"));
    });
    const envio = llamadas.find((l) => l.url.endsWith("/messages") && l.init?.method === "POST")!;
    const cuerpo = JSON.parse(String(envio.init?.body));
    expect(cuerpo.body).toBe("¿Puede mañana?");
    expect(cuerpo.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(screen.getAllByLabelText("Enviado").length).toBeGreaterThan(0));
    expect(screen.getAllByText("¿Puede mañana?")).toHaveLength(1);
  });

  it("si falla, permite reintentar con el MISMO clientMessageId (sin duplicar)", async () => {
    let intentos = 0;
    responder = (url) => {
      if (url.endsWith("/messages")) {
        intentos++;
        return intentos === 1
          ? Response.json({ detail: "Estás enviando mensajes muy rápido." }, { status: 429 })
          : Response.json({ id: 9 }, { status: 201 });
      }
      return Response.json({ items: [] });
    };
    render(<ChatThread {...base} />);
    fireEvent.change(screen.getByLabelText("Escribe un mensaje"), { target: { value: "Hola" } });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Enviar"));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("muy rápido"));
    await act(async () => {
      fireEvent.click(screen.getByText(/Reintentar/));
    });
    const envios = llamadas.filter((l) => l.url.endsWith("/messages") && l.init?.method === "POST");
    expect(envios).toHaveLength(2);
    const [a, b] = envios.map((e) => JSON.parse(String(e.init?.body)).clientMessageId);
    expect(a).toBe(b);
    await waitFor(() => expect(screen.getAllByText("Hola")).toHaveLength(1));
  });

  it("con la conversación bloqueada no muestra el campo de escritura", () => {
    render(<ChatThread {...base} blockedByOther />);
    expect(screen.queryByLabelText("Escribe un mensaje")).toBeNull();
    expect(screen.getByText("La otra persona bloqueó esta conversación.")).toBeTruthy();
  });

  it("avisa cuando el trabajador aún no activó su cuenta", () => {
    render(<ChatThread {...base} workerLinked={false} />);
    expect(screen.getByText(/aún no activa su cuenta/)).toBeTruthy();
  });

  it("las respuestas sugeridas completan la caja sin enviar (el usuario decide)", () => {
    render(<ChatThread {...base} initialMessages={[base.initialMessages[0]]} />);
    fireEvent.click(screen.getByRole("button", { name: "¿Tiene disponibilidad esta semana?" }));
    expect((screen.getByLabelText("Escribe un mensaje") as HTMLTextAreaElement).value).toBe(
      "¿Tiene disponibilidad esta semana?",
    );
    expect(llamadas.some((l) => l.url.endsWith("/messages") && l.init?.method === "POST")).toBe(false);
  });

  it("no ofrece sugerencias cuando ya escribiste", () => {
    render(<ChatThread {...base} />);
    expect(screen.queryByRole("group", { name: "Respuestas sugeridas" })).toBeNull();
  });

  it("marca desde dónde empiezan los mensajes nuevos", () => {
    render(<ChatThread {...base} unreadAtOpen={1} />);
    expect(screen.getByText("Mensajes nuevos")).toBeTruthy();
  });

  it("bloquear pide confirmación y explica qué pasa", async () => {
    render(<ChatThread {...base} />);
    const menu = screen.getByLabelText("Más opciones");
    menu.focus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    const opcion = await screen.findByText("Bloquear conversación");
    fireEvent.click(opcion);
    expect(await screen.findByText("¿Bloquear esta conversación?")).toBeTruthy();
    expect(llamadas.some((l) => l.url.endsWith("/block"))).toBe(false);
  });
});
