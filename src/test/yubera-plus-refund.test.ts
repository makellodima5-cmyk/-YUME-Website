import { afterEach, describe, expect, it, vi } from "vitest";
import { recordTelegramStarsRefund } from "@/data/yubera-plus.server";

class RefundStatement {
  private values: unknown[] = [];
  constructor(private readonly db: RefundDB, readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    if (this.sql.includes("FROM yume_plus_payment_events")) {
      const event = this.db.event;
      return event && event.telegram_payment_charge_id === this.values[0] ? event as T : null;
    }
    return null;
  }
  async run() { return { meta: { changes: 0 } }; }
  valuesForBatch() { return this.values; }
}
class RefundDB {
  event: { invoice_payload: string; user_id: string; subscription_id: string; initial_charge: string; is_recurring: number; telegram_user_id: string; telegram_payment_charge_id: string } | null;
  eventStatus = "paid";
  paymentStatus = "paid";
  subscriptionStatus = "active";
  constructor(recurring: boolean, charge: string) {
    this.event = {
      invoice_payload: "yubera_plus:order-1", user_id: "user-1", subscription_id: "sub-1",
      initial_charge: "charge-first", is_recurring: recurring ? 1 : 0, telegram_user_id: "12345",
      telegram_payment_charge_id: charge,
    };
  }
  prepare(sql: string) { return new RefundStatement(this, sql); }
  async batch(statements: RefundStatement[]) {
    for (const statement of statements) {
      if (statement.sql.includes("UPDATE yume_plus_payment_events")) this.eventStatus = "refunded";
      if (statement.sql.includes("UPDATE yume_plus_payments")) this.paymentStatus = "refunded";
      if (statement.sql.includes("UPDATE yume_plus_subscriptions")) this.subscriptionStatus = "cancelled";
    }
    return statements.map(() => ({ meta: { changes: 1 } }));
  }
}
const refund = (charge: string) => ({ currency: "XTR", total_amount: 250, telegram_payment_charge_id: charge });
afterEach(() => vi.unstubAllGlobals());

describe("YUBERA Plus refund cancellation", () => {
  it("does not record a recurring refund until Telegram cancellation succeeds", async () => {
    const db = new RefundDB(true, "charge-renewal");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, description: "temporary Telegram error" }), { status: 500 })));

    await expect(recordTelegramStarsRefund(db as never, "12345", refund("charge-renewal"), "bot-token")).rejects.toThrow("telegram_subscription_cancel_failed");
    expect(db.eventStatus).toBe("paid");
    expect(db.paymentStatus).toBe("paid");
    expect(db.subscriptionStatus).toBe("active");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })));
    await recordTelegramStarsRefund(db as never, "12345", refund("charge-renewal"), "bot-token");

    expect(db.eventStatus).toBe("refunded");
    expect(db.paymentStatus).toBe("paid");
    expect(db.subscriptionStatus).toBe("cancelled");
  });

  it("does not call recurring cancellation for a one-time Plus purchase", async () => {
    const db = new RefundDB(false, "charge-first");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await recordTelegramStarsRefund(db as never, "12345", refund("charge-first"), "bot-token");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.eventStatus).toBe("refunded");
    expect(db.paymentStatus).toBe("refunded");
    expect(db.subscriptionStatus).toBe("cancelled");
  });
});
