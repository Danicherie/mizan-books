import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAuth, userHasCompanyAccess } from "@/lib/api-helpers";

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { filename } = await context.params;
  const safeName = path.basename(filename);
  const compMatch = /^c(\d+)-/.exec(safeName);
  if (!compMatch) {
    return NextResponse.json({ error: "Invalid receipt" }, { status: 400 });
  }
  const companyId = Number(compMatch[1]);
  if (!userHasCompanyAccess(auth.user.id, companyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const baseDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const fullPath = path.join(baseDir, "receipts", safeName);
  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const ext = path.extname(safeName).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const fileBuffer = fs.readFileSync(fullPath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}
