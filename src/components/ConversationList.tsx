"use client";

import { useState } from "react";

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  last_message_at: number | null;
  last_message_preview: string | null;
}

interface Props {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

type Filter = "all" | "attention";

function relativeTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

export default function ConversationList({ conversations, selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const attentionCount = conversations.filter((c) => c.mode === "HUMAN").length;
  const filtered =
    filter === "attention"
      ? conversations.filter((c) => c.mode === "HUMAN")
      : conversations;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Cabecera con filtros */}
      <div className="px-3 pt-3 pb-0 border-b border-gray-800 shrink-0">
        <div className="flex gap-1 mb-0">
          <button
            onClick={() => setFilter("all")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
              filter === "all"
                ? "bg-gray-800 text-gray-100"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Todos
            <span className="ml-1.5 text-gray-500 font-normal">
              {conversations.length}
            </span>
          </button>

          <button
            onClick={() => setFilter("attention")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-t-md transition-colors flex items-center justify-center gap-1.5 ${
              filter === "attention"
                ? "bg-amber-950/80 text-amber-300"
                : "text-gray-500 hover:text-amber-400"
            }`}
          >
            {attentionCount > 0 && filter !== "attention" && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
            )}
            Atención
            {attentionCount > 0 && (
              <span
                className={`text-xs font-semibold px-1.5 py-0.5 rounded-full leading-none ${
                  filter === "attention"
                    ? "bg-amber-800 text-amber-200"
                    : "bg-amber-900/60 text-amber-400"
                }`}
              >
                {attentionCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Banner informativo cuando hay chats en espera */}
      {attentionCount > 0 && filter === "all" && (
        <button
          onClick={() => setFilter("attention")}
          className="mx-3 mt-2 mb-1 shrink-0 flex items-center gap-2 bg-amber-950/50 border border-amber-800/60 rounded-lg px-3 py-2 text-left hover:bg-amber-950/80 transition-colors group"
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          <span className="text-xs text-amber-300 font-medium leading-tight">
            {attentionCount} {attentionCount === 1 ? "chat necesita" : "chats necesitan"} atención humana
          </span>
          <span className="ml-auto text-amber-600 group-hover:text-amber-400 text-xs">ver →</span>
        </button>
      )}

      {/* Lista de conversaciones */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8 gap-2">
            {filter === "attention" ? (
              <>
                <span className="text-2xl">✓</span>
                <p className="text-gray-500 text-sm">Sin chats pendientes de atención</p>
              </>
            ) : (
              <p className="text-gray-600 text-sm">
                Aún no hay conversaciones. Cuando alguien escriba al número de WhatsApp aparecerá aquí.
              </p>
            )}
          </div>
        )}

        {filtered.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors hover:bg-gray-800/60 ${
              selectedId === conv.id ? "bg-gray-800" : ""
            } ${conv.mode === "HUMAN" ? "border-l-2 border-l-amber-600" : "border-l-2 border-l-transparent"}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                {conv.mode === "HUMAN" && (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                  </span>
                )}
                <span className="font-medium text-sm text-gray-100 truncate">
                  {conv.name ?? conv.phone}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    conv.mode === "AI"
                      ? "bg-emerald-900/60 text-emerald-400"
                      : "bg-amber-900/60 text-amber-400"
                  }`}
                >
                  {conv.mode === "AI" ? "IA" : "Humano"}
                </span>
                <span className="text-xs text-gray-500">
                  {relativeTime(conv.last_message_at)}
                </span>
              </div>
            </div>
            {conv.last_message_preview && (
              <p className="text-xs text-gray-500 truncate pl-4">{conv.last_message_preview}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
