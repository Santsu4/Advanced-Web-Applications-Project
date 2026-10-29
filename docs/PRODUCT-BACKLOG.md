# RIO — Product backlog

Version 1.0 · 29 October 2026 · Working product name: RIO

This is the consolidated current backlog from the customer discussion and subsequent clarifications. It is ready for team refinement, not a claim that every item is ready for a sprint. Open decisions are explicitly identified. Earlier draft backlog IDs are superseded by the stable RIO IDs below.

## Product goal

Enable customers to find a cinema screening, choose valid seats, and purchase tickets without creating an account, while allowing authorised staff to maintain screenings, pricing, and reservations. Extend this foundation with account-based reservations, then company requests and optional loyalty rewards.

## Scope and ordering

The tables are in proposed product-backlog order. Order reflects customer value and dependencies, not sprint assignments. The team will estimate and split items before selecting them for a sprint.

| Release group | Scope | Priority |
| --- | --- | --- |
| A — Guest purchase | Browsing, seating, guest checkout, Stripe payment, confirmation, and essential staff controls | First usable release |
| B — Registered reservations | Accounts, pay-later reservations, payment deadlines, and expiry | Second |
| C — Company booking | Requests, staff decisions, seat allocation, and invoicing | Extra scope; third customer booking flow |
| D — Loyalty | Account ticket counter and half-price rewards | Extra scope; position against company work to be agreed |

The administration website includes a dashboard and a control hub. The customer website and staff administration website must be separate websites, each deployed separately. No cinema equipment/playback integration is currently required. Stripe integration will be taught later in the course. Until then, a temporary payment simulation (for example, a button that pretends payment succeeded) can demonstrate the booking flow. The payment feature is complete once the app handles payment results through Stripe; Stripe test mode allows this to be tested without charging real money.

## Agreed domain rules

### Business and physical layout

- Two cities: Oulu and Tampere. Each has two screens: one with 100 physical seats and one with 200.
- Each physical row contains ten seats in one uninterrupted block. Side hallways are outside the block; there are no internal aisles between seats.
- The seat map places the screen at the bottom. Row 1 is the nearest seated row to the screen. A wheelchair area lies between row 1 and the screen. Side access and stairs to higher rows inform the layout.
- Seat numbers continue across rows and skip label 13. Snake numbering alternates direction: row 1 runs left to right, row 2 right to left, and so on.
- Row labels skip 13; physical rows are not omitted.
- Every screen has ten wheelchair parking spaces in addition to its physical seats. Customers watch from their own wheelchairs. Space identifiers and ticket pricing remain open.
- Seat 1 is permanently allocated to the CEO. No customer, cashier, administrator, or CEO action can release or sell it.
- Working name RIO requires confirmation. UI colours are gold, red, and black.

| Physical row | Row label | Seat labels, left to right |
| --- | --- | --- |
| 1, nearest screen | 1 | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| 2 | 2 | 21, 20, 19, 18, 17, 16, 15, 14, 12, 11 |
| 3 | 3 | 22, 23, 24, 25, 26, 27, 28, 29, 30, 31 |
| 13 | 14 | Numbering continues without a missing physical row |

With this interpretation, the 100-seat screen has labels through 101 and the 200-seat screen through 201. Assuming seat 1 is included in those capacities, ordinary customer capacity is 99 or 199, plus ten wheelchair spaces. Confirm that capacity interpretation before final configuration.

### Seat-selection rules

- A booking must not create an isolated available seat between unavailable seats in the same physical row. Two or more consecutive available seats are allowed.
- One available seat at either end of a row is allowed.
- Validate physical adjacency, not arithmetic differences between seat labels.
- Customers and staff follow the same rule. Seat 1 has no override.
- Example: if seats 5 and 6 are already booked, selecting 7 is allowed; selecting 8 alone is rejected because it isolates 7; selecting 9 alone is allowed because 7 and 8 remain together, assuming no other seats cause a violation.
- Technical treatment of temporary checkout holds and pre-existing isolated gaps needs refinement; it must preserve the agreed customer-facing rule.

### Prices and reservations

