import { describe, expect, it } from "vitest";

import { CANCEL_REASON_VALUES, REJECT_REASON_VALUES } from "./constants";
import { buildPlayerMessage, PLAYER_MESSAGES, playerFirstName } from "./messages";

/** Spec 0016, AC-9: the prefilled text to the player. */

const base = {
  customerName: "  Lea  Santos ",
  code: "K7MQ-3XPT",
  firstRun: "Fri 30 Oct, 6pm",
  amount: 1000,
};

describe("buildPlayerMessage", () => {
  it("opens with the first name, the code and the first run", () => {
    const text = buildPlayerMessage({ ...base, reason: "no_payment", refundOwed: false });
    expect(
      text.startsWith(
        "Hi Lea, this is Ella's Picklecourt about your booking K7MQ-3XPT (Fri 30 Oct, 6pm).",
      ),
    ).toBe(true);
    expect(text).toContain("We couldn't find your payment");
    expect(text).not.toContain("send");
  });

  it("names the amount due for Amount doesn't match", () => {
    const text = buildPlayerMessage({ ...base, reason: "amount_mismatch", refundOwed: false });
    expect(text).toContain("doesn't match the ₱1,000 due");
  });

  it("adds the refund line only when the box is ticked", () => {
    const text = buildPlayerMessage({ ...base, reason: "player_asked", refundOwed: true });
    expect(text.endsWith("We'll send ₱1,000 back to the account you paid from.")).toBe(true);
  });

  it("has a message for every reason on both lists", () => {
    for (const reason of [...REJECT_REASON_VALUES, ...CANCEL_REASON_VALUES]) {
      expect(PLAYER_MESSAGES[reason]).toBeTruthy();
    }
  });
});

describe("playerFirstName", () => {
  it("is the first word of the trimmed name, or all of it when it is one word", () => {
    expect(playerFirstName(" Lea Santos ")).toBe("Lea");
    expect(playerFirstName("Lea")).toBe("Lea");
  });
});
