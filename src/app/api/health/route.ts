import { NextResponse } from "next/server";
import { appVersion, databaseOk } from "@/lib/app-info";

export async function GET() {
  if (!databaseOk()) {
    console.error("[mizan] health check failed");
    return NextResponse.json({ status: "error", service: "mizan-books", version: appVersion() }, { status: 500 });
  }
  return NextResponse.json({
    status: "ok",
    service: "mizan-books",
    version: appVersion(),
    timestamp: new Date().toISOString(),
  });
}