- Authorised administrators set the base ticket price. The scope of a price setting remains open.
- A child ticket, for a customer aged 12 or under, is priced at 50% of the adult price. This is the normal child category price.
- A proposed 15% first-time/premiere surcharge remains unconfirmed and must not be silently applied.
- Guest customers can buy without registration or login.
- Reserving without immediate payment requires an account.
- A booking of six or more requires immediate payment. Working interpretation: count all attendee places in that booking, including wheelchair places; confirm the threshold unit.
- New bookings at or within two hours before the screening require immediate payment.
- Earlier unpaid customer reservations expire two hours before the screening and release their places. Paid bookings are unaffected.
- Stripe handles online payments. Pay-at-cinema recording and the deadline/payment race require refinement.

### Company bookings

- Companies submit requests with their details, desired film/screen, and number of attendees. Staff accept and allocate seats, or decline with a message.
- Acceptance immediately secures the places and issues an invoice. Company bookings do not expire under ordinary unpaid-customer reservation rules.
- Record booking confirmation separately from invoice payment: an accepted invoice booking is secured, while its invoice can remain outstanding.
- Outstanding invoices follow a separate invoicing/collection process. Automated debt collection is not an agreed app feature.
- Company pricing is separate and deferred. Company bookings do not participate in loyalty rewards.

### Optional account loyalty

- Only successfully paid, non-company tickets purchased through an account count. Adult and child tickets each count as one.
- Each ten tickets earns one half-price ticket. Tickets in the current purchase contribute immediately. Multiple rewards can apply in one order.
- For existing progress c (0–9) and n qualifying tickets: rewards = floor((c+n)/10); new progress = (c+n) mod 10.
- Apply rewards to the highest-priced tickets in the current order, one reward per ticket. For multiple rewards, use descending pre-reward ticket price. Equal-price ties have the same total financial effect.
- Example: adult €12 and child €6 become €6 and €3 respectively when rewarded. A child-only order can earn child rewards.
- The counter changes only after successful payment; retrying payment or processing a duplicate notification must not award rewards twice.
- Example: progress 9 plus 12 tickets earns two rewards and leaves progress 1. From zero, ten tickets earns one reward in that same purchase.
- The team is authorised to decide details such as reward allocation. Refund/cancellation behaviour remains to be defined if those flows enter scope.

## A — Guest purchase and essential operations

### RIO-01 — Establish locations and protected auditorium inventory

**Story:** As a cinema operator, I want accurate screen inventories so customers book real places.

**Acceptance criteria**
- Oulu and Tampere each have a 100-seat and a 200-seat screen, each with ten additional wheelchair spaces.
- Numbering and row labels follow the domain rules; seat labels and physical positions are stored distinctly.
- Seat 1 is unavailable for sale or manual allocation through every supported route.
- Existing bookings cannot be silently invalidated by a layout change. Dynamic layout editing is not required for the initial release; verified configuration is sufficient.

**Dependencies/open decisions:** Capacity interpretation and wheelchair identifiers (O-02).

### RIO-02 — Protect administration with roles and city scope

**Story:** As the business administrator, I want staff access limited to their responsibilities and city.

**Acceptance criteria**
- Staff must authenticate before accessing administration functions.
- The business administrator can manage both cities.
- An Oulu cashier can access only authorised Oulu functions; the same city-scoping model supports Tampere.
- Restrictions are enforced on data access and actions, including direct requests, rather than only hiding controls.
- Unauthenticated customers cannot access administrative data or actions.

**Dependencies/open decisions:** Agree the minimum permission matrix and staff-account provisioning before implementation (O-03).

### RIO-03 — Maintain film information

**Story:** As authorised staff, I want to maintain films so the programme contains usable, accurate information.

**Acceptance criteria**
- Staff can add and edit the film information required for browsing and scheduling.
- The system can obtain film metadata from an external movie-data API and retain information needed for existing screenings locally.
- External API failure does not delete existing information or make existing screenings unbookable.
- Unavailable optional artwork or metadata has a usable fallback.

**Dependencies/open decisions:** Movie API/provider and required metadata fields (O-04). No specific provider has been selected.

### RIO-04 — Manage the screening schedule

