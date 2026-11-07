// Server only: registered customers who may report a claim through Mia.
// Load inside server handlers: const { REGISTERED_CUSTOMERS } = await import("@/lib/customers.server");
import type { Customer } from "./customers";

export const REGISTERED_CUSTOMERS: readonly Customer[] = [
  { name: "John", email: "john123@gmail.com" },
  { name: "Anna", email: "anna123@gmail.com" },
  { name: "Marko", email: "marko123@gmail.com" },
];
