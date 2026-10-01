"use client";

interface Props {
  conversationId: number;
  mode: "AI" | "HUMAN";
  onChanged: (newMode: "AI" | "HUMAN") => void;
}

export default function ModeToggle({ conversationId, mode, onChanged }: Props) {
  async function toggle() {
    const next = mode === "AI" ? "HUMAN" : "AI";
    await fetch(`/api/mode/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    onChanged(next);
  }

  const isAI = mode === "AI";

  return (
    <div className="flex items-center gap-2 select-none">
      <span
        className={`text-xs font-semibold transition-colors duration-200 ${
          isAI ? "text-emerald-400" : "text-gray-500"
        }`}
      >
        IA
      </span>

      <button
        onClick={toggle}
        aria-label={`Modo actual: ${isAI ? "IA" : "Humano"}. Click para cambiar.`}
        className={`relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 ${
          isAI
            ? "bg-emerald-600 focus-visible:ring-emerald-500"
            : "bg-amber-600 focus-visible:ring-amber-500"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300 ease-in-out ${
            isAI ? "translate-x-0" : "translate-x-[1.25rem]"
          }`}
        />
      </button>

      <span
        className={`text-xs font-semibold transition-colors duration-200 ${
          !isAI ? "text-amber-400" : "text-gray-500"
        }`}
      >
        Humano
      </span>
    </div>
  );
}
