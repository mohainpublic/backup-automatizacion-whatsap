"use client";

interface Props {
  phone: string | null;
  onDisconnect: () => void;
  activeTab: "chats" | "appointments";
  onTabChange: (tab: "chats" | "appointments") => void;
  attentionCount: number;
}

export default function DashboardHeader({
  phone,
  onDisconnect,
  activeTab,
  onTabChange,
  attentionCount,
}: Props) {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 h-12 shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-semibold text-sm text-gray-100">Agente WhatsApp</span>
        <nav className="flex gap-1">
          <button
            onClick={() => onTabChange("chats")}
            className={`relative px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "chats"
                ? "bg-gray-700 text-gray-100"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Chats
            {attentionCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-gray-900 text-[10px] font-bold leading-none">
                {attentionCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onTabChange("appointments")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "appointments"
                ? "bg-gray-700 text-gray-100"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Citas
          </button>
        </nav>
      </div>

      {attentionCount > 0 && (
        <button
          onClick={() => onTabChange("chats")}
          className="flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-950/60 border border-amber-800/60 hover:bg-amber-950 transition-colors"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <span className="text-xs text-amber-300 font-medium">
            {attentionCount} {attentionCount === 1 ? "chat pendiente" : "chats pendientes"}
          </span>
        </button>
      )}

      <div className="flex items-center gap-3">
        {phone && (
          <span className="text-xs text-emerald-400 font-medium">+{phone}</span>
        )}
        <button
          onClick={onDisconnect}
          className="text-xs px-2 py-1 text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-600 rounded transition-colors"
        >
          Desconectar WA
        </button>
        <button
          onClick={handleLogout}
          className="text-xs px-2 py-1 text-gray-500 hover:text-gray-300 transition-colors"
        >
          Salir
        </button>
      </div>
    </header>
  );
}
