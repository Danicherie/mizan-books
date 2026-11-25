import assert from "node:assert/strict";
import test from "node:test";
import { fromMinor, minorToString, mulMinor, percentOfMinor, toMinor } from "../src/lib/money.ts";

test("converts decimal money to exact minor units, including binary fractions", () => {
  assert.equal(toMinor("10.10"), 1010);
  assert.equal(toMinor(10.1), 1010);
  assert.equal(toMinor(0.1 + 0.2), 30);
  assert.equal(toMinor("1.005"), 101);
  assert.equal(toMinor(-10.1), -1010);
  assert.equal(fromMinor(1010), 10.1);
  assert.equal(fromMinor(toMinor("598900")), 598900);
  assert.equal(minorToString(1010), "10.10");
  assert.equal(minorToString(-1), "-0.01");
});

test("multiplies and takes percentages in minor units without a one-cent drift", () => {
  assert.equal(mulMinor(toMinor(2800), 124.5), toMinor(348600));
  assert.equal(percentOfMinor(toMinor(530000), 15), toMinor(79500));
  assert.equal(mulMinor(toMinor(10.1), 3), toMinor(30.3));
  assert.equal(fromMinor(toMinor(0.1) + toMinor(0.2)), 0.3);
});
