# Freelance City Ecosystem Scale-Up Plan (v1)

## 1) Objective
Expand game scope from single-city career onboarding to **multi-city ecosystem onboarding**.

New rule:
- Remove "choose occupation at start" flow.
- Replace with "choose city at start".
- Each city has 2 core occupations.
- Implement incrementally, starting from **City 2: Ferrum**.

---

## 2) City Map (Target)

1. **Agraria** (Food Basket)
   - Occupations: Farmer (existing Provider), Chef
   - Constraint: Keep current gameplay as-is.

2. **Ferrum** (The Forge)  ← **First implementation target**
   - Occupations: Miner, Builder/Smith

3. **Voltara** (Power Hub)
   - Occupations: Technician, Engineer

4. **Textilis** (The Loom)
   - Occupations: Weaver, Tailor

5. **Medico** (Wellness)
   - Occupations: Gatherer, Chemist

---

## 3) Current System Reuse Strategy

The current Agraria loop is production-ready and should be reused as the template:
- Authentication/session
- Hunger/task sync
- Inventory/equipment
- Work orders + collect/cancel
- Skills (Provider/Chef)
- Shop/recipes/market/runtime config

For Ferrum, add a **parallel profession domain** using the same architecture pattern:
- Occupation levels/EXP
- Skills per branch
- Workspace task lifecycle
- Item chains (raw -> processed)
- Market compatibility and rarity support

---

## 4) Proposed Data Model Extension (No code yet)

### 4.1 User onboarding state
Add onboarding fields:
- `home_city` (AGRARIA | FERRUM | VOLTARA | TEXTILIS | MEDICO)
- `city_selected_at` (timestamp)

### 4.2 Occupation progression model
Two valid approaches:

A) **Wide columns** (similar to current provider/chef)
- e.g. `miner_level`, `miner_exp`, `smith_level`, `smith_exp`, etc.

B) **Normalized tables** (recommended for scale)
- `user_occupations(user_id, occupation_key, level, exp, unlocked_at)`
- `user_skills(user_id, occupation_key, branch_key, level)`

Recommendation:
- Keep current columns for Agraria compatibility.
- Introduce normalized tables for new cities.
- Add an adapter in service layer so old and new systems can coexist.

---

## 5) Gameplay Contract for City 2 (Ferrum)

### 5.1 Occupations
- **Miner**: extract ores/minerals (raw industrial resources)
- **Builder/Smith**: craft structural/metal products from mined inputs

### 5.2 Core loop
1. Buy/extract mining inputs
2. Run Miner work orders
3. Feed outputs to Builder/Smith recipes
4. Craft products
5. Sell to market / consume in future city systems

### 5.3 Design parity with Agraria
Ferrum should mirror existing proven behavior:
- task start/collect/cancel contracts
- queue/timer logic
- hunger impact
- equipment effect integration
- rarity pipelines
- runtime config toggles

---

## 6) Implementation Phases (Planned)

### Phase 0: Onboarding layer
- Replace class selection UI with city selection UI.
- Keep Agraria internals unchanged.
- Route existing players safely (migration policy required).

### Phase 1: City framework
- Add city-aware access control middleware/service.
- Add city config registry (occupations, shops, recipes, item pools).

### Phase 2: Ferrum vertical slice (first playable non-Agraria city)
- New item set (ore/metal chain)
- New occupations: Miner + Builder/Smith
- Workspace actions for both occupations
- Skill trees + effects
- Shop + recipe shop + market flow

### Phase 3: Economy balancing
- Runtime config entries for Ferrum decays, times, EXP, drop rates.
- Monitoring + balancing pass.

---

## 7) Compatibility Rules

1. Agraria must remain playable with no behavior change.
2. Existing endpoints should not break current client.
3. New city features should be additive and feature-flag friendly.
4. Keep rarity and inventory semantics consistent across cities.

---

## 8) Technical Risks

- Mixing legacy occupation columns with scalable city model
- Migration impact on existing users
- Shared market economy inflation when adding new resource chains
- UI complexity from city + multi-occupation progression

Mitigation:
- Introduce city abstraction layer first
- Add migration scripts + fallback defaults
- Gate new city rollout behind config flag
- Reuse existing action patterns strictly

---

## 9) Open Questions (Must confirm before coding)

1. Existing users should default to which city?
   - Option A: Auto-assign Agraria
   - Option B: Force one-time city selection at next login

2. Can a player change city later?
   - Never / cooldown / paid transfer

3. Should market be global across all cities or city-local?

4. For Ferrum first release, do you want:
   - only Miner + Builder/Smith playable,
   - or also cross-city item dependencies immediately?

5. Occupation storage preference for scale-up:
   - keep wide-column style for every new occupation,
   - or move new cities to normalized tables now?

