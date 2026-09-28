// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { FormularioAutoEnvio } from "@/components/site/FormularioAutoEnvio";

function Buscador({ espera }: { espera?: number }) {
  return (
    <FormularioAutoEnvio action="/buscar" label="Buscar" esperaAlEscribir={espera}>
      <input name="q" type="search" aria-label="Texto" defaultValue="" />
      <select name="oficio" aria-label="Oficio" defaultValue="">
        <option value="">Todos</option>
        <option value="plomeria">Plomería</option>
      </select>
      <button type="submit">Buscar</button>
    </FormularioAutoEnvio>
  );
}

const escribir = (valor: string) => fireEvent.change(screen.getByLabelText("Texto"), { target: { value: valor } });

describe("FormularioAutoEnvio al escribir", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/buscar");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("filtra una sola vez tras la última tecla y reemplaza la entrada del historial", () => {
    render(<Buscador espera={400} />);
    escribir("pl");
    act(() => vi.advanceTimersByTime(300));
    escribir("plom");
    act(() => vi.advanceTimersByTime(399));
    expect(router.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/buscar?q=plom", { scroll: false });
  });

  it("no busca con una sola letra y omite los campos vacíos", () => {
    render(<Buscador espera={400} />);
    escribir("p");
    act(() => vi.advanceTimersByTime(1000));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("los selectores y Enter navegan al instante y agregan historial", () => {
    render(<Buscador espera={400} />);
    fireEvent.change(screen.getByLabelText("Oficio"), { target: { value: "plomeria" } });
    expect(router.push).toHaveBeenCalledWith("/buscar?oficio=plomeria", { scroll: false });

    escribir("gasfiter");
    fireEvent.submit(screen.getByRole("search"));
    expect(router.push).toHaveBeenLastCalledWith("/buscar?q=gasfiter&oficio=plomeria", { scroll: false });
    act(() => vi.advanceTimersByTime(1000));
    expect(router.replace).not.toHaveBeenCalled(); // Enter cancela la espera pendiente
  });

  it("sin espera conserva el envío nativo: el texto no filtra solo", () => {
    render(<Buscador />);
    escribir("plomeria");
    act(() => vi.advanceTimersByTime(1000));
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
