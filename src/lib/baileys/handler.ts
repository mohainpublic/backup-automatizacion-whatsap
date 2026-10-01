import type { WAMessage } from "@whiskeysockets/baileys";
import type { makeWASocket } from "@whiskeysockets/baileys";
import {
  getOrCreateConversation,
  insertMessage,
  getConversationById,
} from "../db";
import { bookAppointment } from "../calendar";
import { NEGOCIO, listaServicios, detectarServicio } from "../negocio";

type Sock = ReturnType<typeof makeWASocket>;

const botSentIds = new Set<string>();

// ── State machine ──────────────────────────────────────────────────────────────

type Step =
  | "idle"
  | "menu"
  | "booking_servicio"
  | "booking_nombre"
  | "booking_dia"
  | "booking_hora"
  | "booking_confirmar";

interface State {
  step: Step;
  servicio?: string;
  nombre?: string;
  dia?: string;       // YYYY-MM-DD
  diaLabel?: string;  // "lunes 7 de julio"
  hora?: string;      // HH:MM
}

const states = new Map<string, State>();

function getState(phone: string): State {
  if (!states.has(phone)) states.set(phone, { step: "idle" });
  return states.get(phone)!;
}

function resetState(phone: string) {
  states.set(phone, { step: "menu" });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function trackBotSentId(id: string): void {
  botSentIds.add(id);
}

function extractText(msg: WAMessage): string | null {
  const m = msg.message;
  if (!m) return null;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.ephemeralMessage?.message?.conversation ??
    m.ephemeralMessage?.message?.extendedTextMessage?.text ??
    null
  );
}

// ── Date parsing ───────────────────────────────────────────────────────────────

function parseDate(text: string): { iso: string; label: string } | null {
  const tz = process.env.BUSINESS_TIMEZONE ?? "Europe/Madrid";
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const today = new Date(`${todayStr}T12:00:00Z`);
  const t = text.trim().toLowerCase();

  let d: Date | null = null;

  if (t.includes("hoy")) {
    d = new Date(today);
  } else if (t.includes("pasado")) {
    d = new Date(today);
    d.setUTCDate(d.getUTCDate() + 2);
  } else if (t.includes("mañana")) {
    d = new Date(today);
    d.setUTCDate(d.getUTCDate() + 1);
  } else {
    const weekdays: Record<string, number> = {
      domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
      jueves: 4, viernes: 5, sábado: 6, sabado: 6,
    };
    for (const [name, target] of Object.entries(weekdays)) {
      if (t.includes(name)) {
        d = new Date(today);
        const cur = d.getUTCDay();
        let diff = target - cur;
        if (diff <= 0) diff += 7;
        d.setUTCDate(d.getUTCDate() + diff);
        break;
      }
    }
  }

  if (!d) {
    // DD/MM or DD/MM/YYYY
    const slash = t.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
    if (slash) {
      const day = parseInt(slash[1], 10);
      const mon = parseInt(slash[2], 10);
      const yr  = slash[3] ? parseInt(slash[3], 10) : today.getUTCFullYear();
      if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
        d = new Date(Date.UTC(yr, mon - 1, day, 12));
      }
    }
  }

  if (!d) {
    // "el 15 de julio"
    const meses: Record<string, number> = {
      enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
      julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12,
    };
    const re = new RegExp(`(\\d{1,2})\\s+de\\s+(${Object.keys(meses).join("|")})`);
    const m = t.match(re);
    if (m) {
      const day = parseInt(m[1], 10);
      const mon = meses[m[2]];
      d = new Date(Date.UTC(today.getUTCFullYear(), mon - 1, day, 12));
    }
  }

  if (!d) {
    const iso = t.match(/(\d{4}-\d{2}-\d{2})/);
    if (iso) d = new Date(`${iso[1]}T12:00:00Z`);
  }

  if (!d) return null;

  const isoStr = d.toISOString().slice(0, 10);
  const label = d.toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
  return { iso: isoStr, label };
}

// ── Time parsing ───────────────────────────────────────────────────────────────

