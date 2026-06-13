# Whitecross Barbers — Edit Log

## 2026-06-13 — New Google reviews added (Ian Uvas, Anthony Lamont, Jamie Marshall)

### whitecross-site/index.html
- **Carousel testimonials** — 3 new reviews added to both sets (first + duplicate) for infinite scroll
- **LD+JSON schema** — 3 new Review objects added with `datePublished` (Ian Uvas: 2026-06-13, Anthony/Jamie: 2026-05-30)

### whitecross-site/london-barbers.html
- New 3 reviews placed at top of testimonials grid with month/year labels

---

## 2026-06-13 — SEO foundations for London / Central London ranking

### Goal
Lay groundwork for organic ranking on broad London searches ("london barbers", "barbers central london", "best barbers london") — white-hat only, no penalty risk.

### whitecross-site/index.html
- **Title** shortened + rewritten — was 92 chars (Google truncates at ~60) and buried "London". Now: `Barbers London EC1 | I CUT Whitecross Barbers, Clerkenwell` (59 chars, leads with target keyword)
- **Meta description** updated — now leads with "Award-winning London barbers in Central London"
- **Meta keywords** expanded — added "barbers london", "london barbers", "central london barbers", "barbershop london", etc.
- **OG/Twitter tags** updated to match new title/description
- **Schema `areaServed`** added to Barbershop LD+JSON — lists London, Central London, Clerkenwell, City of London, Islington, Shoreditch, Old Street, Barbican, Moorgate, Holborn, Farringdon
- **FAQ schema added** — new `FAQPage` LD+JSON block targeting "where is", "how much", "walk-ins", "best barbers london", "nearest tube" queries (helps appear in People Also Ask)
- **SEO content section added** to body — visible paragraph block above footer with natural "barbers London / Central London barbers" keyword usage; links to `/london-barbers.html`

### whitecross-site/london-barbers.html (NEW FILE)
- Dedicated landing page targeting "london barbers", "barbers london", "central london barbers", "best barbers london"
- Full Barbershop + FAQPage LD+JSON
- Visible content: hero, services grid with prices, tube station pills, testimonials, CTA to book
- Canonical URL set; links back to homepage booking form
- Google Analytics tag included

### whitecross-site/sitemap.xml
- Added `/london-barbers.html` with priority 0.9 (second only to homepage)
- Refreshed all `lastmod` dates to 2026-06-13

## 2026-06-12 (follow-up) — script.js: window.ACTIVE_BARBERS dead-code fix

### whitecross-site/script.js
- **Bug**: `window.ACTIVE_BARBERS` was always `undefined` (ACTIVE_BARBERS is a closure-scoped `let`, not on window). The all-blocked no-preference race check therefore had `allAB = []` → condition was always false → slot silently accepted regardless of barbers' calendars.
- **Fix**: changed `window.ACTIVE_BARBERS` to `ACTIVE_BARBERS` (direct closure reference).
- **Proof log**: added `console.log('[race-check] no-preference, checking N barbers')` — verify N > 0 in browser console on a real no-preference booking attempt.

## 2026-06-12 — script.js + Reschedule.html fixes

### whitecross-site/script.js
- **`isUkDst(y,m,d,h)` added** (last-Sunday-of-March/October helper, same as BookingPage.jsx + functions/index.js)
- **`toStartAndEnd` rewritten** — uses `Date.UTC + BST offset` instead of browser-local `new Date() + setHours()`. A 14:00 booking from a UTC+2 browser now writes 13:00 UTC (UK BST), same as from a UK browser. Old code produced 12:00 UTC — 1 hour shifted.
- **No-preference race check fixed** (`proceedToPayment`): when `bId` + `bNm` both empty, marks taken only if EVERY active barber has a conflict. Previously silently passed for any no-preference booking.
- **No-preference slot assignment** (`renderSlots`): uses `reduce` to find least-busy barber (fewest busy-range entries in busyMap), instead of always picking first available.

### whitecross-site/Reschedule.html
- `confirmReschedule()`: detects when user selected a different barber (`selectedBarberObj.id !== currentBookingData.barberId`); sends `newBarberId`+`newBarberName` to `salownRescheduleByToken` only in that case. Success screen already showed chosen barber name — now it will be accurate.

## 2026-05-30

