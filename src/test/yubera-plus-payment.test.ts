import { describe, expect, it } from "vitest";
import { recordYuberaPlusSuccessfulPayment, recordYuberaPlusSubscriptionUpdate } from "@/data/yubera-plus.server";

type Order = {
  id: string; user_id: string; amount: number; currency: string; status: string;
  auto_renew_consent: number; subscription_id: string | null; telegram_payment_charge_id: string | null;
};
type Result = { meta: { changes: number } };

class FakeStatement {
  private values: unknown[] = [];
  constructor(private readonly db: FakePlusDatabase, readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    if (this.sql.includes("FROM yume_plus_payments WHERE invoice_payload")) return this.db.order as T;
    if (this.sql.includes("FROM yume_users WHERE id")) return { telegram_user_id: "12345" } as T;
    if (this.sql.includes("SELECT status,telegram_payment_charge_id")) {
      return { status: this.db.order.status, telegram_payment_charge_id: this.db.order.telegram_payment_charge_id } as T;
    }
    return null;
  }
  async run(): Promise<Result> { if (this.sql.includes("SET auto_renew") && this.db.subscription) { this.db.subscription?.auto_renew = Number(this.values[0]); this.db.subscription?.renewal_failed_at = Number(this.values[1]) === 1 ? "2026-11-12 12:00:00" : null; return { meta: { changes: 1 } }; } return { meta: { changes: 0 } }; }
  valuesForBatch() { return this.values; }
}

class FakePlusDatabase {
  order: Order = {
    id: "payment-1", user_id: "user-1", amount: 250, currency: "XTR",
    status: "pre_checkout", auto_renew_consent: 1, subscription_id: null,
    telegram_payment_charge_id: null,
  };
  subscription: { id: string; expires_at: number; status: string; auto_renew: number; renewal_failed_at: string | null } | null = null;
  events = new Set<string>();
  prepare(sql: string) { return new FakeStatement(this, sql); }
  async batch(statements: FakeStatement[]): Promise<Result[]> {
    const results: Result[] = [];
    let changes = 0;
    for (const statement of statements) {
      const values = statement.valuesForBatch();
      if (statement.sql.includes("INSERT OR IGNORE INTO yume_plus_subscriptions")) {
        if (!this.subscription) {
          this.subscription = { id: String(values[0]), expires_at: Number(values[3]), status: "active", auto_renew: Number(values[4]), renewal_failed_at: null };
          changes = 1;
        } else changes = 0;
      } else if (statement.sql.includes("UPDATE yume_plus_payments SET status='paid'")) {
        if (this.order.status === "pre_checkout" && !this.order.telegram_payment_charge_id) {
          this.order.status = "paid";
          this.order.subscription_id = String(values[0]);
          this.order.telegram_payment_charge_id = String(values[1]);
          changes = 1;
        } else changes = 0;
      } else if (statement.sql.includes("INSERT OR IGNORE INTO yume_plus_payment_events")) {
        const charge = String(values[0]);
        if (!this.events.has(charge) && (!statement.sql.includes("WHERE changes()=1") || changes === 1)) {
          this.events.add(charge);
          changes = 1;
        } else changes = 0;
      } else if (statement.sql.includes("UPDATE yume_plus_subscriptions") && statement.sql.includes("changes()=1")) {
        if (changes === 1 && this.subscription && this.subscription.id === String(values[4])) {
          const absoluteExpiry = Number(values[1]);
          this.subscription.expires_at = absoluteExpiry > 0 ? absoluteExpiry : Math.max(this.subscription.expires_at, Number(values[2])) + Number(values[3]);
          this.subscription.status = "active";
          this.subscription.auto_renew = 1;
          changes = 1;
        } else changes = 0;
      }
      results.push({ meta: { changes } });
    }
    return results;
  }
}

const recurringPayment = (charge: string, first: boolean, expirySeconds: number) => ({
  currency: "XTR", total_amount: 250, invoice_payload: "yubera_plus:payment-1",
  telegram_payment_charge_id: charge, is_recurring: true, is_first_recurring: first,
  subscription_expiration_date: expirySeconds,
});

describe("YUBERA Plus Telegram payment ledger", () => {
  it("creates the first subscription and applies a recurring charge only once", async () => {
    const db = new FakePlusDatabase();
    const firstExpiry = Math.floor(Date.now() / 1000) + 2_592_000;

    await recordYuberaPlusSuccessfulPayment(db as never, "12345", recurringPayment("charge-first", true, firstExpiry));

    expect(db.order.status).toBe("paid");
    expect(db.order.telegram_payment_charge_id).toBe("charge-first");
    expect(db.subscription?.status).toBe("active");
    expect(db.subscription?.auto_renew).toBe(1);
    expect(db.events.has("charge-first")).toBe(true);

    const renewalExpiry = firstExpiry + 2_592_000;
    await recordYuberaPlusSuccessfulPayment(db as never, "12345", recurringPayment("charge-renewal", false, renewalExpiry));
    const afterFirstDelivery = db.subscription?.expires_at;
    await recordYuberaPlusSuccessfulPayment(db as never, "12345", recurringPayment("charge-renewal", false, renewalExpiry));

    expect(afterFirstDelivery).toBe(renewalExpiry * 1000);
    expect(db.subscription?.expires_at).toBe(afterFirstDelivery);
    expect(db.events).toEqual(new Set(["charge-first", "charge-renewal"]));
  });

  it("surfaces failed recurring payment and clears the warning after recovery", async () => {
    const db = new FakePlusDatabase();
    db.subscription = { id: "payment-1", expires_at: Date.now() + 86_400_000, status: "active", auto_renew: 1, renewal_failed_at: null };

    await recordYuberaPlusSubscriptionUpdate(db as never, { user: { id: 12345 }, invoice_payload: "yubera_plus:payment-1", state: "failed" });
    expect(db.subscription?.auto_renew).toBe(0);
    expect(db.subscription?.renewal_failed_at).not.toBeNull();

    await recordYuberaPlusSubscriptionUpdate(db as never, { user: { id: 12345 }, invoice_payload: "yubera_plus:payment-1", state: "active" });
    expect(db.subscription?.auto_renew).toBe(1);
    expect(db.subscription?.renewal_failed_at).toBeNull();
  });

});
