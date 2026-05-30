# Whitecross Barbers — Edit Log

## 2026-05-30

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
