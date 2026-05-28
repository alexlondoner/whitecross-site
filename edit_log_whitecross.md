# Whitecross Barbers — Edit Log

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
