# Multi-Tenant Debt

Every place `whitecross` is hardcoded. Migration day: find these, replace with `tenantId` from context.

---

## functions/emailParsers.js
All Firestore writes hardcoded — `tenants/whitecross/bookings`
- Line 86, 133, 165, 187, 254, 292, 331

## functions/index.js
- Line 91 — `tenants/whitecross/barbers`
- Line 340, 380, 389, 409, 451 — `tenants/whitecross/bookings`
- Line 454, 1580 — `tenantId: 'whitecross'` (custom claims + doc write)
- Line 633, 786, 938, 1013, 1060, 1115, 1197 — Firestore trigger paths `tenants/whitecross/bookings/{bookingId}`
- Line 651, 805, 1214 — `tenants/whitecross/settings/settings`
- Line 1006, 1053, 1108, 1159 — `writeNotification(db, 'whitecross', ...)`
- Line 1171 — `tenants/whitecross/bookings`
- Line 1233, 1237 — `tenants/whitecross/clients`
- Line 1508 — `tenants/whitecross/clients`
- Line 1559, 1588 — `tenants/whitecross/staff/{uid}`

---

## barber-panel/src

### Already using `const TENANT = 'whitecross'` (1 line to change each)
- `firestoreActions.js:4` — `const TENANT = 'tenants/whitecross'`
- `Finance.js:9` — `const TENANT = 'whitecross'`
- `Services.js:6` — `const TENANT = 'whitecross'`
- `Announcements.js:5` — `const TENANT = 'whitecross'`
- `Gallery.js:6` — `const TENANT = 'whitecross'`
- `Clients.js:6` — `const TENANT = 'whitecross'`
- `Barbers.js:5` — `const TENANT = 'whitecross'`
- `Calendar.js:5` — `const TENANT = 'whitecross'`
- `Settings.js:9` — `const TENANT = 'whitecross'`

### Hardcoded in queries (need find+replace)
- `App.js:24` — `tenants/whitecross/services`
- `App.js:62` — `tenants/whitecross/staff`
- `firestoreActions.js:197, 241, 284` — `tenantId: 'whitecross'`
- `firestoreActions.js:407` — `tenants/whitecross/barbers`
- `WalkInForm.js:64` — `tenants/whitecross/clients`
- `AddClientModal.js:15` — `tenants/whitecross/clients`
- `BookingDetail.js:152` — `tenants/whitecross/bookings`
- `BookingForm.js:66` — `tenants/whitecross/clients`
- `Dashboard.js:77, 152, 153, 154` — settings, bookings, barbers
- `Bookings.js:136, 175, 189, 333` — bookings, barbers, clients
- `Reports.js:167, 168` — bookings, barbers
- `Settings.js:463, 488, 512, 535, 595, 617, 666, 678` — bookings, clients, barbers, expenses

---

## Migration approach (when the time comes)
1. Add `tenantId` to auth context / app config (read from Firebase custom claims or URL)
2. Files with `const TENANT = 'whitecross'` → swap to `const TENANT = getTenantId()`
3. `functions/index.js` → pass `tenantId` via request context or auth token
4. `emailParsers.js` → accept `tenantId` as parameter instead of hardcoding
5. Firestore trigger paths (`tenants/whitecross/...`) → one CF deployment per tenant OR wildcard `tenants/{tenantId}/...`
