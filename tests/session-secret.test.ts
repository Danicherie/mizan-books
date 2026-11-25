import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertProductionSessionSecret, getSessionSecret } from "../src/lib/session-secret.ts";

const STRONG = "a".repeat(32) + "-unique-test-secret";

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) previous.set(key, process.env[key]);
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("production refuses to start without a strong session secret", () => {
  withEnv({ NODE_ENV: "production", MIZAN_SESSION_SECRET: undefined }, () => {
    assert.throws(() => assertProductionSessionSecret(), /MIZAN_SESSION_SECRET/);
    assert.throws(() => getSessionSecret(), /Refusing to start/);
  });

  for (const published of [
    "mizan-accounting-local-dev-secret-v1",
    "change-me-to-a-64-char-random-secret",
    "replace-with-strong-64-char-random-hex-secret",
    "short-secret",
  ]) {
    withEnv({ NODE_ENV: "production", MIZAN_SESSION_SECRET: published }, () => {
      assert.throws(() => getSessionSecret(), /Refusing to start/);
    });
  }

  withEnv({ NODE_ENV: "production", MIZAN_SESSION_SECRET: STRONG }, () => {
    assert.doesNotThrow(() => assertProductionSessionSecret());
    assert.equal(getSessionSecret(), STRONG);
  });
});

test("development does not fall back to a published phrase", () => {
  withEnv({ NODE_ENV: "development", MIZAN_SESSION_SECRET: undefined }, () => {
    const first = getSessionSecret();
    const second = getSessionSecret();
    assert.equal(first, second);
    assert.equal(first.length >= 32, true);
    assert.equal(first.includes("mizan-accounting-local-dev-secret"), false);
    assert.equal(first.includes("change-me-to-a-64-char-random-secret"), false);
  });
});

test("compose and the login signer do not publish a fallback secret", () => {
  const compose = fs.readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
  const auth = fs.readFileSync(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
  assert.equal(compose.includes("change-me-to-a-64-char-random-secret"), false);
  assert.equal(compose.includes("MIZAN_SESSION_SECRET:?"), true);
  assert.equal(auth.includes("mizan-accounting-local-dev-secret-v1"), false);
  assert.equal(auth.includes("|| \""), false);
});
