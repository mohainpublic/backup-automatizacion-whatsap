"use client";

import { useEffect, useState } from "react";

interface Appointment {
  id: string;
  summary: string;
  start: string;
  end: string;
  description: string | null;
}

export default function AppointmentPanel() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/appointments");
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error desconocido");
        return;
      }
      setAppointments(await res.json());
      setError(null);
    } catch {
      setError("No se pudo conectar con Google Calendar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000); // refrescar cada 30s
    return () => clearInterval(interval);
  }, []);

  async function handleCancel(eventId: string) {
    await fetch(`/api/appointments/${eventId}`, { method: "DELETE" });
    setConfirmCancel(null);
    await load();
  }

  function formatDt(iso: string) {
    return new Date(iso).toLocaleString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Citas próximas
        </h2>
        <button
          onClick={load}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Actualizar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-6 text-center text-gray-600 text-sm">Cargando citas...</div>
        )}
        {error && (
          <div className="p-4 m-4 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}
        {!loading && !error && appointments.length === 0 && (
          <div className="p-6 text-center text-gray-600 text-sm">
            No hay citas próximas.
          </div>
        )}
        {appointments.map((apt) => (
          <div
            key={apt.id}
            className="px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/30"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-100 truncate">{apt.summary}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDt(apt.start)}</p>
                {apt.description && (
                  <p className="text-xs text-gray-600 mt-0.5 truncate">{apt.description}</p>
                )}
              </div>
              <button
                onClick={() => setConfirmCancel(apt.id)}
                className="text-xs text-red-400 hover:text-red-300 shrink-0 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmCancel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-100 mb-2">Cancelar cita</h3>
            <p className="text-sm text-gray-400 mb-4">
              Esta acción borrará la cita del Google Calendar. El cliente NO recibe
              notificación automática — avísale por WhatsApp si es necesario.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmCancel(null)}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Volver
              </button>
              <button
                onClick={() => handleCancel(confirmCancel)}
                className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
              >
                Cancelar cita
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
