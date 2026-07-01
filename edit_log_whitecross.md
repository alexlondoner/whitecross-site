# Whitecross Barbers — Edit Log

## 2026-06-27 — Push öncesi finalize (toggle kaldırıldı, modal revert, noscript fix)

Owner kararı: "site logic'i tamamen aynı kalsın, premium altyapı gitsin ama toggle siteden kalksın (panele eklenecek), logo değişmesin". Buna göre 2026-06-25 tema işi şu şekilde ship edildi:
- **Theme toggle butonu KALDIRILDI** (`#themeToggle` + script). Premium hâlâ `?theme=premium` / localStorage ile önizlenir; canlı geçiş UI'ı ileride Salown paneline taşınacak. Default `original`.
- **Service modal REVERT** → orijinal (`modal-content` + `modal-title` + `modal-desc`). Sebep: 2026-06-25 kaydındaki `script.js` modal wiring (`WC_PRICE`/`WC_DUR`/`wcFillModalMeta`/`modalSelectBtn`) **gerçekte kaydedilmemiş** (commit'li script.js'te yok) → zengin modal ship edilseydi ölü "Select & Book" butonu + boş fiyat/süre satırı olurdu. Zengin modal ileride script.js wiring'i ile yapılacak.
- **`<noscript>` fallback** `premium` → `original` (JS-kapalı ziyaretçi de canlı görünümle aynı kalsın).
- **Logo DEĞİŞMEDİ:** `whitecross-logo.png` korundu; `whitecross-logo.svg`/`whitecross-icon.svg` orphan kaldı, push'a dahil edilmedi.
- **Cancellation kontrol:** `cancel.html` zaten `salownCancelByToken` + `salownGetBookingByToken` kullanıyor; politika penceresi 8h = salown enforcement (functions `salownCancelByToken` "at least 8 hours") ile birebir aynı → değişiklik gerekmedi.
- **Push seti:** `index.html`, `style.original.css`, `style.premium.css`, `edit_log_whitecross.md`. HARİÇ: `functions/index.js` (ilgisiz makbuz-deposit backend fix, ayrı `firebase deploy` ister), orphan SVG'ler.
- Kalan görünür fark (her iki tema): manage floater ikonları emoji→SVG (davranış aynı).

## 2026-06-25 — Premium tema + canlı theme toggle (original korunarak)

Kaynak: `Desktop/alex/design_handoff_whitecross_refresh/` (luxury visual refresh, drop-in style.css + SVG marka marks). Eski CSS'teki 125 class'ın hepsi yeni CSS'te mevcut (superset, +11 shop-* class) → markup'sız drop-in.

