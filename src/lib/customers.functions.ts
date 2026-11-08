import { createServerFn } from "@tanstack/react-start";
import { findCustomer, findCustomerByPlate, samePlate } from "./customers";

// Mia and the written form check the customer against the registered customers before anything about the claim.
// Only yes/no answers come back (plus the registered name and email), never the list and never the registered plate.

export interface CustomerCheck {
  registered: boolean;
  name?: string;
  email?: string;
  /** Only when a plate was sent: whether it is the plate of this customer's registered car */
  plateMatches?: boolean;
}

export const verifyCustomer = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; email: string; plate?: string }) => ({
    name: String(d?.name ?? "").slice(0, 120),
    email: String(d?.email ?? "").slice(0, 160),
    plate: d?.plate === undefined ? undefined : String(d.plate).slice(0, 40),
  }))
  .handler(async ({ data }): Promise<CustomerCheck> => {
    const { REGISTERED_CUSTOMERS } = await import("./customers.server");
    // Name + email, or (voice) name + number plate: either pair identifies the customer
    const c =
      findCustomer(REGISTERED_CUSTOMERS, data.name, data.email) ??
      (data.plate ? findCustomerByPlate(REGISTERED_CUSTOMERS, data.name, data.plate) : null);
    if (!c) return { registered: false };
    return {
      registered: true,
      name: c.name,
      email: c.email,
      ...(data.plate !== undefined ? { plateMatches: samePlate(c.plate, data.plate) } : {}),
    };
  });
