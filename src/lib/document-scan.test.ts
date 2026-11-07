import { readFileSync } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { parseDocDate, scanDocumentText } from "./document-scan";

const pdfText = async (file: string) => {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(`public/demo/${file}`)));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text);
};

describe("scanning the demo documents", () => {
  it("reads everything the incident report says", async () => {
    const r = scanDocumentText(await pdfText("incident_report_sample.pdf"));
    expect(r.looksLike).toBe("incident_report");
    expect(r.answers).toEqual({
      incident_report: "yes",
      incident_date: "2026-11-06",
      what_happened: expect.stringMatching(
        /^Driver reversed into a concrete bollard.*No third-party property damaged\.$/,
      ),
      claim_kind: "own_damage",
      injury: "no",
      other_party: "no",
      repair_kind: "standard",
    });
    expect(r.findings.injury?.evidence).toBe("Persons injured None");
  });

  it("reads the repair quote: total, itemized, bodywork", async () => {
    const r = scanDocumentText(await pdfText("repair_quote_itemized_sample.pdf"));
    expect(r.looksLike).toBe("quote");
    expect(r.answers).toEqual({
      quote_amount: "980",
      quote_itemized: "yes",
      repair_kind: "standard",
    });
    expect(r.answers.incident_date).toBeUndefined(); // the quote's own date is not the incident date
  });
});

describe("scanning rules", () => {
  it("German police report with another party, injury and disputed fault", () => {
    const r = scanDocumentText(
      [
        "Polizeiinspektion München - Unfallbericht",
        "Aktenzeichen: M-2026-4471",
        "Unfalldatum: 03.11.2026",
        "Versicherungsschein Nr. POL-482913",
        "Unfallgegner: weißer Transporter, Fahrer Herr K.",
        "Verletzte: Beifahrerin leicht verletzt, Krankenwagen vor Ort",
        "Der Unfallgegner bestreitet die Schuld.",
        "Beschreibung: Beim Abbiegen kam es zur Kollision mit dem Transporter.",
      ].join("\n"),
    );
    expect(r.answers).toMatchObject({
      incident_report: "yes",
      incident_date: "2026-11-03",
      policy_number: "POL-482913",
      other_party: "yes",
      injury: "yes",
      fault: "disagree",
    });
    expect(r.answers.what_happened).toMatch(/Kollision mit dem Transporter/);
  });

  it("EV battery quote with only a total", () => {
    const r = scanDocumentText(
      "Kostenvoranschlag Autohaus\nHochvolt-Batterie Austausch komplett\nGesamtbetrag 14.250,00 EUR",
    );
    expect(r.answers).toMatchObject({
      repair_kind: "ev_battery",
      quote_amount: "14250",
      quote_itemized: "no",
    });
  });

  it("theft", () => {
    expect(
      scanDocumentText("Police report\nVehicle stolen from driveway overnight").answers.claim_kind,
    ).toBe("theft");
  });

  it("never fills in name, email or plate, but notes them", () => {
    const r = scanDocumentText(
      "Repair quote\nCustomer: Anna Schmidt\nanna123@gmail.com\nVehicle M-AN 2735\nTotal 500.00",
    );
    expect(r.answers).not.toHaveProperty("name");
    expect(r.answers).not.toHaveProperty("email");
    expect(r.answers).not.toHaveProperty("plate");
    expect(r.seen).toEqual({
      name: "Anna Schmidt",
      email: "anna123@gmail.com",
      plate: "M-AN 2735",
    });
  });

  it("finds nothing in an unrelated document", () => {
    expect(scanDocumentText("Grocery list\nMilk\nBread").answers).toEqual({});
  });

  it.each([
    ["06 Nov 2026", "2026-11-06"],
    ["6. November 2026", "2026-11-06"],
    ["06.11.2026", "2026-11-06"],
    ["2026-11-06", "2026-11-06"],
    ["no date", null],
  ])("date %s", (s, iso) => expect(parseDocDate(s)).toBe(iso));
});
