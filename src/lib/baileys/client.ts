import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
  proto,
} from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";
import { setConnectionState } from "../db";
import { handleMessage, trackBotSentId } from "./handler";

const AUTH_DIR = path.resolve(process.cwd(), "auth");

export interface BotHandle {
  sock: ReturnType<typeof makeWASocket>;
  shutdown: () => Promise<void>;
}

let handle: BotHandle | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const logger = pino({ level: "silent" });

export async function sendOutbox(phone: string, content: string): Promise<void> {
  if (!handle) throw new Error("Bot no conectado");
  const jid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
  const sentMsg = await handle.sock.sendMessage(jid, { text: content });
  if (sentMsg?.key?.id) trackBotSentId(sentMsg.key.id);
}

export async function start(): Promise<void> {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  let version: [number, number, number] | undefined;
  try {
    const fetched = await fetchLatestBaileysVersion();
    version = fetched.version;
    console.log("[bot] Versión WA Web:", version.join("."));
  } catch (err) {
    console.warn("[bot] No se pudo obtener última versión Baileys:", err);
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    // Requerido para que WhatsApp multi-device entregue mensajes al dispositivo vinculado
    getMessage: async (_key: proto.IMessageKey): Promise<proto.IMessage | undefined> => {
      return { conversation: "" };
    },
  });

  handle = {
    sock,
    shutdown: async () => {
      try { await sock.logout(); } catch {}
      try { sock.end(undefined); } catch {}
    },
  };

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("[bot] QR recibido, guardando en DB...");
      try {
        const { default: qrTerminal } = await import("qrcode-terminal");
        qrTerminal.generate(qr, { small: true });
      } catch {}
      setConnectionState({ status: "qr", qr_string: qr, phone: null });
    }

    if (connection === "connecting") {
      const current = (await import("../db")).getConnectionState();
      if (current.status === "disconnected") {
        setConnectionState({ status: "connecting" });
      }
    }

    if (connection === "open") {
      const rawId = sock.user?.id ?? "";
      const phone = rawId.split(":")[0];
      console.log(`[bot] Conectado como ${phone}`);
      setConnectionState({ status: "connected", qr_string: null, phone });
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })
        ?.output?.statusCode;

      console.log(`[bot] Conexión cerrada, code=${code}`);

      if (code === DisconnectReason.loggedOut) {
        console.log("[bot] Sesión cerrada (loggedOut). Limpiando estado.");
        setConnectionState({ status: "disconnected", qr_string: null, phone: null });
        return;
      }

      scheduleReconnect(code);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`[bot] upsert: type=${type} count=${messages.length}`);
    for (const msg of messages) {
      console.log(`[bot] msg: jid=${msg.key.remoteJid} fromMe=${msg.key.fromMe} fields=${Object.keys(msg.message ?? {}).join(",")}`);
      if (type !== "notify" && !(type === "append" && msg.key.fromMe)) {
        console.log(`[bot] filtrado: type=${type} fromMe=${msg.key.fromMe}`);
        continue;
      }
      try {
        await handleMessage(sock, msg);
      } catch (err) {
        console.error("[bot] Error procesando mensaje:", err);
      }
    }
  });
}

function scheduleReconnect(code: number | undefined) {
  if (reconnectTimer) return;
  const delay = code === 440 ? 15_000 : 5_000;
  console.log(`[bot] Reconectando en ${delay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (handle) {
      try { handle.sock.end(undefined); } catch {}
      handle = null;
    }
    start();
  }, delay);
}
