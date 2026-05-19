# BD v4 - Category Precision Fix

This build keeps the English UI and the top-10 KEEP-only output, but fixes the remaining category-contamination bug.

## Fixed

- Prevented generic `agent` from stealing real-estate, App Store, CRM, and other posts.
- Prevented a single `fundraise` mention from stealing billing / quote-to-cash posts.
- Moved highly specific categories before broad categories.
- Added categories for:
  - Law firm workflow pain
  - CRM / multi-channel lead management
  - YouTube creator engagement unlocks
  - Gym membership renewal operations
- Tightened AI-agent reliability matching so it requires both an agent context and production reliability terms.
- Tightened fundraising matching so it requires investor/deck/outreach workflow terms, not just the word fundraise.

## Goal

Pain Quote, Buyer, Why it hurts, and Tiny Tool Opportunity should now match the same source signal instead of leaking templates across unrelated posts.
