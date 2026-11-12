import { describe, expect, it } from "vitest";
import { recordTelegramStarsRefund } from "@/data/yubera-plus.server";

type Donation = { charge: string; telegramUserId: string; amount: number; currency: string; status: string };
class RefundStatement {
  private values: unknown[] = [];
  constructor(private readonly db: RefundDatabase, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async run() {
    if (!this.sql.includes("INSERT OR IGNORE INTO yume_stars_refunds")) return { meta: { changes: 0 } };
    const [charge, userId, amount] = this.values as [string, string, number];
    const donation = this.db.donations.get(charge);
    if (!donation || donation.telegramUserId !== userId || donation.amount !== amount || donation.currency !== "XTR" || donation.status !== "paid" || this.db.refunds.has(charge)) {
      return { meta: { changes: 0 } };
    }
    this.db.refunds.set(charge, { telegramUserId: userId, amount });
    return { meta: { changes: 1 } };
  }
  async first<T>() { return null as T | null; }
}
class RefundDatabase {
  donations = new Map<string, Donation>();
  refunds = new Map<string, { telegramUserId: string; amount: number }>();
  prepare(sql: string) { return new RefundStatement(this, sql); }
}

describe("YUBERA support refunds", () => {
  it("records only a matching confirmed Stars refund and deduplicates webhook retries", async () => {
    const db = new RefundDatabase();
    db.donations.set("support-charge", {
      charge: "support-charge", telegramUserId: "12345", amount: 500, currency: "XTR", status: "paid",
    });

    await recordTelegramStarsRefund(db as never, "12345", {
      currency: "XTR", total_amount: 500, telegram_payment_charge_id: "support-charge",
    });
    await recordTelegramStarsRefund(db as never, "12345", {
      currency: "XTR", total_amount: 500, telegram_payment_charge_id: "support-charge",
    });

    expect(db.refunds.size).toBe(1);
    expect(db.refunds.get("support-charge")).toEqual({ telegramUserId: "12345", amount: 500 });
  });

  it("ignores refunds with a mismatched payer, amount or currency", async () => {
    const db = new RefundDatabase();
    db.donations.set("support-charge", {
      charge: "support-charge", telegramUserId: "12345", amount: 500, currency: "XTR", status: "paid",
    });

    await recordTelegramStarsRefund(db as never, "99999", {
      currency: "XTR", total_amount: 500, telegram_payment_charge_id: "support-charge",
    });
    await recordTelegramStarsRefund(db as never, "12345", {
      currency: "XTR", total_amount: 400, telegram_payment_charge_id: "support-charge",
    });
    await recordTelegramStarsRefund(db as never, "12345", {
      currency: "USD", total_amount: 500, telegram_payment_charge_id: "support-charge",
    });

    expect(db.refunds.size).toBe(0);
  });
});
