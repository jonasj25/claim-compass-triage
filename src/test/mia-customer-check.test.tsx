import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { findCustomer } from "@/lib/customers";
import { REGISTERED_CUSTOMERS } from "@/lib/customers.server";
import { Route as ReportRoute } from "@/routes/report";

vi.mock("@tanstack/react-router", async (orig) => {
  const mod = await orig<typeof import("@tanstack/react-router")>();
  return { ...mod, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
// The server check, run locally against the same list
vi.mock("@/lib/customers.functions", () => ({
  verifyCustomer: async ({ data }: { data: { name: string; email: string } }) => {
    const c = findCustomer(REGISTERED_CUSTOMERS, data.name, data.email);
    return c ? { registered: true, ...c } : { registered: false };
  },
}));
vi.mock("@/lib/voice.functions", () => ({
  voiceStatus: async () => ({ elevenlabs: false }),
  speakText: async () => ({ audio: null }),
  transcribeAudio: async () => ({ text: null }),
}));
vi.mock("@/lib/report.functions", () => ({ submitClaimReport: vi.fn(), addClaimInfo: vi.fn() }));

const Page = ReportRoute.options.component as React.ComponentType;
Element.prototype.scrollTo = () => undefined; // not in jsdom
const say = (text: string) => {
  fireEvent.change(screen.getByPlaceholderText(/Type your answer here/), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};

describe("Mia checks the customer before the claim", () => {
  it("asks for name and email first, then continues for a registered customer", async () => {
    render(<Page />);
    say("John");
    await waitFor(() =>
      expect(screen.getByText(/First I need to check that you're registered/)).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.getByText("Thanks. Which email can we reach you at?")).toBeTruthy(),
    );
    say("John123@gmail.com");
    await waitFor(() =>
      expect(
        screen.getByText(/Thanks, John, I've found your customer account\. What happened\?/),
      ).toBeTruthy(),
    );
  });

  it("does not continue for someone who is not registered", async () => {
    render(<Page />);
    say("Peter");
    await waitFor(() =>
      expect(screen.getByText("Thanks. Which email can we reach you at?")).toBeTruthy(),
    );
    say("peter@gmail.com");
    await waitFor(() =>
      expect(
        screen.getByText(/I couldn't find a customer account with that name and email/),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/What happened\?/)).toBeNull();
    // Claim details are not taken before the check passes
    say("Someone hit my parked car yesterday and the bumper is damaged");
    await waitFor(() =>
      expect(
        screen.getAllByText(/Sorry, I didn't quite catch that\. What's your full name\?/).length,
      ).toBe(1),
    );
  });
});
