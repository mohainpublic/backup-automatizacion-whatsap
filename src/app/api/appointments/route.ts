import { NextResponse } from "next/server";
import { listUpcomingAppointments } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const appointments = await listUpcomingAppointments(30);
    return NextResponse.json(appointments);
  } catch (err) {
    console.error("[api/appointments] Error:", err);
    return NextResponse.json(
      { error: "Error al obtener citas. Verifica la configuración de Google Calendar." },
      { status: 500 }
    );
  }
}