**Story:** As authorised staff, I want to assign films to screens and times so customers can book the programme.

**Acceptance criteria**
- A screening identifies its film, city, screen, date, and start time.
- Staff can create and edit screenings within their permissions.
- Conflicting screenings in one screen are rejected using agreed film-duration and turnaround rules.
- Changes affecting existing bookings require an explicit agreed policy; bookings are never silently moved or invalidated.
- Published screenings become available to the customer browsing flow.

**Dependencies:** RIO-01–03. **Open:** O-05.

### RIO-05 — Set prices and calculate adult/child totals

**Story:** As an administrator, I want to set prices so checkout charges the agreed amount.

**Acceptance criteria**
- Authorised staff can set the applicable adult base price.
- Child tickets for ages 12 and under cost 50% of the applicable adult price.
- Checkout identifies ticket categories, unit prices, and the total before payment.
- A confirmed purchase preserves the prices actually charged when future price settings change.
- Calculations use an agreed currency/rounding policy; the unconfirmed premiere surcharge is not applied.

**Dependencies:** RIO-02, RIO-04. **Open:** Price scope, price changes during checkout, currency/rounding (O-06).

### RIO-06 — Browse films by city and select a screening

**Story:** As a customer, I want to browse upcoming films and screenings so I can choose a suitable visit.

**Acceptance criteria**
- Customers can select Oulu or Tampere and see relevant upcoming screenings.
- Film details and screening choices are easy to reach; empty results have a clear message.
- Before booking, customers can identify the film, city, screen, date, start time, and ticket prices.
- The selected screening stays visible through seat selection and checkout.

**Dependencies:** RIO-03–05. **Open:** Required film fields and operational timing copy (O-04, O-12).

### RIO-07 — Choose seats and wheelchair spaces

**Story:** As a customer, I want an understandable seating plan so I can choose suitable places.

**Acceptance criteria**
- The screen appears at the bottom, row 1 nearest it, with the wheelchair area in front of row 1.
- Available, selected, and unavailable places are distinguishable without relying solely on colour.
- Physical arrangement, snake numbering, skipped labels, and permanent seat 1 allocation are correct.
- Customers can choose wheelchair spaces; no screening can allocate more than ten.
- The seat-selection rule is checked with an understandable explanation when a selection is rejected.
- Selection works with keyboard input and readable labels.

**Dependencies:** RIO-01, RIO-06. **Open:** Wheelchair ticket pricing and temporary-hold interaction (O-02, O-07).

### RIO-08 — Protect selected places during checkout

**Story:** As a customer, I want selected places protected while paying so another booking cannot take them.

**Acceptance criteria**
- Starting checkout creates a time-limited hold with a visible expiry.
- Competing requests cannot confirm the same place twice, including customer, company, and staff requests.
- Abandoned or expired holds release their places.
- Before confirmation, the system validates availability, selection rules, and the authoritative price.
- Payment completion around hold expiry follows a defined outcome without leaving an unexplained charge or double allocation.

**Dependencies:** RIO-07. **Open:** Hold duration and expiry/payment policy (O-07).

### RIO-09 — Complete guest checkout through Stripe

**Story:** As a guest, I want to buy tickets without an account so I can complete my purchase easily.

**Acceptance criteria**
- No registration or login is required.
- The customer reviews the screening, places, ticket categories, and final amount before paying.
- Only agreed contact information is collected.
- Successful Stripe payment confirms one booking; failed or cancelled payment does not mark a booking paid.
- A browser return alone is insufficient proof of payment; confirmation uses verified payment status.
- Retries and duplicate payment notifications do not create duplicate bookings or charges initiated by the app.
- Payment failures and interruptions provide a clear next step.

**Dependencies:** RIO-05, RIO-08. **Open:** Stripe course setup and contact requirements (O-08).

### RIO-10 — Provide ticket/booking confirmation

**Story:** As a customer, I want proof of my booking so I can identify it and attend the screening.

**Acceptance criteria**
- Confirmation shows a unique reference, film, city, screen, date/time, selected places, amount, and paid status.
- Only a confirmed purchase is presented as paid.
- The agreed delivery/retrieval method lets a guest retain the confirmation.
- Any door-opening or advertising information uses teacher-confirmed wording.