6. Builder and Smith should be:
   - one combined occupation,
   - or two separate occupations?

7. Unlock model after choosing city:
   - both city occupations unlocked at level 1,
   - or one primary then unlock second by level (like current model)?

8. Do you want city-specific currency/tax modifiers now, or later?

---

## 10) Next Step
After answers to Section 9 are confirmed, implementation will begin with:
1. city-selection onboarding,
2. city framework scaffolding,
3. Ferrum vertical slice end-to-end.

---

## 11) Confirmed Decisions (From latest discussion)

1. Existing players are auto-assigned to **Agraria**.
2. City transfer is allowed with these rules:
   - Cost: **1,000,000 credits**
   - Allowed once per election cycle
3. Election system concept:
   - Mayor election every **7 days** per city
   - Mayor can set city tax
4. City progression and treasury:
   - Taxes increase city treasury value
   - City has 10 tiers:
     1) Settlement: 0
     2) Village: 1,000,000
     3) Town: 2,500,000
     4) Large Town: 5,000,000
     5) City: 10,000,000
     6) Big City: 20,000,000
     7) Metropolis: 50,000,000
     8) Megapolis: 100,000,000
     9) Capital: 250,000,000
     10) Utopia: 1,000,000,000
5. Tax sources include:
   - Player market trading
   - Bot market trading
   - Inter-city import/export tax
6. Market design remains **global**, so all city ecosystems are interdependent.
7. Phase 1 career rollout:
   - Ferrum starts with **Miner only**
   - Unlock **Builder/Smith** at Miner level 5 (same pattern as Agraria second occupation unlock)
8. New occupation architecture uses **normalized tables**.
9. Builder and Smith are a **single occupation**.
10. Occupations unlock one-by-one (not both at start).
11. City tax/modifier must be included from phase 1.

---

## 12) Finalized Governance / Tax / Tier Rules (Ready for implementation)

### 12.1 Election cycle and starting condition
* Cycle length: **7 days**
* On city creation/new cycle start, city has **no mayor** for the first 7 days.
* During no-mayor period, city uses fixed default tax:
  * `domestic_trade_tax = 3%`
  * `export_tax = 3%`
  * `import_tax = 3%`

### 12.2 Mayor powers and constraints
* After election is resolved, mayor can change tax rates immediately.
* Tax change applies **immediately** (no delayed activation).
* Tax bounds (implementation default):
  * min `0%`, max `12%`, step `0.5%`

### 12.3 Tax split (anti-inflation)
* Each collected tax amount is split as:
  * `70%` -> city treasury (for city tier progression)
  * `30%` -> burn sink (removed from economy)

### 12.4 Global market attribution (real-world style)
For transaction value `V`:

1) **Domestic trade** (seller city == buyer city):
* Domestic tax = `V * domestic_trade_tax(seller_city)`
* Treasury credited to seller/buyer shared city

2) **Cross-city trade** (seller city != buyer city):
* Export tax = `V * export_tax(seller_city)` -> seller city treasury
* Import tax = `V * import_tax(buyer_city)` -> buyer city treasury
* Total tax paid by ecosystem = export + import

3) **Bot trade**
* Bot follows same tax rules as buyer/seller side counterpart
* If bot buys from player: apply seller-side (domestic/export) tax by city relation
* If bot-origin listing is introduced later: apply buyer-side rules accordingly

### 12.5 Candidate / voter eligibility
* Candidate: total occupation level `> 20`
* Voter: total occupation level `> 10`

### 12.6 City transfer rule
* Transfer cost = `1,000,000 credits`
* Transfer allowed **once per election cycle per player (global)**
* Cooldown key = election cycle id (not rolling 7-day personal timer)

---

### 12.7 City tier special status (Phase 1 concrete effects)

Tier is determined by city treasury thresholds already confirmed.

Each tier grants passive status to city residents (implementation defaults):

* `task_time_reduction_pct = (tier - 1) * 1.0%` (max 9%)
* `npc_shop_discount_pct = (tier - 1) * 0.5%` (max 4.5%)
* `market_fee_discount_pct = (tier - 1) * 0.75%` (max 6.75%)
* `rare_drop_bonus_pct = (tier - 1) * 0.3%` (max 2.7%)

Notes:
* These are city status bonuses, separate from equipment/skill bonuses.
* Apply as multiplicative modifiers with safe caps.
* Bonus set is intentionally conservative for phase 1 balance.

---

### 12.8 Implementation status
All policy blockers are resolved. Coding can proceed immediately with:
1. city-selection onboarding,
2. normalized occupation schema for new cities,
3. Ferrum phase 1 (Miner only + unlock Builder/Smith at level 5),
4. governance/tax/treasury/tier status core.