### barber-panel — Reports.js add-ons hesaplamaya eklendi
- `soldAddOnsTotal(b)` helper fonksiyonu eklendi (`soldAddOns` array'ini hesaplar)
- `addOnRevenueGross` memo eklendi, `grossRevenue`'ya dahil edildi
- `financeGrouped`'a `addOnGross` eklendi; group header'da görünür (> 0 ise)
- Breakdown tablo: 'Add-ons' sütunu eklendi (turuncu, 0 ise '—')
- Satır toplamı: `service + addOn + products - disc + tip` olarak güncellendi
- Özet kartlara 'Add-ons Gross' (turuncu) eklendi
- CSV export'a 'Add-ons Gross' sütunu eklendi

### barber-panel — Home.js header row + compact spacing
- **Header** flex row'a çevrildi: greeting solda (1.5rem→1.1rem, date 0.62→0.58rem, marginTop 5px→3px), Walk-in + New Booking butonları sağda inline
- **Summary strip** marginBottom: 14px → 8px
- **App.js main** padding-top: 60px → 48px (ProfileBar ile hizalama)

### barber-panel — Sign Out Sidebar → ProfileBar dropdown'a taşındı
- **Sidebar.js**: `onLogout` prop kaldırıldı, Sign Out butonu (~20 satır) silindi
- **ProfileBar.js**: `onLogout` prop eklendi; dropdown'un altına divider + kırmızı Sign Out butonu eklendi
- **App.js**: Sidebar'dan `onLogout={handleLogout}` kaldırıldı, ProfileBar'a eklendi

### barber-panel — Sidebar.js mini calendar kaldırıldı
- `getDaysInMonth`, `getFirstDay` import'ları silindi
- `CAL_MONTHS` sabiti silindi
- `calMonth` / `setCalMonth` state silindi
- Tüm `{/* MINI CALENDAR */}` bloğu (~40 satır) kaldırıldı
- `nav` zaten `flex:1` taşıdığından oluşan boşluğu otomatik dolduruyor

### barber-panel — Home.js CSS compact düzeltmeleri
- **cHead** padding: `12px 16px` → `11px 14px` (tüm card header'lar)
- **Header** marginBottom: `20px` → `12px` (sayfa başı boşluk azaltıldı)
- **Summary strip** marginBottom: `20px` → `14px`
- **Summary kartları** padding: `14px 16px` → `10px 14px`, icon `1.1rem` → `0.9rem`, value `1.5rem` → `1.3rem`, label `0.55rem` → `0.53rem`, sub `0.6rem` → `0.57rem`, progressBar marginTop `8px` → `6px`
- **Ana grid** gap: `14px` → `10px`
- **Today's Schedule kartı** `flex:1` eklendi (sağ kolonda tam yükseklik doldurur)

### SEO — Clerkenwell bölge eklendi (5 sayfa)
- **index.html**: `<title>` → "Clerkenwell Barbershop | EC1Y London"; meta description, OG title, OG description, Twitter title, Twitter description, JSON-LD description'a "in Clerkenwell, EC1Y London" eklendi
- **about.html**: `<title>`, meta description, OG title, OG description → Clerkenwell öne çıkarıldı
- **gallery.html**: `<title>`, meta description, keywords, OG title, OG description → Clerkenwell eklendi
- **products.html**: `<title>` ve meta description → Clerkenwell eklendi
- **announcements.html**: `<title>` ve meta description → Clerkenwell eklendi
- Sebep: Whitecross Street EC1Y 8QJ adresinin Clerkenwell bölgesinde olmasına rağmen title/description taglarında hiç geçmiyordu; sadece keywords ve addressLocality'de vardı

## 2026-05-29

### WalkInForm.js + BookingForm.js — Geçmiş tarihe ekleme uyarısı
- **Neden:** Takvimde geçmiş bir güne bakılırken yanlışlıkla o güne walk-in/booking eklenebiliyordu; kullanıcı fark etmeden kayıt atılıyordu.
- **Fix — WalkInForm:** `handleSave` içinde geçmiş tarih tespiti eklendi. Kaydetmeden önce tarih bugünden önce ise form üzerinde sarı uyarı overlay açılır. "No, go back" → formu kapatır (takvimden doğru tarih seçilir), "Yes, add it" → kayıt yapılır.
- **Fix — BookingForm:** Aynı mantık. Önceki `alert('Cannot book a past date.')` hard-block kaldırıldı, aynı overlay sistemiyle değiştirildi. Sadece yeni kayıtlarda (`!isEdit`) tetiklenir; edit modunda geçmiş tarih düzenleme zaten kasıtlıdır.
- **Teknik:** `handleSave` → `doSave` ayrımı yapıldı. Geçmiş tarih tespitinde `pendingGoCheckout` state ile Checkout/Save ayrımı korundu.

## 2026-05-28 (3)

### Dashboard.js — Blok endTime Timestamp bug düzeltildi
- **Sorun:** `blockTime` Firebase'e `endTime: Timestamp` olarak kaydediyor ama fetch sırasında sadece `time` (başlangıç) string'e dönüştürülüyordu; `endTime` ham Timestamp kalıyordu. `convertTo24(Timestamp)` → 0 döndürdüğünden blok her zaman 30 dakika görünüyordu.
- **Fix:** `fetchedBookings` map'inde `endTimeDate = d.endTime?.toDate?.()` ile `endTime` string'e çevrildi (aynı format: "4:00 PM"). Bu değer `...d` spread'inden gelen Timestamp'ın üzerine yazar.

## 2026-05-28 (2)

### Dashboard.js — Source pills taşındı footer'a
- Üst pill bar: sadece Total, Confirmed, Pending, Checked Out, Revenue, Discount Given, Tips kaldı
- Source piller (Booksy, Fresha, Treatwell, Website, Walk-in, App) alt footer bar'a taşındı
- Footer bar (TimeGrid altındaki 40px şerit): her zaman görünür, veri yokken soluk, veri varsa renkli + adet gösterir, tıklanabilir (filter)
- `ALL_PILLS`, settings panel listesi ve `hasAnySourcePill` temizlendi

## 2026-05-28

### Dashboard.js — Stat Pill visibility logic fix
- Added `pendingCount` variable (near `checkedOutCount`) for Pending pill
- **Pending pill**: now hides when count=0 (`&& pendingCount > 0`), shows only when there are actual pending bookings (or settings override via visiblePills)
- **Source pills** (Booksy, Fresha, Treatwell, Website, Walk-in, App): removed `&& sourceCount.X > 0` condition — now purely settings-controlled. Enabling in settings always shows them (faded when 0). Previously settings override was broken.
- **Total, Confirmed, Checked Out**: unchanged — always show when settings enabled, faded when 0.
