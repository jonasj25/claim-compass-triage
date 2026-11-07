import { createServerFn } from "@tanstack/react-start";
import { findCustomer } from "./customers";

// Mia and the written form check the customer against the registered customers before anything about the claim.
// Only a yes/no comes back (plus that customer's registered name, email and plate), never the list.

export interface CustomerCheck {
  registered: boolean;
  name?: string;
  email?: string;
  plate?: string;
}

export const verifyCustomer = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; email: string }) => ({
    name: String(d?.name ?? "").slice(0, 120),
    email: String(d?.email ?? "").slice(0, 160),
  }))
  .handler(async ({ data }): Promise<CustomerCheck> => {
    const { REGISTERED_CUSTOMERS } = await import("./customers.server");
    const c = findCustomer(REGISTERED_CUSTOMERS, data.name, data.email);
    return c
      ? { registered: true, name: c.name, email: c.email, plate: c.plate }
      : { registered: false };
  });
