"use client";

import { useEffect, useState } from "react";

type ConnectionStatus = "disconnected" | "qr" | "connecting" | "connected";

interface StatusResponse {
  status: ConnectionStatus;
  qrPng?: string;
  phone?: string;
  updatedAt?: number;
}

interface Props {
  onConnected: (phone: string) => void;
}

export default function QRScreen({ onConnected }: Props) {
  const [data, setData] = useState<StatusResponse>({ status: "disconnected" });
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => setElapsed((e) => e + 1);
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch("/api/connection/status");
          const json: StatusResponse = await res.json();
          setData(json);
          if (json.status === "connected" && json.phone) {
            onConnected(json.phone);
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }

    poll();
    return () => { cancelled = true; };
  }, [onConnected]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-semibold text-gray-100">Conectar número</h1>
          <button
            onClick={handleLogout}
            className="text-xs px-2 py-1 text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-600 rounded transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Escanea el QR con WhatsApp en tu teléfono
        </p>

        {data.status === "qr" && data.qrPng ? (
          <>
            <img
              src={data.qrPng}
              alt="QR de WhatsApp"
              className="w-64 h-64 mx-auto rounded-xl bg-white p-2"
            />
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-sm text-amber-400">Esperando escaneo...</span>
            </div>
          </>
        ) : data.status === "connecting" ? (
          <div className="flex items-center justify-center gap-2 py-16">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-sm text-blue-400">Conectando...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
            <span className="text-sm text-gray-500">Esperando al bot...</span>
            {elapsed > 10 && (
              <p className="text-xs text-red-400 mt-2 max-w-xs">
                El proceso bot no responde. Ejecuta{" "}
                <code className="bg-gray-800 px-1 rounded">npm run start:bot</code> en otra
                terminal.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-gray-600 mt-4">
          WhatsApp → Dispositivos vinculados → Vincular dispositivo
        </p>
      </div>
    </div>
  );
}
