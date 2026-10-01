// env-loader DEBE ser el primer import — ES modules se hoistean
import "./env-loader";

import path from "node:path";
import fs from "node:fs";
import { start, sendOutbox } from "../src/lib/baileys/client";
import { getPendingOutbox, markOutboxSent, setConnectionState } from "../src/lib/db";

const RESTART_FLAG = path.resolve(process.cwd(), "data", ".restart");
const AUTH_DIR = path.resolve(process.cwd(), "auth");

async function main() {
  console.log("[bot] Arrancando agente WhatsApp...");
  setConnectionState({ status: "disconnected", qr_string: null, phone: null });

  await start();

  // Outbox poll — envía mensajes humanos del dashboard cada 2s
  setInterval(async () => {
    const pending = getPendingOutbox(20);
    if (!pending.length) return;

    for (const item of pending) {
      try {
        await sendOutbox(item.phone, item.content);
        markOutboxSent(item.id);
        console.log(
          `[bot] Outbox enviado a ${item.phone}: "${item.content.slice(0, 60)}"`
        );
      } catch (err) {
        console.error(`[bot] Error enviando outbox id=${item.id}:`, err);
      }
    }
  }, 2_000);

  // Restart flag poll — desconexión manual desde el dashboard
  setInterval(() => {
    if (!fs.existsSync(RESTART_FLAG)) return;
    console.log("[bot] Flag de restart detectado. Reiniciando...");
    try { fs.unlinkSync(RESTART_FLAG); } catch {}
    try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
    process.exit(0); // concurrently reinicia el proceso
  }, 1_000);
}

main().catch((err) => {
  console.error("[bot] Error fatal:", err);
  process.exit(1);
});
