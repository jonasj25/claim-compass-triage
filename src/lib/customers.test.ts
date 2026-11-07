import { describe, expect, it } from "vitest";
import { findCustomer, normalizeEmail, samePlate, sameName } from "./customers";
import { REGISTERED_CUSTOMERS } from "./customers.server";

describe("registered customers", () => {
  it("holds John, Anna and Marko, each with a licence plate", () => {
    expect(REGISTERED_CUSTOMERS.map((c) => [c.name, c.plate])).toEqual([
      ["John", "M-JO 4821"],
      ["Anna", "M-AN 2735"],
      ["Marko", "M-MK 9164"],
    ]);
  });

  it.each([
    ["John", "John123@gmail.com"],
    ["john", "john123@gmail.com"],
    ["Anna Schmidt", " anna123@GMAIL.com "],
    ["My name is Marko", "marko one two three at gmail dot com"],
  ])("finds %s / %s", (name, email) => {
    expect(findCustomer(REGISTERED_CUSTOMERS, name, email)).not.toBeNull();
  });

  it("returns the address as registered", () => {
    expect(findCustomer(REGISTERED_CUSTOMERS, "John", "JOHN123@gmail.com")?.email).toBe(
      "john123@gmail.com",
    );
  });

  it.each([
    ["John", "anna123@gmail.com", "name and email of different customers"],
    ["Johnny", "john123@gmail.com", "different name"],
    ["John", "john124@gmail.com", "different email"],
    ["Peter", "peter@gmail.com", "not registered"],
    ["", "john123@gmail.com", "no name"],
    ["John", "", "no email"],
  ])("rejects %s / %s (%s)", (name, email) => {
    expect(findCustomer(REGISTERED_CUSTOMERS, name, email)).toBeNull();
  });

  it("reads spoken emails", () => {
    expect(normalizeEmail("Anna one two three at gmail dot com")).toBe("anna123@gmail.com");
    expect(normalizeEmail("marko123 ät gmail punkt com")).toBe("marko123@gmail.com");
  });

  it("matches a full registered name only in full", () => {
    expect(sameName("Anna Schmidt", "Anna Schmidt")).toBe(true);
    expect(sameName("Anna Schmidt", "Anna")).toBe(false);
  });

  it("compares plates however they are written or said", () => {
    expect(samePlate("M-JO 4821", "m jo 4821")).toBe(true);
    expect(samePlate("M-JO 4821", "MJO4821")).toBe(true);
    expect(samePlate("M-JO 4821", "M JO four eight two one")).toBe(true);
    expect(samePlate("M-JO 4821", "M-AN 2735")).toBe(false);
    expect(samePlate("M-JO 4821", "")).toBe(false);
  });
});
