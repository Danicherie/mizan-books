import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { guardCompanyMutation, requireWrite, userHasCompanyAccess } from "@/lib/api-helpers";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";

function detectImage(buf: Buffer): "png" | "jpg" | "webp" | null {
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
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
    const blocked = guardCompanyMutation(auth.user, bill.company_id);
    if (blocked) return blocked;

    const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/.exec(body.dataUrl || "");
    if (!match) {
      return NextResponse.json({ error: "Please upload a valid PNG, JPEG, or WebP receipt image." }, { status: 400 });
    }

    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Receipt image must be under 5MB." }, { status: 400 });
    }
    // Trust the file's own bytes, not the type the browser claimed.
    const ext = detectImage(buffer);
    if (!ext) {
      return NextResponse.json({ error: "Please upload a valid PNG, JPEG, or WebP receipt image." }, { status: 400 });
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
    return clientErrorResponse(err);
  }
}
