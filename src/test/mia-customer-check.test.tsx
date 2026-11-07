import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { findCustomer, samePlate } from "@/lib/customers";
import { REGISTERED_CUSTOMERS } from "@/lib/customers.server";
import { Route as ReportRoute } from "@/routes/report";

vi.mock("@tanstack/react-router", async (orig) => {
  const mod = await orig<typeof import("@tanstack/react-router")>();
  return { ...mod, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
// The server check, run locally against the same list
vi.mock("@/lib/customers.functions", () => ({
  verifyCustomer: async ({ data }: { data: { name: string; email: string; plate?: string } }) => {
    const c = findCustomer(REGISTERED_CUSTOMERS, data.name, data.email);
    if (!c) return { registered: false };
    return {
      registered: true,
      name: c.name,
      email: c.email,
      ...(data.plate !== undefined ? { plateMatches: samePlate(c.plate, data.plate) } : {}),
    };
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
        screen.getByText(
          /I've found your customer account\. What's the number plate of your car\?/,
        ),
      ).toBeTruthy(),
    );
    say("M-AN 2735");
    await waitFor(() =>
      expect(screen.getByText(/doesn't match the car registered to your account/)).toBeTruthy(),
    );
    expect(screen.queryByText(/What happened\?/)).toBeNull();
    say("M JO 4821");
    await waitFor(() =>
      expect(
        screen.getByText(/Thanks, that matches the car on your account\. What happened\?/),
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

describe("the written form checks the customer too", () => {
  const typeIn = (value: string) => {
    fireEvent.change(document.querySelector("main input") as HTMLInputElement, {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  };

  it("stops at the email question for an unregistered customer", async () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: /form|type|write/i }));
    typeIn("John");
    await waitFor(() => expect(screen.getByText("Which email can we reach you at?")).toBeTruthy());
    typeIn("anna123@gmail.com");
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/couldn't find a registered customer/),
    );
    expect(screen.getByText("Which email can we reach you at?")).toBeTruthy();
  });

  it("asks for the plate itself and only continues when it matches the registered car", async () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: /form|type|write/i }));
    typeIn("Anna");
    await waitFor(() => expect(screen.getByText("Which email can we reach you at?")).toBeTruthy());
    typeIn("Anna123@gmail.com");
    await waitFor(() => expect(screen.getByText("What's your policy number?")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    await waitFor(() =>
      expect(screen.getByText("What's the number plate of your car?")).toBeTruthy(),
    );
    expect((document.querySelector("main input") as HTMLInputElement).value).toBe(""); // not filled in for them
    typeIn("M-JO 4821");
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /doesn't match the car registered to you/,
      ),
    );
    typeIn("m an 2735");
    await waitFor(() => expect(screen.getByText("When did it happen?")).toBeTruthy());
  });
});