function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase();

  // Explicit time takes priority over "mañana/tarde" keywords
  // Matches: "17:00", "17:00h", "a las 17", "10h", "10.30"
  const match = t.match(/\b(\d{1,2})(?:[:\.](\d{2}))?h?\b/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = match[2] ? parseInt(match[2], 10) : 0;
    if (h >= 7 && h <= 21) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  // Fallback: time-of-day keyword (only when there's no explicit number)
  if (t.includes("tarde"))  return "16:00";
  if (t.includes("mañana")) return "10:00";

  return null;
}

// ── Business Q&A (keyword detection) ──────────────────────────────────────────

function respuestaInfo(text: string): string | null {
  const t = text.toLowerCase();

  if (/horario|hora|cuándo|cuando|abr|cerr|abiert|cerrad/.test(t)) {
    return `Nuestro horario es:\n${NEGOCIO.horario}`;
  }

  if (/servicio|precio|cuánto|cuanto|corte|tinte|mecha|peinado|tratamiento|barba|hacéis|haceis|ofrecéis|ofreceis/.test(t)) {
    return `Nuestros servicios son:\n${listaServicios()}`;
  }

  if (/dónde|donde|dirección|direccion|cómo llegar|ubicación|ubicacion|sitio|lugar/.test(t)) {
    return `Estamos en ${NEGOCIO.direccion}.`;
  }

  if (/teléfono|telefono|número|numero|llamar|contacto/.test(t)) {
    return `Puedes llamarnos al ${NEGOCIO.telefono}.`;
  }

  return null;
}

function esReserva(text: string): boolean {
  const t = text.toLowerCase();
  return /reserv|cita|pedir|apuntar|apuntarme|quiero|necesito|turno/.test(t);
}

function esSi(text: string): boolean {
  return /^(sí|si|sí!|si!|yes|claro|vale|ok|correcto|perfecto|confirmado|confirm)$/i.test(text.trim());
}

function esNo(text: string): boolean {
  return /^(no|cancelar|cancel|nope|nunca|mejor no)$/i.test(text.trim());
}

