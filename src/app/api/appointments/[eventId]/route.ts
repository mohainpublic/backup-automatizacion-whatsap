import { NextRequest, NextResponse } from "next/server";
import { cancelAppointment } from "@/lib/calendar";

interface Ctx {
  params: Promise<{ eventId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { eventId } = await params;
  try {
    await cancelAppointment(eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/appointments/delete] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