**Dependencies:** RIO-09. **Open:** Delivery, ticket validation, and timing copy (O-08, O-12).

### RIO-11 — View bookings and reserve places manually

**Story:** As authorised staff, I want a screening booking view and manual reservation controls so I can serve customers.

**Acceptance criteria**
- Staff can view available places and distinguish paid bookings, unpaid reservations, and temporary holds.
- Staff can reserve available places within their city and role permissions.
- Staff obey the isolated-seat rule and cannot release or allocate seat 1.
- Manual and online actions share the same inventory and cannot double-book places.
- The agreed rules define payment status and deadlines for staff-created reservations.

**Dependencies:** RIO-02, RIO-08. **Open:** Cashier permissions and manual payment/deadline policy (O-03, O-09).

### RIO-12 — View a business dashboard

**Story:** As the business administrator, I want numerical operating statistics so I can monitor the cinemas.

**Acceptance criteria**
- The dashboard displays agreed metrics for an identifiable reporting period and location scope.
- Figures reconcile with underlying booking and payment states; invoice-confirmed bookings are not automatically treated as cash received.
- Access respects staff roles and city restrictions.

**Proposed metrics, not yet agreed:** Tickets sold, ticket revenue, and screening occupancy. **Open:** Select metrics and define their formulas before implementation (O-10). This item may be split or deferred if it is not needed for the first guest release.

## B — Registered reservations

### RIO-13 — Create and access a customer account

**Story:** As a customer, I want an account so I can reserve without immediate payment and view my reservations.

**Acceptance criteria**
- Customers can register, sign in, and sign out using the agreed account method.
- Guest purchasing remains available.
- Customers cannot access another customer's account or reservations.
- Required account/contact fields and account-recovery behaviour are agreed before implementation.

**Open:** O-11.

### RIO-14 — Reserve now and pay later

**Story:** As a signed-in customer, I want to reserve a small booking ahead of time so I can pay later.

**Acceptance criteria**
- Only signed-in customers can complete an unpaid reservation.
- Pay-later is available only more than two hours before the screening and below the six-place threshold.
- Six or more places, or a booking at/within the two-hour cutoff, requires immediate payment.
- A successful reservation holds the places and shows its exact payment deadline and unpaid status.
- Availability and seating rules are enforced consistently with paid purchases.

**Dependencies:** RIO-08, RIO-13. **Open:** Threshold counting and accepted payment routes (O-09).

### RIO-15 — View and pay an existing reservation

**Story:** As a registered customer, I want to see my reservations and settle payment before the deadline.

**Acceptance criteria**
- Customers see their own reservation reference, screening, places, status, amount, and deadline.
- Proposed flow: allow Stripe payment of a valid unpaid reservation before its deadline.
- Successful payment changes the reservation to a paid booking without allocating places a second time.
- Expired reservations cannot be paid through a stale page as if still valid.
- If payment at the cinema is supported, authorised staff can record settlement through an agreed method.

**Dependencies:** RIO-09, RIO-14. **Open:** Confirm online settlement and cinema-payment workflow (O-09).

### RIO-16 — Release overdue unpaid reservations

**Story:** As the cinema, I want overdue unpaid reservations cancelled so other customers can buy the places.

**Acceptance criteria**
- At two hours before the screening, an unpaid customer reservation becomes expired and releases its places.
- Expired places become bookable without staff intervention.
- Paid bookings and accepted invoice-based company bookings are not expired by this rule.
- Payment and expiry occurring together produce one consistent outcome without double allocation.
- Deadline handling uses the cinema's Europe/Helsinki time and works across daylight-saving changes.

**Dependencies:** RIO-14–15. **Open:** Payment/cutoff handling (O-09).

## C — Company booking (extra scope)

### RIO-17 — Submit a company booking request

**Story:** As a company representative, I want to request a group screening booking so staff can arrange it.

**Acceptance criteria**
- The form collects agreed company/contact information, film, city/screen, desired screening or date/time, and number of attendees.
- Required fields are validated and the request appears in the authorised staff queue as pending.
- Submission acknowledges receipt but does not claim seats are secured.