function resumenCita(state: State): string {
  return (
    `Te apunto:\n` +
    `• Servicio: ${state.servicio}\n` +
    `• Nombre: ${state.nombre}\n` +
    `• Día: ${state.diaLabel}\n` +
    `• Hora: ${state.hora}\n\n` +
    `¿Es correcto? (Sí / No)`
  );
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function handleMessage(sock: Sock, msg: WAMessage): Promise<void> {
  const jid = msg.key.remoteJid ?? "";
  if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) return;
  if (!msg.message || msg.message.protocolMessage) return;

  const text = extractText(msg);
  if (!text) return;

  const phone = jid.endsWith("@s.whatsapp.net")
    ? jid.replace("@s.whatsapp.net", "")
    : jid;
  const pushName = (msg as { pushName?: string }).pushName ?? null;

  if (msg.key.fromMe) {
    const msgId = msg.key.id ?? "";
    if (botSentIds.has(msgId)) { botSentIds.delete(msgId); return; }
    const convo = getOrCreateConversation(phone, null);
    insertMessage(convo.id, "human", text);
    return;
  }

  console.log(`[bot] ← ${phone} (${pushName ?? "?"}): "${text}"`);

  const convo = getOrCreateConversation(phone, pushName);
  insertMessage(convo.id, "user", text);

  const fresh = getConversationById(convo.id);
  if (!fresh || fresh.mode !== "AI") {
    console.log(`[bot] Chat ${phone} en modo HUMAN — sin responder`);
    return;
  }

  const state = getState(phone);
  let reply = "";

  // ── IDLE: first contact ──
  if (state.step === "idle") {
    state.step = "menu";
    reply = `¡Hola! Bienvenido a ${NEGOCIO.nombre}. ¿En qué le puedo ayudar?`;

  // ── MENU: decide what the user wants ──
  } else if (state.step === "menu") {
    const infoReply = respuestaInfo(text);
    if (infoReply) {
      reply = infoReply + "\n\n¿Necesitas algo más?";
    } else if (esReserva(text)) {
      state.step = "booking_servicio";
      reply =
        `¡Perfecto! ¿Qué servicio quieres?\n\n` +
        listaServicios() +
        `\n\nDime el número o el nombre.`;
    } else {
      // Generic fallback
      reply =
        `Puedo ayudarte con:\n` +
        `• Reservar una cita\n` +
        `• Horarios\n` +
        `• Servicios y precios\n` +
        `• Dónde estamos\n\n` +
        `¿Qué necesitas?`;
    }

  // ── BOOKING: service ──
  } else if (state.step === "booking_servicio") {
    const servicio = detectarServicio(text);
    if (!servicio) {
      reply =
        `No he entendido el servicio. Elige uno:\n\n` +
        listaServicios() +
        `\n\nDime el número o el nombre.`;
    } else {
      state.servicio = servicio;
      state.step = "booking_nombre";
      reply = `Perfecto. ¿A qué nombre apunto la cita?`;
    }

  // ── BOOKING: name ──
  } else if (state.step === "booking_nombre") {
    const nombre = text.trim();
    if (nombre.length < 2) {
      reply = "Por favor dime tu nombre completo.";
    } else {
      state.nombre = nombre;
      state.step = "booking_dia";
      reply = `¿Qué día te viene bien?`;
    }

  // ── BOOKING: day ──
  } else if (state.step === "booking_dia") {
    const parsed = parseDate(text);
    if (!parsed) {
      reply = `No he entendido el día. Puedes decirme, por ejemplo: mañana, el lunes, el 15 de julio, 15/7...`;
    } else {
      state.dia = parsed.iso;
      state.diaLabel = parsed.label;
      // If the user included the time in the same message, skip the hour question
      const horaInline = parseTime(text);
      if (horaInline) {
        state.hora = horaInline;
        state.step = "booking_confirmar";
        reply = resumenCita(state);
      } else {
        state.step = "booking_hora";
        reply = `¿A qué hora? Por ejemplo: 10:00, 11:30, por la mañana, por la tarde...`;
      }
    }

  // ── BOOKING: time ──
  } else if (state.step === "booking_hora") {
    const hora = parseTime(text);
    if (!hora) {
      reply = `No he entendido la hora. Dime algo como: 10:00, 11:30, por la mañana, por la tarde...`;
    } else {
      state.hora = hora;
      state.step = "booking_confirmar";
      reply = resumenCita(state);
    }

  // ── BOOKING: confirm ──
  } else if (state.step === "booking_confirmar") {
    if (esSi(text)) {
      try {
        await bookAppointment({
          date: state.dia!,
          time: state.hora!,
          client_name: state.nombre!,
          client_phone: phone,
          service: state.servicio,
        });
        reply =
          `¡Listo! Cita confirmada.\n` +
          `${state.servicio} el ${state.diaLabel} a las ${state.hora} a nombre de ${state.nombre}.\n\n` +
          `¡Hasta entonces!`;
        resetState(phone);
      } catch (err) {
        const msg = String(err);
        console.error("[bot] Error al crear cita:", err);
        if (msg.includes("SLOT_TAKEN")) {
          state.step = "booking_hora";
          reply = `Esa hora ya está ocupada. ¿Puedes venir a otra hora ese mismo día?`;
        } else {
          reply = `Ha habido un problema técnico. Por favor inténtalo de nuevo o llámanos al ${NEGOCIO.telefono}.`;
          resetState(phone);
        }
      }
    } else if (esNo(text)) {
      resetState(phone);
      reply = `De acuerdo, cancelado. ¿En qué más puedo ayudarte?`;
    } else {
      reply = `Responde Sí para confirmar o No para cancelar.`;
    }
  }

  if (!reply) return;

  const sentMsg = await sock.sendMessage(jid, { text: reply });
  if (sentMsg?.key?.id) botSentIds.add(sentMsg.key.id);
  insertMessage(convo.id, "assistant", reply);
  console.log(`[bot] → ${phone}: "${reply.slice(0, 80)}..."`);
}
