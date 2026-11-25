import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { sessionIssuedAtFresh } from "../src/lib/auth.ts";
import { isSignupEnabled } from "../src/lib/http.ts";
import { originAllowed } from "../src/lib/origin.ts";
import {
  createOperatorSessionToken,
  operatorConfigProblem,
  operatorPasswordMatches,
  verifyOperatorSessionToken,
} from "../src/lib/operator-auth.ts";
import { LOGIN_LIMIT, resetRateLimitsForTests } from "../src/lib/rate-limit.ts";
import { userPasswordProblem } from "../src/lib/passwords.ts";
import { setEnv, useTempDatabase } from "./helpers.ts";

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

test("session age, password length, and signup switch", () => {
  const now = Date.now();
  assert.equal(sessionIssuedAtFresh(now, now), true);
  assert.equal(sessionIssuedAtFresh(now - 31 * 24 * 60 * 60 * 1000, now), false);
  assert.equal(sessionIssuedAtFresh(now + 5 * 60_000, now), false);
  assert.equal(userPasswordProblem("short"), "Password must be at least 8 characters.");
  assert.match(userPasswordProblem("password123") || "", /sample/);
  assert.equal(userPasswordProblem("a-real-password"), null);

  setEnv("SIGNUP_ENABLED", undefined);
  assert.equal(isSignupEnabled(), true);
  setEnv("SIGNUP_ENABLED", "false");
  assert.equal(isSignupEnabled(), false);
  setEnv("SIGNUP_ENABLED", "true");
  assert.equal(isSignupEnabled(), true);
  setEnv("SIGNUP_ENABLED", undefined);
});

test("origin checks follow ALLOWED_ORIGIN and allow bearer clients", () => {
  assert.equal(
    originAllowed({ method: "POST", origin: "https://evil.test", host: "books.example", allowedOrigin: "https://books.example" }),
    false
  );
  assert.equal(
    originAllowed({ method: "POST", origin: "https://books.example", host: "internal:3000", allowedOrigin: "https://books.example" }),
    true
  );
  assert.equal(
    originAllowed({ method: "POST", origin: "http://localhost:3000", host: "localhost:3000", allowedOrigin: "*" }),
    true
  );
  assert.equal(originAllowed({ method: "POST", origin: null, host: "localhost", allowedOrigin: "*" }), false);
  assert.equal(
    originAllowed({
      method: "POST",
      origin: null,
      host: "localhost",
      authorization: "Bearer abc",
      allowedOrigin: "https://books.example",
    }),
    true
  );
  assert.equal(originAllowed({ method: "GET", origin: null, host: "localhost" }), true);
});

test("operator password is constant-time compared and the session expires", () => {
  setEnv("OPERATOR_PASSWORD", undefined);
  setEnv("MIZAN_SESSION_SECRET", "test-secret-that-is-long-enough-for-sessions");
  assert.equal(operatorConfigProblem(), "unset");
  assert.equal(operatorPasswordMatches("anything-at-all"), false);

  setEnv("OPERATOR_PASSWORD", "short");
  assert.equal(operatorConfigProblem(), "short");
  assert.equal(operatorPasswordMatches("short"), false);

  setEnv("OPERATOR_PASSWORD", "correct-horse-battery");
  assert.equal(operatorConfigProblem(), null);
  assert.equal(operatorPasswordMatches("correct-horse-battery"), true);
  assert.equal(operatorPasswordMatches("correct-horse-battery-nope"), false);
  assert.equal(operatorPasswordMatches(""), false);

  const now = Date.now();
  const token = createOperatorSessionToken(now);
  assert.equal(verifyOperatorSessionToken(token, now + 1000), true);
  assert.equal(verifyOperatorSessionToken(token, now + 5 * 60 * 60 * 1000), false);
  assert.equal(verifyOperatorSessionToken(`${token}x`, now), false);
  const userShaped = Buffer.from(JSON.stringify({ uid: 1, iat: now })).toString("base64url");
  assert.equal(verifyOperatorSessionToken(`${userShaped}.abcd`, now), false);

  setEnv("OPERATOR_PASSWORD", undefined);
  setEnv("MIZAN_SESSION_SECRET", undefined);
});

test("login and signup are rate limited and public signup can be turned off", async () => {
  const env = useTempDatabase();
  resetRateLimitsForTests();
  try {
    const { POST: login } = await import("../src/app/api/auth/login/route.ts");
    const blockedOrigin = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.test", host: "localhost" },
        body: JSON.stringify({ email: "a@b.co", password: "whatever-password" }),
      })
    );
    assert.equal(blockedOrigin.status, 403);

    for (let attempt = 0; attempt < LOGIN_LIMIT; attempt += 1) {
      const res = await login(post("/api/auth/login", { email: "missing@example.com", password: "not-the-password" }));
      assert.equal(res.status, 401);
    }
    const limited = await login(post("/api/auth/login", { email: "missing@example.com", password: "not-the-password" }));
    assert.equal(limited.status, 429);

    setEnv("SIGNUP_ENABLED", "false");
    const { POST: signup } = await import("../src/app/api/auth/signup/route.ts");
    const closed = await signup(post("/api/auth/signup", { name: "A", email: "a@example.com", password: "long-enough", company_name: "Co" }));
    assert.equal(closed.status, 403);
    const closedBody = (await closed.json()) as { code?: string };
    assert.equal(closedBody.code, "SIGNUP_DISABLED");
  } finally {
    resetRateLimitsForTests();
    env.restore();
  }
});

test("every mutating API route checks the request origin", () => {
  const root = path.join(process.cwd(), "src/app/api");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) files.push(full);
    }
  };
  walk(root);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (!/export async function (POST|PATCH|PUT|DELETE)/.test(source)) continue;
    assert.match(source, /assertMutationOrigin/, file);
  }
});
