import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { requireWrite, userHasCompanyAccess } from "@/lib/api-helpers";

export async function POST(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      billId: number;
      dataUrl: string;
    };
    const db = getDb();
    const bill = db.prepare("SELECT id, company_id, bill_number FROM bills WHERE id = ?").get(body.billId) as
      | { id: number; company_id: number; bill_number: string }
      | undefined;

    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    if (!userHasCompanyAccess(auth.user.id, bill.company_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/.exec(body.dataUrl || "");
    if (!match) {
      return NextResponse.json({ error: "Please upload a valid PNG, JPEG, or WebP receipt image." }, { status: 400 });
    }

    const mime = match[1];
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Receipt image must be under 5MB." }, { status: 400 });
    }

    const baseDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    const receiptDir = path.join(baseDir, "receipts");
    if (!fs.existsSync(receiptDir)) fs.mkdirSync(receiptDir, { recursive: true });

    const filename = `c${bill.company_id}-b${bill.id}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(receiptDir, filename), buffer);

    db.prepare("UPDATE bills SET receipt_filename = ? WHERE id = ?").run(filename, bill.id);
    logAudit(bill.company_id, auth.user.id, "ATTACH_RECEIPT", "BILL", bill.id, `Attached receipt photo to ${bill.bill_number}`);

    return NextResponse.json({ ok: true, filename, url: `/api/receipts/${filename}` });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
