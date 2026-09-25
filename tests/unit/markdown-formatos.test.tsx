import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Markdown } from "@/components/site/Markdown";
import { describirDispositivo, etiquetaProveedor } from "@/lib/formatos";

describe("Markdown seguro", () => {
  it("renderiza párrafos, listas y negritas", () => {
    const html = renderToStaticMarkup(<Markdown source={"**Hola** mundo\n\n1. uno\n2. dos\n\n- a\n- b"} />);
    expect(html).toContain("<strong>Hola</strong>");
    expect(html).toContain("<ol");
    expect(html).toContain("<ul");
  });

  it("nunca interpreta HTML incrustado", () => {
    const html = renderToStaticMarkup(<Markdown source={'<script>alert(1)</script> <img src=x onerror="y">'} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("formatos", () => {
  it("resume user agents comunes", () => {
    expect(
      describirDispositivo("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36"),
    ).toBe("Chrome en Windows");
    expect(describirDispositivo("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1")).toBe(
      "Safari en iOS",
    );
    expect(describirDispositivo(null)).toBe("Dispositivo desconocido");
  });

  it("etiqueta el proveedor nativo", () => {
    expect(etiquetaProveedor("COGNITO")).toBe("Usuario y contraseña");
    expect(etiquetaProveedor("Google")).toBe("Google");
  });
});
