"use client";

import { useEffect, useState } from "react";
import QRScreen from "./QRScreen";
import DashboardHeader from "./DashboardHeader";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";
import AppointmentPanel from "./AppointmentPanel";

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  last_message_at: number | null;
  last_message_preview: string | null;
}

type Tab = "chats" | "appointments";

export default function ConnectionGate() {
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("chats");

  // Comprobar estado inicial al montar
  useEffect(() => {
    fetch("/api/connection/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.status === "connected" && d.phone) {
          setPhone(d.phone);
          setConnected(true);
        }
      })
      .catch(() => {});
  }, []);

  // Polling de conversaciones cuando está conectado
  useEffect(() => {
    if (!connected) return;
    loadConversations();
    const id = setInterval(loadConversations, 2_000);
    return () => clearInterval(id);
  }, [connected]);

  async function loadConversations() {
    const res = await fetch("/api/conversations");
    const data: Conversation[] = await res.json();
    setConversations(data);
  }

  function handleConnected(p: string) {
    setPhone(p);
    setConnected(true);
  }

  async function handleDisconnect() {
    await fetch("/api/connection/disconnect", { method: "POST" });
    setConnected(false);
    setPhone(null);
    setSelectedId(null);
    setConversations([]);
  }

  function handleModeChanged(id: number, mode: "AI" | "HUMAN") {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, mode } : c))
    );
  }

  function handleDeleted(id: number) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setSelectedId(null);
  }

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;
  const attentionCount = conversations.filter((c) => c.mode === "HUMAN").length;

  if (!connected) {
    return <QRScreen onConnected={handleConnected} />;
  }

  return (
    <div className="flex flex-col h-screen">
      <DashboardHeader
        phone={phone}
        onDisconnect={handleDisconnect}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        attentionCount={attentionCount}
      />

      {activeTab === "chats" ? (
        <div className="flex flex-1 min-h-0">
          {/* Sidebar conversaciones */}
          <div className="w-72 shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col">
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          {/* Panel principal */}
          <div className="flex-1 min-w-0 bg-gray-950">
            {selectedConv ? (
              <ConversationPanel
                conversation={selectedConv}
                onModeChanged={handleModeChanged}
                onDeleted={handleDeleted}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-600 text-sm">
                Selecciona una conversación para verla
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 max-w-2xl mx-auto w-full">
          <AppointmentPanel />
        </div>
      )}
    </div>
  );
}
