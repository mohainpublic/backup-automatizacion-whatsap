export const NEGOCIO = {
  nombre: "Peluquería Estilo",
  direccion: "Calle del Sol 8, Madrid 28001",
  telefono: "910 234 567",
  horario: "Lunes a viernes de 9:00 a 20:00. Sábados de 9:00 a 15:00. Domingos cerrado.",
  servicios: [
    { nombre: "Corte de pelo",        precio: "15€" },
    { nombre: "Corte y barba",        precio: "20€" },
    { nombre: "Tinte",                precio: "40€" },
    { nombre: "Mechas",               precio: "50€" },
    { nombre: "Peinado",              precio: "25€" },
    { nombre: "Tratamiento capilar",  precio: "30€" },
  ],
};

export function listaServicios(): string {
  return NEGOCIO.servicios
    .map((s, i) => `${i + 1}. ${s.nombre} — ${s.precio}`)
    .join("\n");
}

// Returns the service name if text matches one of the options (by number or keyword)
export function detectarServicio(text: string): string | null {
  const t = text.trim().toLowerCase();

  // By number (only if the message is just a number)
  const num = parseInt(t, 10);
  if (!isNaN(num) && num >= 1 && num <= NEGOCIO.servicios.length && /^\d+$/.test(t.trim())) {
    return NEGOCIO.servicios[num - 1].nombre;
  }

  // Most specific matches first to avoid "corte" swallowing "corte y barba"
  if (t.includes("barba"))                                          return "Corte y barba";
  if (t.includes("tratamiento") || t.includes("capilar"))          return "Tratamiento capilar";
  if (t.includes("mecha"))                                          return "Mechas";
  if (t.includes("tinte"))                                          return "Tinte";
  if (t.includes("peinado"))                                        return "Peinado";
  if (t.includes("corte") || t.includes("pelo"))                   return "Corte de pelo";

  return null;
}