### Yeni dosyalar (whitecross-site/)
- `style.original.css` — eski tema (git HEAD'den birebir), açık isimli kopya
- `style.premium.css` — yeni champagne-gold premium tema (handoff deliverable)
- `whitecross-logo.svg`, `whitecross-icon.svg` — yeni dairesel madalyon marka + favicon (henüz markup'a bağlanmadı, opsiyonel)

### style.css
- DOKUNULMADI / orijinaline geri alındı → style.css'e direkt bağlı diğer 8 sayfa (about, gallery, products, success, terms, manage, london-barbers, products-success) eskisi gibi bozulmadan çalışıyor

### index.html
- `<head>`: bare `<link href="style.css">` yerine **theme loader** — `DEFAULT_THEME='original'` (per-tenant), `?theme=` + localStorage override, `document.write` ile `style.<theme>.css` yükler; `<noscript>` fallback premium
- Font link: Oswald 300;400;500;600;700 + Inter 400;500;600;700 (premium ağırlıkları için genişletildi; Great Vibes korundu, Cormorant premium CSS içinde @import)
- `</body>` öncesi: **#themeToggle** floating buton (sol-alt) — premium ↔ original anında href swap, glyph localStorage'a göre (✨ premium / ◆ original). Per-tenant gizlemek için display:none
- Default original → canlı görünüm değişmedi; premium toggle/`?theme=premium` ile önizlenir

### Service detail modal — reference'taki zengin görünüm (premium), original korunarak
Sorun: handoff deliverable modal'ı sadece basit p/ul/li boyuyordu; reference prototype'taki "THE SERVICE / £ · MIN / WHAT'S INCLUDED / SELECT & BOOK" zengin hali ship edilmemişti (sm-* stilleri reference HTML'de inline'dı).
- `index.html` #infoModal: `.sm-label` eyebrow, `.sm-meta` (#modal-price + .sm-dot + #modal-duration), `.sm-divider`, `<button class="submit-btn sm-cta" id="modalSelectBtn">` eklendi; modal-content'e `service-modal` class
- `script.js`: WC_PRICE + WC_DUR map'leri (21 servis, markup'tan), `wcRichDesc()` ("What's included" etiketi <ul> öncesi enjekte), `wcFillModalMeta()` (price/dur doldur + CTA'yı selectService'e bağla); openServiceStory iki dalı da güncellendi
- `style.premium.css`: `.service-modal/.sm-label/.sm-meta/.sm-price/.sm-dot/.sm-dur/.sm-divider/.sm-inc-title/.sm-cta` (reference'tan port) + service-modal'da başlık alt-çizgisi kaldırıldı (sm-divider ayırıyor)
- `style.original.css`: `.sm-label,#modal-meta,.sm-divider,.sm-inc-title,.sm-cta{display:none!important}` → original modal birebir eskisi gibi
- Süreler (WC_DUR) tahmini; owner doğrular. Fiyatlar markup'tan kesin.

### Manage-booking floater (sağ-alt) — premium reskin
Floater markup'ı inline-styled (legacy altın) olduğu için premium CSS onu ezemiyordu → premium'da eski kalıyordu.
- `style.premium.css`: `#manageBtn` (yumuşak gold gradient + premium gölge), `#managePanel a` (#16130e zemin, gold hairline, --gold metin, 0.66rem/0.14em), Book Now pill `[href*="bookingForm"]` primary gold, `#managePanel a span{display:none}` (pill emoji'leri kaldırıldı) — hepsi `!important` ile inline'ı ezer
- Sadece premium.css'te → toggle'a basınca (CSS href swap) anında yenilenir; original theme inline görünümünü korur
- Trigger butonu ikonu hâlâ 📋 emoji (JS textContent ile değişiyor); istenirse line-icon'a çevrilir
  → **YAPILDI (her iki temada):** owner "ikon line-icon olsun + bu temizliği eski whitecross temasında da olsun, daha prof" dedi. Markup değişti (her iki temayı etkiler): pill emoji'leri (📋📞✂) kaldırıldı (düz tracked metin), trigger ikonu **clipboard SVG** (stroke #0a0907, gold daire her iki temada). JS: `WC_ICON_MENU`/`WC_ICON_CLOSE` SVG sabitleri, toggle + dışarı-tıklama artık `innerHTML` ile clipboard↔X swap (eski `textContent` emoji yerine). Renkler tema bazında: original gold (#d4af37 inline), premium champagne override.


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

## 2026-06-27 — Favicon değişimi (whitecrossbarbers.com / GitHub Pages)
- **Sorun**: Eski `favicon.png` tüm detaylı logoydu (beyaz zemin + minik yazılar) → 16px sekme/Google sonucunda okunmaz, soluk leke. Kullanıcı Google'da "barbers near old street" aramasında fark etti.
- **Çözüm**: `whitecross-icon.svg` → kalın makas-içinde-daire varyantına güncellendi (koyu #0a0907 zemin, altın #c9a24b kenar/#e6cd8b makas, stroke 3.6, ince iç dekoratif halka atıldı). 32px+ boyutlarda net.
- **index.html** head: `favicon.png` referansları kaldırıldı → `rel="icon"` SVG + 180px PNG fallback + apple-touch-icon.
- **whitecross-icon-180.png**: SVG'den yeniden üretildi (Apple/eski tarayıcı + Google).
- Commit 7c6bc3cc, push origin/main. GitHub Pages yayınlar; Google favicon önbelleği gecikmeli güncellenir.
- Panel uygulamaları (barber-panel/client-app/barber-mobile) DOKUNULMADI — legacy, Whitecross artık salown-app kullanıyor.

## 2026-06-27 — SEO title güncellemesi (CTR + "Old Street" alaka)
- **Neden**: "barbers near old street" aramasında Huckles/Murdock'tan sonra çıkmaya başladık; title'a hem hook hem "Old Street" eklendi.
- **Eski**: "Barbers London EC1 | I CUT Whitecross Barbers, Clerkenwell"
- **Yeni**: "Barbers near Old Street | Book in Seconds – Whitecross EC1" (58 karakter, Google kesmez)
- `<title>` + `og:title` + `twitter:title` üçü de güncellendi (tutarlılık).
- Not: title sıralamayı Huckles/Murdock üstüne taşımaz (domain otoritesi/GMB/yorum işi); alaka + CTR içindir.

## 2026-07-01 — Ana sayfa kayan yorumlara 5 yeni Google yorumu (tarihli)
- **Neden**: en güncel 5 Google yorumu (Thor Bengtsson 1 Jul, Harry Atkins 25 Jun, Shaggy Goatboy 24 Jun, Hanafi + Huseyin Arkin 17 Jun 2026) en başta çıksın; millet dükkanın güncel/aktif olduğunu görsün.
- `index.html` — `#testimonialsTrack` marquee'sinin İKİ yarısına da (animasyon -50% kaydığı için loop pürüzsüz kalsın diye) 5 kart en öne eklendi. Toplam 32 kart = 16/yarım.
- İsmin altına `<span class="t-date">` ile tarih eklendi (güncellik sinyali).
- `style.css` — yeni `.t-date` stili (küçük, soluk altın, isim altında blok).
- Not: sayfa başındaki JSON-LD review datası (SEO) bu yorumlarla GÜNCELLENMEDİ — istenirse eklenir.

## 2026-07-01 (ek) — JSON-LD yorumları + reviewCount güncel
- `index.html` — sayfa başındaki JSON-LD `"review"` dizisine aynı 5 yeni yorum (Thor/Harry/Shaggy Goatboy/Hanafi/Huseyin Arkin) `datePublished` ile en başa eklendi (SEO). İki ld+json bloğu da valid doğrulandı.
- `index.html` + `london-barbers.html` — `aggregateRating.reviewCount` 408 → 413 (Alex'in verdiği güncel sayı).
- "over 400 reviews" metinleri değişmedi (413 hâlâ 400+).
- Aylık hatırlatma kuruldu: trigger `trig_01Jn7y3oqcABTkD8r6Z25PXV`, her ayın 1'i 10:00 (push+email), fresh session; ilk çalışma 1 Ağu 2026.
