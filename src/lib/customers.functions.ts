import { createServerFn } from "@tanstack/react-start";
import { findCustomer } from "./customers";

// Mia checks the caller against the registered customers before she asks anything about the claim.
// Only a yes/no comes back (plus the name and email as registered), never the list.

export interface CustomerCheck {
  registered: boolean;
  name?: string;
  email?: string;
}

export const verifyCustomer = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; email: string }) => ({
    name: String(d?.name ?? "").slice(0, 120),
    email: String(d?.email ?? "").slice(0, 160),
  }))
  .handler(async ({ data }): Promise<CustomerCheck> => {
    const { REGISTERED_CUSTOMERS } = await import("./customers.server");
    const c = findCustomer(REGISTERED_CUSTOMERS, data.name, data.email);
    return c ? { registered: true, name: c.name, email: c.email } : { registered: false };
  });
