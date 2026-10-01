"use client";

import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import ModeToggle from "./ModeToggle";

interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "human";
  content: string;
  created_at: number;
}

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
}

interface Props {
  conversation: Conversation;
  onModeChanged: (id: number, mode: "AI" | "HUMAN") => void;
  onDeleted: (id: number) => void;
}

export default function ConversationPanel({ conversation, onModeChanged, onDeleted }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<"AI" | "HUMAN">(conversation.mode);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMode(conversation.mode);
    loadMessages();
  }, [conversation.id]);

  // Solo hace scroll cuando llega un mensaje nuevo (no en cada poll)
  const lastMsgId = messages[messages.length - 1]?.id ?? 0;
  useEffect(() => {
    if (lastMsgId > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lastMsgId]);

  async function loadMessages() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/messages/${conversation.id}`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data: Message[] = await res.json();
      setMessages(data);
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error(e);
    }
  }

  // Polling cada 2s para mensajes nuevos
  useEffect(() => {
    const interval = setInterval(loadMessages, 2_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [conversation.id]);

  async function handleModeChange(newMode: "AI" | "HUMAN") {
    setMode(newMode);
    onModeChanged(conversation.id, newMode);
  }

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    await fetch(`/api/messages/${conversation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    await loadMessages();
    setSending(false);
  }

  async function handleDelete() {
    await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
    setConfirmDelete(false);
    onDeleted(conversation.id);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header del panel */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
        <div>
          <p className="font-semibold text-gray-100 text-sm">
            {conversation.name ?? conversation.phone}
          </p>
          <p className="text-xs text-gray-500">{conversation.phone}</p>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle
            conversationId={conversation.id}
            mode={mode}
            onChanged={handleModeChange}
          />
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs px-2 py-1 rounded text-red-400 hover:bg-red-900/30 transition-colors"
          >
            Borrar
          </button>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            role={m.role}
            content={m.content}
            createdAt={m.created_at}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="px-4 py-3 border-t border-gray-800">
        {mode === "AI" ? (
          <div className="text-center text-xs text-gray-600 py-2">
            El bot responde automáticamente. Cambia a Modo Humano para escribir.
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Escribe un mensaje..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-600 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Enviar
            </button>
          </div>
        )}
      </div>

      {/* Modal confirmación borrar */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-100 mb-2">Borrar conversación</h3>
            <p className="text-sm text-gray-400 mb-4">
              Se eliminarán todos los mensajes de {conversation.name ?? conversation.phone}.
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
