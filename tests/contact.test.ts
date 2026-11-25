import assert from "node:assert/strict";
import test from "node:test";
import { getDb } from "../src/lib/db.ts";
import { publicContactEmail } from "../src/lib/contact.ts";
import { createOperatorSessionToken } from "../src/lib/operator-auth.ts";
import { CONTACT_LIMIT, resetRateLimitsForTests } from "../src/lib/rate-limit.ts";
import { setEnv, useTempDatabase } from "./helpers.ts";

const SECRET = "test-secret-that-is-long-enough-for-sessions";
const OPERATOR = "correct-horse-battery";

function post(pathname: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      host: "localhost",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function validMessage(extra: Record<string, unknown> = {}) {
  return { name: "Hana Bekele", email: "hana@example.com", message: "Please subscribe Horizon Trading.", ...extra };
}

test("public contact email is shown only when it is one address", () => {
  assert.equal(publicContactEmail(undefined), "");
  assert.equal(publicContactEmail(""), "");
  assert.equal(publicContactEmail("not an email"), "");
  assert.equal(publicContactEmail("one@example.com two@example.com"), "");
  assert.equal(publicContactEmail("hello@mizanbooks.tech"), "hello@mizanbooks.tech");
});

test("contact form validates, rate limits, ignores the honeypot, and the operator list requires auth", async () => {
  const env = useTempDatabase();
  resetRateLimitsForTests();
  setEnv("MIZAN_SESSION_SECRET", SECRET);
  setEnv("OPERATOR_PASSWORD", OPERATOR);
  try {
    const { POST } = await import("../src/app/api/contact/route.ts");
    const { GET, POST: adminPost } = await import("../src/app/api/admin/messages/route.ts");

    const blocked = await POST(
      new Request("http://localhost/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.test", host: "localhost" },
        body: JSON.stringify(validMessage()),
      })
    );
    assert.equal(blocked.status, 403);

    const missing = await POST(post("/api/contact", { name: " ", email: "bad", message: "" }));
    assert.equal(missing.status, 400);

    const tooLong = await POST(post("/api/contact", validMessage({ message: "x".repeat(4001) })));
    assert.equal(tooLong.status, 400);

    const longName = await POST(post("/api/contact", validMessage({ name: "n".repeat(121) })));
    assert.equal(longName.status, 400);

    const honeypot = await POST(post("/api/contact", validMessage({ website: "https://spam.test" })));
    assert.equal(honeypot.status, 200);
    const afterHoney = getDb().prepare("SELECT COUNT(*) AS c FROM contact_messages").get() as { c: number };
    assert.equal(afterHoney.c, 0);

    const first = await POST(post("/api/contact", validMessage(), { "x-forwarded-for": "203.0.113.10" }));
    assert.equal(first.status, 200);
    const second = await POST(
      post("/api/contact", validMessage({ name: "Later Writer", email: "later@example.com", message: "Second note." }), {
        "x-forwarded-for": "203.0.113.10",
      })
    );
    assert.equal(second.status, 200);

    const anonymous = await GET(new Request("http://localhost/api/admin/messages"));
    assert.equal(anonymous.status, 401);

    const forged = await GET(
      new Request("http://localhost/api/admin/messages", { headers: { cookie: "mizan_operator=not-a-session" } })
    );
    assert.equal(forged.status, 401);

    const token = createOperatorSessionToken();
    const cookie = `mizan_operator=${token}`;
    const listed = await GET(new Request("http://localhost/api/admin/messages", { headers: { cookie } }));
    assert.equal(listed.status, 200);
    const body = (await listed.json()) as { messages: Array<{ id: number; name: string; read_at: string | null }> };
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0].name, "Later Writer");
    assert.equal(body.messages[1].name, "Hana Bekele");
    assert.equal(body.messages[0].read_at, null);

    const marked = await adminPost(
      post("/api/admin/messages", { action: "mark_read", id: body.messages[0].id }, { cookie })
    );
    assert.equal(marked.status, 200);
    const readRow = getDb().prepare("SELECT read_at FROM contact_messages WHERE id = ?").get(body.messages[0].id) as {
      read_at: string | null;
    };
    assert.ok(readRow.read_at);

    const removed = await adminPost(
      post("/api/admin/messages", { action: "delete", id: body.messages[1].id }, { cookie })
    );
    assert.equal(removed.status, 200);
    const left = getDb().prepare("SELECT COUNT(*) AS c FROM contact_messages").get() as { c: number };
    assert.equal(left.c, 1);

    const migrated = getDb().prepare("SELECT id FROM schema_migrations WHERE id = ?").get("2026_11_25_contact_messages");
    assert.ok(migrated);

    for (let attempt = 0; attempt < CONTACT_LIMIT - 2; attempt += 1) {
      const extra = await POST(
        post("/api/contact", validMessage({ message: `note ${attempt}` }), { "x-forwarded-for": "203.0.113.10" })
      );
      assert.equal(extra.status, 200);
    }
    const limited = await POST(
      post("/api/contact", validMessage({ message: "one too many" }), { "x-forwarded-for": "203.0.113.10" })
    );
    assert.equal(limited.status, 429);

    setEnv("OPERATOR_PASSWORD", undefined);
    const disabled = await GET(new Request("http://localhost/api/admin/messages", { headers: { cookie } }));
    assert.equal(disabled.status, 401);
  } finally {
    resetRateLimitsForTests();
    env.restore();
    setEnv("MIZAN_SESSION_SECRET", undefined);
    setEnv("OPERATOR_PASSWORD", undefined);
  }
});
