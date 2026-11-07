import { expect, it } from "vitest";
import { handlingSummary } from "./handling-time";

it("averages recorded positive handling durations, not missing values", () => {
  expect(handlingSummary([60, 120, null, undefined, 0, -2, NaN])).toEqual({ n: 2, avg: 90 });
  expect(handlingSummary([null, undefined])).toEqual({ n: 0, avg: null });
});