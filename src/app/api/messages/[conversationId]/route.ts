import { NextRequest, NextResponse } from "next/server";
import {
  getMessages,
  getConversationById,
  insertMessage,
  enqueueOutbox,
} from "@/lib/db";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const messages = getMessages(id, 100);
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const conv = getConversationById(id);
  if (!conv) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const content: string = body.content?.toString().trim();
  if (!content) return NextResponse.json({ error: "Contenido vacío" }, { status: 400 });

  // Guardar visible en el dashboard inmediatamente
  const msg = insertMessage(id, "human", content);

  // Encolar para que el proceso bot lo envíe vía Baileys
  enqueueOutbox(id, conv.phone, content);

  return NextResponse.json({ ok: true, messageId: msg.id });
}
