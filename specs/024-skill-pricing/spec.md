# Feature Specification: Skill Pricing + Billing

**Feature Branch**: `024-skill-pricing`
**Status**: Draft — blocked on 011 + 022
**Created**: 2026-05-31

## Problem

Once Atlas has a skill marketplace (spec 022), some skills will be free and some will charge. We need a billing model that:

- Charges per skill invocation OR per token consumed, depending on the skill
- Attributes spend to the right user and right org
- Aggregates into Stripe at the right cadence
- Splits revenue with skill publishers
- Works in trial / free-tier mode without payment instrument on file

## Desired behaviour

### Pricing models a skill can declare

- **Free** — no charge
- **Per-invocation** — flat Atlas-credits cost per call (`atlas_credits_per_invocation`)
- **Per-token** — Atlas takes a multiplier on top of underlying model cost (`atlas_token_markup`)
- **Subscription** — flat monthly add-on (`atlas_credits_per_month`)
- **Custom** — publisher webhook for usage-metered billing (rare; reserved for partners)

### Atlas credits

A virtual currency. 1 Atlas credit = 0.001 USD at v1 (subject to repricing). Decoupling from raw USD lets us run promotions, regional pricing, and publisher subsidies without rewriting the desktop UI.

Users see USD in the UI; credits are an internal accounting unit only.

### Settlement

- Atlas takes a platform fee (% of skill-credit revenue, TBD — Apple-style 15-30%).
- Remainder paid to publisher monthly via Stripe Connect.

### Cap interactions

- Per-skill caps in the org policy: "no skill over $X/day".
- Total daily cap from spec 003 quota still applies (cloud-proxy model spend + skill credits combined).

## Open questions for /speckit-clarify

1. Currency: USD-only at v1, or multi-currency from day 1 (FX exposure)?
2. Atlas platform fee: 15% (mass-market), 30% (publisher-supports services included), or volume-based tiers?
3. Refunds: automatic for failed invocations? How does "failed" get defined for an LLM-based skill?
4. Tax: handle ourselves via Stripe Tax, or push compliance to publishers?
5. Publisher payout cadence: monthly, weekly?
6. Free trial credits — per user, per org, per skill?

## Dependencies

- Spec 011 (model catalogue) — for model-cost lookup
- Spec 022 (skill platform) — for the manifest pricing field
- Spec 003 (LLM proxy) — for combined cap enforcement
- Spec 021 (admin console) — for the billing UI surface
- Stripe Connect account + Atlas tax stance

## Acceptance criteria

- A publisher submits a skill with `atlas_credits_per_invocation: 50`; users see "$0.05 per use" in the install dialog.
- Each invocation debits credits from the user's balance; balance shows in real time.
- Atlas takes its fee, publisher payout is scheduled.
- An org admin sets "no skill over $1/day per user"; users hitting that get a clear in-app limit message.
- Stripe disputes / chargebacks reverse the credit grant; publisher payout is held until resolved.