**Open:** Request fields, company identity requirements, and existing versus new screening requests (O-13).

### RIO-18 — Review, accept, or decline company requests

**Story:** As authorised staff, I want to decide company requests so I can allocate suitable places or explain a refusal.

**Acceptance criteria**
- Staff can review pending requests within their permitted city scope.
- Declining records a message for the company.
- Acceptance requires available places in the agreed screening and immediately secures them.
- Seat rules, capacity limits, and permanent CEO protection apply.
- Acceptance and allocation succeed together; a partial failure cannot leave a request accepted without its places.
- The company receives the decision through the agreed channel.

**Dependencies:** RIO-11, RIO-17. **Open:** Notification channel and changes to requested screening (O-13).

### RIO-19 — Issue and track company invoices

**Story:** As authorised staff, I want accepted company bookings linked to invoices so payment is handled separately from seat confirmation.

**Acceptance criteria**
- Acceptance generates an invoice using the agreed company pricing and invoicing details.
- The booking remains secured while the invoice is outstanding and is exempt from ordinary two-hour expiry.
- Booking confirmation and invoice payment status are recorded separately.
- Company tickets do not change loyalty counters or receive loyalty rewards.
- Staff can identify outstanding versus paid invoices through the agreed workflow.

**Dependencies:** RIO-18. **Open:** Company pricing, invoice format/delivery, terms, settlement recording, and any external handoff (O-13). No automated collection integration is promised.

## D — Loyalty rewards (extra scope)

### RIO-20 — Earn and apply tenth-ticket rewards

**Story:** As an account customer, I want every tenth qualifying ticket discounted so repeat purchases are rewarded.

**Acceptance criteria**
- The counter and reward allocation follow the loyalty domain rules above.
- A customer with progress 0 buying ten tickets earns one reward immediately and finishes at 0.
- Progress 9 plus twelve tickets earns two rewards and finishes at 1.
- Rewards apply to the highest-priced eligible tickets; a €6 child ticket becomes €3 when rewarded.
- Failed payment does not advance progress; duplicate notifications do not advance it twice.
- Concurrent purchases through one account cannot spend the same counter progress twice.
- Company bookings and guest purchases are excluded.

**Dependencies:** RIO-05, RIO-09, RIO-13. **Open:** Whether paid wheelchair tickets qualify (O-02); reward adjustments if refund/cancellation features are added (O-14).

### RIO-21 — Show loyalty progress and checkout savings

**Story:** As an account customer, I want to see progress and savings so I understand my reward.

**Acceptance criteria**
- The account shows current qualifying-ticket progress out of ten.
- Checkout shows the number of rewards and which ticket prices they reduce before payment.
- The customer can distinguish the ordinary child price from a loyalty reduction.
- Confirmation reflects the final charged amount and updated progress after successful payment.

**Dependencies:** RIO-20.

### RIO-22 — Deploy separate customer and staff websites

**Story:** As the cinema operator, I want separate deployed customer and staff websites so each audience has its own experience.

**Acceptance criteria**
- The customer website and staff administration website are deployed separately and each has its own accessible address.
- The customer website supports the customer booking flows delivered in the release.
- The staff website provides the dashboard and control hub delivered in the release, protected by staff authentication, roles, and city scope.
- Both websites use consistent screening and booking information; an allocation through either website prevents double booking through the other.

**Release group:** A — Guest purchase and essential operations. **Dependencies:** The customer and staff features selected for that release. **Open:** Hosting targets, addresses, and deployment arrangements (O-15). Separate websites do not prescribe separate databases or backend services.

## Cross-cutting acceptance and quality

- **API resilience:** With the movie-data API unavailable, customers can still browse retained screening information, select places, and complete bookings. This does not imply booking without Stripe or other essential payment services.
- **Inventory integrity:** No supported customer, staff, or company action can confirm the same place twice. Occupancy cannot exceed configured capacity.
- **Access control:** Enforce role, city, and customer ownership rules for all relevant reads and writes.
- **Usability and accessibility:** Apply gold/red/black with readable contrast; core booking actions support keyboard use, clear labels, and understandable validation. Agree a simple end-to-end usability exercise with the teacher.
- **Maintainability:** Keep seating, pricing, payment, and reservation-expiry rules clearly structured; document configuration and local setup. Verify critical rules and failure cases with meaningful tests.
- **Financial consistency:** Retain charged amounts and distinguish booking status, payment status, and invoice status. Settle rounding and currency before price acceptance tests are finalised.
- **Time consistency:** Display local cinema times clearly and calculate deadlines consistently in Europe/Helsinki.

## Open decision register

These are refinement tasks, not reasons to stop work on independent items. Customer-facing scope questions can go to the teacher; implementation details can be decided by the team within the delegated scope.

| ID | Decision | Affects |
| --- | --- | --- |
| O-01 | Confirm RIO name. | Branding |
| O-02 | Confirm seat 1 is within stated capacity; choose wheelchair identifiers and price category; decide loyalty eligibility for wheelchair tickets. | RIO-01, 05, 07, 20 |
| O-03 | Define administrator/cashier permissions, city scope, staff provisioning, and who may set prices or reserve manually. | RIO-02, 05, 11 |
| O-04 | Select movie-data provider and required metadata fields. | RIO-03, 06 |
| O-05 | Define duration/turnaround and changes/cancellation of screenings with bookings. | RIO-04 |
| O-06 | Define base-price scope, currency, rounding, and price changes during checkout; confirm or reject the proposed +15% premiere rule. | RIO-05, 09 |
| O-07 | Choose checkout-hold duration; define payment after hold expiry and isolated-seat validation with temporary holds or existing gaps. | RIO-07–09 |
| O-08 | Agree guest contact fields, confirmation delivery/retrieval, ticket admission validation, and Stripe setup. | RIO-09–10 |
| O-09 | Confirm six-place threshold counting; agree online/cinema settlement, manual reservation deadlines, and payment at the two-hour cutoff. | RIO-11, 14–16 |
| O-10 | Select dashboard metrics and define reporting calculations, period filters, and city visibility. | RIO-12 |
| O-11 | Choose account/contact fields, sign-in method, and recovery behaviour. | RIO-13 |
| O-12 | Clarify doors opening 30 minutes before show and advertising 12 minutes before show: exact meaning and where the app displays this. | RIO-06, 10 |
| O-13 | Define company request fields, screening selection, pricing, notifications, invoice terms/delivery/settlement, and external handoffs. | RIO-17–19 |
| O-14 | Decide whether customer cancellation/refund flows are in scope; if added, specify seat release, money handling, and loyalty adjustments. | Future backlog refinement |
| O-15 | Choose hosting targets, customer/staff website addresses, and separate deployment arrangements. | RIO-22 |

## Scrum working agreement — proposed for team adoption

- Keep one ordered product backlog. An epic/release group is not a sprint commitment.
- Before sprint selection, split oversized stories, resolve their blocking decisions, agree acceptance examples, identify dependencies, and estimate as a team. No story points are assigned here because estimates belong to the delivery team.
- Choose a Sprint Goal, then select work that supports it within team capacity. A useful first goal is a demonstrable guest journey from city selection to a correct seat selection; paid booking follows when Stripe integration is available.
- Review completed behaviour with the teacher and reorder the backlog as feedback changes priorities.
- Proposed Definition of Done: agreed acceptance criteria pass; relevant critical-rule and integration checks pass; applicable access and usability checks pass; changes are reviewed; configuration/setup notes are updated; behaviour is demonstrable in the project environment.
- Temporary payment simulations must be labelled as demonstrations: they do not process payments. Verify the completed Stripe integration using Stripe test mode, which does not charge real money. API simulations likewise do not verify a connection to the actual provider.

## Explicitly not yet committed

Premiere surcharge, automated debt collection, cinema playback/equipment control, advanced company pricing, and customer refund/cancellation features are not agreed delivery commitments. They require refinement or a new backlog item if requested. Separate customer and staff websites and their separate deployments are required under RIO-22; hosting and deployment arrangements remain to be agreed.
