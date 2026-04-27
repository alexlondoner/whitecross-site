console.log("SCRIPT LOADED");

const stories = {
    royal: { title: "I CUT Royal", content: `<p><strong>A premium grooming experience designed for structure, relaxation, and a complete reset.</strong></p><p>This service combines a detailed haircut, full beard work, and facial care into one seamless journey.</p><ul><li><strong>Bespoke Haircut:</strong> Any style you like, tailored to your head shape, hair type, and lifestyle.</li><li><strong>Beard Trim & Razor Shape-Up:</strong> Your beard is sculpted for symmetry and definition, with a straight-razor finish on the cheeks and neckline for sharp, clean borders.</li><li><strong>Shampoo Wash:</strong> A thorough cleanse to remove product build-up and refresh the scalp.</li><li><strong>Cleansing Face Mask & Scrub:</strong> Deep-cleansing and exfoliation to purify the skin and smooth texture.</li><li><strong>Face Steam:</strong> Warm steam opens the pores, softens the skin, and enhances product absorption.</li></ul><p><strong>I CUT Royal</strong> is for those who want more than a haircut – it's a full reset of your look and presence.</p>` },
    deluxe: { title: "I CUT Deluxe", content: `<p><strong>The ultimate grooming ritual designed for the modern gentleman.</strong></p><p>This is more than a service; it is a complete restoration of your style and composure.</p><ul><li><strong>Bespoke Haircut & Beard Sculpting:</strong> Tailored to your facial structure and personal style.</li><li><strong>Precision Razor Finish:</strong> Traditional straight-razor detailing for crisp, clean lines.</li><li><strong>Facial Restoration:</strong> Deep-cleansing treatment paired with a revitalising face mask to purify, soothe, and tone your skin.</li><li><strong>Total Relaxation:</strong> The signature Whitecross touch – a soothing hot towel treatment and an invigorating arm massage to melt away the stress of the week.</li></ul><p><strong>I CUT Deluxe</strong> ensures you leave looking sharp and feeling fully renewed.</p>` },
    fade_service: { title: "Full Skin Fade & Beard Luxury", content: `<p><strong>Skin Fade Haircut + Beard + Wash + Hot Towel.</strong></p><p>The complete package for a fresh look and total relaxation.</p><ul><li><strong>The Fade:</strong> A professional skin fade (zero/bald on the sides) blended perfectly into your chosen style on top.</li><li><strong>The Beard:</strong> Full beard trim and shape-up using warm shaving foam and a sharp straight-razor for clean, defined lines.</li><li><strong>The Refresh:</strong> A relaxing hair wash followed by a steaming hot towel for your face.</li><li><strong>The Bonus:</strong> A therapeutic arm and hand massage to help you unwind while you're in the chair.</li></ul><p>Leave looking sharp and feeling like a new man.</p>` },
    experience: { title: "The Full Experience", content: `<p><strong>A complete grooming package that brings together haircut, styling, and relaxation.</strong></p><p>Designed to feel like a full reset rather than just a quick visit.</p><ul><li><strong>Haircut & Style:</strong> A tailored cut shaped to your features and finished with professional styling.</li><li><strong>Beard or Detailing Work (where applicable):</strong> Light grooming to keep everything clean and balanced.</li><li><strong>Relaxation Elements:</strong> May include hot towel, scalp massage, or light facial care depending on your needs.</li></ul><p><strong>The Full Experience</strong> is ideal when you want to slow down, reset, and walk out feeling fully put together.</p>` },
    senior_full: { title: "Senior Full Experience (65+)", content: `<p><strong>A complete, comfort-focused grooming experience for clients aged 65 and above.</strong></p><p>This service combines a classic haircut with gentle grooming and a relaxed pace.</p><ul><li><strong>Classic Haircut:</strong> Neat, comfortable, and easy to maintain.</li><li><strong>Beard or Facial Tidy (if requested):</strong> Light trimming and clean-up for a well-kept look.</li><li><strong>Comfort-First Approach:</strong> Extra time, care, and attention to ensure a calm, respectful experience.</li></ul><p>Perfect for those who value both appearance and comfort in equal measure.</p>` },
    skin_fade: { title: "Skin Fade Cut", content: `<p><strong>A modern skin fade focused on clean transitions and sharp detail.</strong></p><p>The sides and back are taken down to the skin and blended smoothly into the length on top, creating a strong, defined look. Ideal if you want a fresh, contemporary style that holds its shape between visits.</p>` },
    scissor: { title: "Scissor Cut", content: `<p><strong>A haircut performed primarily with scissors for natural movement and shape.</strong></p><p>Perfect for medium to longer hairstyles, this service focuses on layering, texture, and flow rather than harsh clipper lines. Ideal if you want a softer, more tailored finish.</p>` },
    short_back: { title: "Classic Short Back & Sides", content: `<p><strong>A timeless, clean haircut that works in any setting.</strong></p><p>The sides and back are neatly tapered while the top is shaped to suit your style. A balanced choice if you want something smart, low-maintenance, and versatile for both work and everyday life.</p>` },
    shave: { title: "Hot Towel Shave", content: `<p><strong>A traditional shaving service built around comfort and closeness.</strong></p><p>Warm towels are applied to open the pores and soften the beard before a close razor shave. This helps achieve a smoother result while relaxing the skin and reducing irritation.</p>` },
    clipper: { title: "Clipper Cut", content: `<p><strong>A clean, all-clipper haircut for a sharp and simple finish.</strong></p><p>Ideal for short, even styles such as buzz cuts, tapers, or basic fades. Quick, precise, and easy to maintain if you prefer a straightforward, no-fuss look.</p>` },
    senior: { title: "Senior Haircut (65+)", content: `<p><strong>A comfortable, classic haircut for clients aged 65 and above.</strong></p><p>The focus is on neatness, ease of maintenance, and a relaxed experience. The service is carried out gently and professionally to ensure you feel at ease throughout.</p>` },
    young: { title: "Young Gents (0–12)", content: `<p><strong>A haircut service specially for boys aged 0 to 12 years.</strong></p><p>The hair is trimmed or styled using clippers on the back and sides to keep it neat and blending into top with scissors, after required amount cutting from the top of the hair to keep it balanced and age-appropriate. The service is usually quick and carried out in a child-friendly manner to ensure a relaxed experience.</p>` },
    young_gents_skin_fade: { title: "Young Gents Skin Fade (4–12)", content: `<p><strong>A modern skin fade tailored for boys aged 4 to 12.</strong></p><p>The sides and back are faded down to the skin and blended into longer hair on top, creating a clean, stylish look that is still practical and easy to manage for everyday life.</p>` },
    full_facial: { title: "Full Facial Treatment", content: `<p><strong>A complete skincare service designed to refresh and restore the face.</strong></p><p>This includes deep cleansing, exfoliation, massage, mask, and moisturising to rejuvenate the skin. Ideal if you want to hydrate, brighten, and improve overall skin health for a more radiant look.</p>` },
    beard_dye: { title: "Beard Dyeing", content: `<p><strong>A colouring service for the beard to enhance or restore its tone.</strong></p><p>Beard dyeing can be used to cover grey, deepen your natural shade, or create a more defined look. We use products formulated for facial hair to keep the beard and skin healthy while achieving an even, natural finish.</p>` },
    face_mask: { title: "Face Mask", content: `<p><strong>A targeted facial treatment to cleanse and condition the skin.</strong></p><p>The mask helps draw out impurities, refine texture, and support hydration. A simple but effective add-on if your skin feels tired, dull, or congested.</p>` },
    face_steam: { title: "Face Steam", content: `<p><strong>A steam-based treatment to open pores and refresh the skin.</strong></p><p>Warm steam helps loosen impurities, improve circulation, and prepare the face for further treatments such as masks or shaves. It leaves the skin feeling softer, cleaner, and more receptive to products.</p>` },
    threading: { title: "Threading", content: `<p><strong>Precision hair removal using traditional threading techniques.</strong></p><p>Ideal for eyebrows and fine facial hair, threading allows for sharp definition without the use of chemicals. A great option if you want clean lines and a tidy finish around the brows or other small areas.</p>` },
    waxing: { title: "Waxing (Nose & Ears)", content: `<p><strong>A focused grooming service for unwanted hair in the nose and ears.</strong></p><p>Waxing removes hair from the root for a smoother, longer-lasting result compared to trimming. A small detail that makes a big difference to your overall appearance.</p>` },
    shape_up_clean_up: { title: "Shape Up & Clean Up", content: `<p><strong>A grooming service that sharpens what you already have.</strong></p><p>We focus on defining hairlines, tidying edges, and cleaning up stray hairs around the forehead, neck, and sides. Ideal between full haircuts when you want to look sharp without a complete restyle.</p>` },
    wash_style_hot_towel: { title: "Wash, Style & Hot Towel", content: `<p><strong>A grooming service that combines hair washing, styling, and relaxation.</strong></p><p>Your hair is washed, professionally styled, and finished with a soothing hot towel treatment. Perfect before an event, meeting, or night out when you want to feel fresh and well-presented.</p>` }
};

/* --- MODAL FUNCTIONS --- */
function selectService(value) {
    const serviceEl = document.getElementById('service');
    if (serviceEl) serviceEl.value = value;
    closeInfo();
    document.getElementById('bookingForm').scrollIntoView({ behavior: 'smooth' });
    const dateInput = document.getElementById('date');
    if (dateInput && dateInput.value) checkAvailability(dateInput.value);
}

function openStory(type) {
    const modal = document.getElementById('infoModal');
    const title = document.getElementById('modal-title');
    const desc = document.getElementById('modal-desc');
    if (modal && stories[type]) {
        title.innerHTML = stories[type].title;
        desc.innerHTML = stories[type].content;
        modal.style.display = 'flex';
    }
}

function closeInfo() {
    const modal = document.getElementById('infoModal');
    if (modal) modal.style.display = 'none';
}

document.addEventListener('click', function (event) {
    const modal = document.getElementById('infoModal');
    if (modal && event.target === modal) closeInfo();
});

const TENANT = 'whitecross';
let ACTIVE_BARBERS = [];

/* --- MAIN INIT --- */
document.addEventListener('DOMContentLoaded', function () {
    const barberGrid = document.getElementById('barberGrid');
    const barberHidden = document.getElementById('barber');

    async function fetchActiveBarbers() {
        try {
            const db = window._db;
            const { collection, getDocs } = window._firebase;
            const snap = await getDocs(collection(db, 'tenants/' + TENANT + '/barbers'));
            ACTIVE_BARBERS = snap.docs
                .map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); })
                .filter(function(b) { return b && b.active !== false; })
                .sort(function(a, b) { return (a.order || 999) - (b.order || 999); });
        } catch (err) {
            console.warn('Failed to load barbers:', err);
            ACTIVE_BARBERS = [];
        }
    }

    function renderBarberButtons() {
        if (!barberGrid) return;
        var dynamicBtns = ACTIVE_BARBERS.map(function(b) {
            return '<button type="button" class="barber-btn" id="barber-' + b.id + '" data-value="' + b.id + '">' +
                '<span class="barber-icon">\u2702\uFE0F</span>' +
                '<span class="barber-name">' + b.name + '</span>' +
                '</button>';
        }).join('');
        barberGrid.innerHTML = dynamicBtns +
            '<button type="button" class="barber-btn" id="barber-no-preference" data-value="no-preference">' +
            '<span class="barber-icon">\u2B50</span>' +
            '<span class="barber-name">No Preference</span>' +
            '</button>';
    }

    function bindBarberSelector() {
        document.querySelectorAll('.barber-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.barber-btn').forEach(function(b) { b.classList.remove('selected'); });
                btn.classList.add('selected');
                if (barberHidden) barberHidden.value = btn.dataset.value;
                var d = document.getElementById('date').value;
                if (d) checkAvailability(d);
            });
        });
    }

    function startBarberRealtimeSync() {
        try {
            var db = window._db;
            var firebase = window._firebase;
            if (typeof firebase.onSnapshot !== 'function') return;
            var barbersRef = firebase.collection(db, 'tenants/' + TENANT + '/barbers');
            firebase.onSnapshot(barbersRef, function(snap) {
                ACTIVE_BARBERS = snap.docs
                    .map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); })
                    .filter(function(b) { return b && b.active !== false; })
                    .sort(function(a, b) { return (a.order || 999) - (b.order || 999); });
                renderBarberButtons();
                bindBarberSelector();
                var d = document.getElementById('date') && document.getElementById('date').value;
                if (d) checkAvailability(d);
            }, function(err) {
                console.warn('Realtime barber sync failed:', err);
            });
        } catch (err) {
            console.warn('Realtime barber sync failed:', err);
        }
    }

    async function initBarberSelector() {
        // Firebase module yüklenene kadar bekle
        var attempts = 0;
        while ((!window._db || !window._firebase) && attempts < 20) {
            await new Promise(function(r) { setTimeout(r, 100); });
            attempts++;
        }
        await fetchActiveBarbers();
        renderBarberButtons();
        bindBarberSelector();
    }

    var SCHEDULE = [
        { day: 'Monday', open: '09:00', close: '19:00', closed: false },
        { day: 'Tuesday', open: '09:00', close: '19:00', closed: false },
        { day: 'Wednesday', open: '09:00', close: '19:00', closed: false },
        { day: 'Thursday', open: '09:00', close: '19:00', closed: false },
        { day: 'Friday', open: '09:00', close: '19:00', closed: false },
        { day: 'Saturday', open: '09:00', close: '19:00', closed: false },
        { day: 'Sunday', open: '10:00', close: '16:00', closed: false },
    ];
    var JS_TO_SCHEDULE = [6, 0, 1, 2, 3, 4, 5];

    function getLocalDate(dateStr, h, m) {
        var parts = dateStr.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2], h || 0, m || 0, 0, 0);
    }

    function timeToMins(t) {
        var parts = t.split(':').map(Number);
        return parts[0] * 60 + parts[1];
    }

    /* DATE & TIME LOGIC */
    var dateInput = document.getElementById('date');
    var now = new Date();
    var todayStr = now.toISOString().split('T')[0];

    if (dateInput) {
        dateInput.setAttribute('min', todayStr);
        var maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + 90);
        dateInput.setAttribute('max', maxDate.toISOString().split('T')[0]);
        dateInput.value = '';
        dateInput.addEventListener('change', function() {
            checkAvailability(this.value);
        });
    }

    /* PHONE VALIDATION */
    var phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            var v = this.value.replace(/[^0-9+\s]/g, '');
            if (v && !v.startsWith('+')) v = '+' + v;
            this.value = v;
        });
        phoneInput.addEventListener('blur', function() {
            var phoneRegex = /^\+[0-9]{1,3}\s?[0-9]{6,14}$/;
            if (this.value && !phoneRegex.test(this.value)) {
                this.style.borderColor = '#ff6b6b';
            } else {
                this.style.borderColor = '#333';
            }
        });
    }

    /* PREFETCH DUPLICATE CHECK */
    var _dupCachePhone = '';
    var _dupCacheDate = '';
    var _dupCacheResult = null;

    function prefetchDuplicate() {
        var phone = document.getElementById('phone').value.trim();
        var date = document.getElementById('date').value;
        if (!phone || !date) return;
        if (phone === _dupCachePhone && date === _dupCacheDate) return;
        _dupCachePhone = phone;
        _dupCacheDate = date;
        _dupCacheResult = null;
        var url = 'https://script.google.com/macros/s/AKfycbzJjVnihDm3vqoWJznZvbg6ayE71688rxXa-OyrHG3-nlrwGCBMfNc77eE-dyLcfQ7P/exec?check=duplicate&phone=' + encodeURIComponent(phone) + '&date=' + encodeURIComponent(date);
        fetch(url).then(function(r) { return r.json(); }).then(function(result) { _dupCacheResult = result; }).catch(function() {});
    }

    document.getElementById('phone').addEventListener('blur', prefetchDuplicate);
    document.getElementById('date').addEventListener('change', prefetchDuplicate);

    /* EMAIL VALIDATION */
    var emailInput = document.getElementById('email');
    if (emailInput) {
        emailInput.addEventListener('blur', function() {
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (this.value && !emailRegex.test(this.value)) {
                this.style.borderColor = '#ff6b6b';
            } else {
                this.style.borderColor = '#333';
            }
        });
    }

    /* HOURS WIDGET */
    (function() {
        var currentTime = now.getHours() * 60 + now.getMinutes();
        var todayIdx = JS_TO_SCHEDULE[now.getDay()];

        function timeToMinsLocal(t) { var p = t.split(':').map(Number); return p[0] * 60 + p[1]; }
        function format12(t) {
            var p = t.split(':').map(Number);
            return (p[0] % 12 || 12) + ':' + (p[1] === 0 ? '00' : p[1]) + ' ' + (p[0] >= 12 ? 'PM' : 'AM');
        }

        var today = SCHEDULE[todayIdx];
        var isOpen = currentTime >= timeToMinsLocal(today.open) && currentTime < timeToMinsLocal(today.close);
        var statusEl = document.getElementById('hoursStatus');

        if (statusEl) {
            if (isOpen) {
                var diff = timeToMinsLocal(today.close) - currentTime;
                statusEl.innerHTML = '<span class="status-dot open"></span> OPEN NOW (Closes in ' + Math.floor(diff/60) + 'h ' + (diff%60) + 'm)';
            } else {
                var opensLaterToday = currentTime < timeToMinsLocal(today.open);
                if (opensLaterToday) {
                    statusEl.innerHTML = '<span class="status-dot closed"></span> CLOSED (Opens today at ' + format12(today.open) + ')';
                } else {
                    var next = SCHEDULE[(todayIdx + 1) % 7];
                    statusEl.innerHTML = '<span class="status-dot closed"></span> CLOSED (Opens ' + next.day + ' at ' + format12(next.open) + ')';
                }
            }
        }

        var grid = document.getElementById('hoursGrid');
        if (grid) {
            SCHEDULE.forEach(function(item, idx) {
                var isToday = idx === todayIdx;
                var row = document.createElement('div');
                row.className = 'hours-row-new' + (isToday ? ' today' : '');
                row.innerHTML = '<span>' + (isToday ? '&#9658; ' : '') + item.day + '</span><span>' + format12(item.open) + ' - ' + format12(item.close) + '</span>';
                grid.appendChild(row);
            });
        }
    })();

    /* FORM SUBMISSION & STRIPE */
    var form = document.getElementById('bookingForm');
    if (form) {
        var isSubmitting = false;

        form.addEventListener('submit', function(e) {
            e.preventDefault();
            if (isSubmitting) return;

            var service = document.getElementById('service').value;
            if (!service) return alert("Select a service.");

            var hiddenTime = document.getElementById('time');
            var selectedTime = hiddenTime.value;
            var isAfterHours = hiddenTime.dataset.afterHours === 'true';

            if (!selectedTime) {
                alert('Please select a time slot.');
                return;
            }

            if (isAfterHours) {
                document.getElementById('afterHoursPopup').style.display = 'flex';
                return;
            }

            var stripeLinks = {
                "full-experience": "https://buy.stripe.com/bJe8wRcpH8SZ0Qp7bRg360d",
                "full-skinfade-beard-luxury": "https://buy.stripe.com/4gM14p0GZ0mt6aJbs7g360c",
                "i-cut-deluxe": "https://buy.stripe.com/5kQ5kFahzfhnaqZgMrg360b",
                "i-cut-royal": "https://buy.stripe.com/5kQ9AVcpH0mt56F2VBg360a",
                "skin-fade": "https://buy.stripe.com/bJefZjgFXd9f1UtgMrg3602",
                "scissor-cut": "https://buy.stripe.com/bJe9AV89rfhn2YxeEjg3609",
                "classic-sbs": "https://buy.stripe.com/bJe28t0GZb176aJ67Ng360m",
                "hot-towel-shave": "https://buy.stripe.com/00wfZj89r8SZ1Ut9jZg3605",
                "clipper-cut": "https://buy.stripe.com/eVqeVffBT3yF42B53Jg3606",
                "senior-haircut": "https://buy.stripe.com/eVq4gB75nc5b8iR8fVg3607",
                "young-gents": "https://buy.stripe.com/fZu6oJexPc5b56F3ZFg3604",
                "young-gents-skin-fade": "https://buy.stripe.com/eVqcN74Xfd9f2Yx67Ng3608",
                "full-facial": "https://buy.stripe.com/3cI5kFahz4CJ0QpgMrg360n",
                "beard-dyeing": "https://buy.stripe.com/7sY28tfBT9X356F7bRg360f",
                "face-mask": "https://buy.stripe.com/4gM7sN3Tb3yF9mV9jZg360g",
                "face-steam": "https://buy.stripe.com/8x2cN7ahz0mtaqZ1Rxg360h",
                "threading": "https://buy.stripe.com/aFafZj9dv2uB8iR0Ntg360i",
                "waxing": "https://buy.stripe.com/bJe4gB89r4CJ7eNfIng360j",
                "shape-up-clean-up": "https://buy.stripe.com/8x23cxgFXc5b1Ut3ZFg360k",
                "wash-hot-towel": "https://buy.stripe.com/test_dRmbJ3gFX7OVgPn0Ntg3600"
            };

            var depositLinks = {
                "i-cut-royal": "https://buy.stripe.com/dRm8wR75n3yF9mV0Ntg360q",
                "i-cut-deluxe": "https://buy.stripe.com/dRm8wR75n3yF9mV0Ntg360q",
                "full-skinfade-beard-luxury": "https://buy.stripe.com/bJe5kFgFX1qxgPn53Jg360p"
            };

            var barberVal = document.getElementById('barber').value || 'no-preference';
            var selectedBtn = document.querySelector('.time-slot-btn.selected');
            window._pendingFormData = {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                date: document.getElementById('date').value,
                time: selectedTime,
                service: service,
                barber: barberVal === 'no-preference'
                    ? (selectedBtn && selectedBtn.dataset.assignedBarber ? selectedBtn.dataset.assignedBarber : 'no-preference')
                    : barberVal
            };

            var extras = ["full-facial","beard-dyeing","face-mask","face-steam","threading","waxing","shape-up-clean-up","wash-hot-towel"];
            var phone = window._pendingFormData.phone;
            var date = window._pendingFormData.date;

            isSubmitting = true;
            var submitBtn = form.querySelector('.submit-btn');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(0,0,0,0.3);border-top-color:#000;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;vertical-align:middle;"></span> Securing your slot...';
            }

            var checkUrl = 'https://script.google.com/macros/s/AKfycbxjewnButgDfQqQvgZATtwgNV7JOQhyKVtK4gWPyF7KSY3EzHUbJ2C5Mgny4qjGvVs0/exec?check=duplicate&phone=' + encodeURIComponent(phone) + '&date=' + encodeURIComponent(date);

            function handlePayment() {
                if (extras.includes(service)) {
                    proceedToPayment(stripeLinks[service], 'FULL');
                } else {
                    document.getElementById('paymentChoicePopup').style.display = 'flex';
                    document.getElementById('btnFullPayment').onclick = function() {
                        document.getElementById('paymentChoicePopup').style.display = 'none';
                        proceedToPayment(stripeLinks[service], 'FULL');
                    };
                    document.getElementById('btnDeposit').onclick = function() {
                        document.getElementById('paymentChoicePopup').style.display = 'none';
                        proceedToPayment(depositLinks[service] || "https://buy.stripe.com/6oU9AVgFXglr6aJ1Rxg360o", 'DEPOSIT');
                    };
                }
            }

            function runCheck(callback) {
                if (_dupCacheResult !== null) {
                    callback(_dupCacheResult);
                } else {
                    fetch(checkUrl)
                        .then(function(r) { return r.json(); })
                        .then(callback)
                        .catch(function(err) {
                            console.log('Duplicate check failed:', err);
                            isSubmitting = false;
                            handlePayment();
                        });
                }
            }

            runCheck(function(result) {
                if (result.duplicate) {
                    if (!confirm("You already have a booking on this date. Are you sure you want to book again?")) {
                        isSubmitting = false;
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = '\u2702 BOOK MY APPOINTMENT';
                        }
                        return;
                    }
                }
                handlePayment();
            });
        });
    }

    function proceedToPayment(url, type) {
        var data = window._pendingFormData;
        data.paymentType = type;
        data.status = 'CONFIRMED';
        data.bookingId = 'WCB-' + Date.now();
        sessionStorage.setItem('pendingBooking', JSON.stringify(data));

        var popup = document.getElementById('successPopup');
        if (popup) {
            document.getElementById('popup-icon').innerText = "\u23F3";
            document.getElementById('popup-title').innerText = "Redirecting to payment...";
            document.getElementById('popup-text').innerText = "You're being securely redirected to complete your booking.";
            popup.style.display = 'flex';
        }

        setTimeout(function() { window.location.href = url; }, 800);
    }

    function checkAvailability(date) {
        var barberEl = document.getElementById('barber');
        var barber = barberEl ? barberEl.value || 'no-preference' : 'no-preference';
        var serviceEl = document.getElementById('service');
        var service = serviceEl ? serviceEl.value : '';
        var timeSlotsGrid = document.getElementById('timeSlots');
        var hiddenTime = document.getElementById('time');

        var durationMap = {
            "i-cut-royal": 60, "i-cut-deluxe": 50, "full-skinfade-beard-luxury": 40,
            "full-experience": 30, "senior-full-experience": 30, "skin-fade": 30,
            "scissor-cut": 30, "classic-sbs": 20, "hot-towel-shave": 15,
            "clipper-cut": 15, "senior-haircut": 20, "young-gents": 20,
            "young-gents-skin-fade": 25, "full-facial": 10, "beard-dyeing": 20,
            "face-mask": 10, "face-steam": 10, "threading": 5,
            "waxing": 10, "shape-up-clean-up": 15, "wash-hot-towel": 10
        };
        var duration = durationMap[service] || 30;

        if (!date) {
            if (timeSlotsGrid) timeSlotsGrid.innerHTML = '';
            return;
        }

        var selectedDate = getLocalDate(date);
        var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        var dayName = DAY_NAMES[selectedDate.getDay()];

        var now2 = new Date();
        var todayStr2 = now2.toISOString().split('T')[0];
        var isToday = date === todayStr2;
        var nowMins = isToday ? now2.getHours() * 60 + now2.getMinutes() : 0;

        function getBarberScheduleForDay(b, day) {
            if (!b) return null;
            var workingDays = Array.isArray(b.workingDays) ? b.workingDays : [];
            if (!workingDays.includes(day)) return null;
            var dh = b.dayHours && b.dayHours[day] ? b.dayHours[day] : (b.hours || { open: '09:00', close: '19:00' });
            return { open: dh.open || '09:00', close: dh.close || '19:00' };
        }

        function generateSlots(open, close) {
            var slots = [];
            var openMins = timeToMins(open);
            var closeMins = timeToMins(close);
            for (var mins = openMins; mins + duration <= closeMins; mins += 30) {
                if (isToday && mins <= nowMins + 15) continue;
                var h = Math.floor(mins / 60);
                var m = mins % 60;
                var h12 = h % 12 || 12;
                var ampm = h >= 12 ? 'PM' : 'AM';
                slots.push({ h: h, m: m, label: h12 + ':' + (m === 0 ? '00' : '30') + ' ' + ampm });
            }
            return slots;
        }

        var barbersToCheck = [];
        if (barber === 'no-preference') {
            barbersToCheck = ACTIVE_BARBERS;
        } else {
            var found = ACTIVE_BARBERS.find(function(b) { return b.id === barber; });
            if (found) barbersToCheck = [found];
        }

        var scheduledBarbers = barbersToCheck
            .map(function(b) { return { barber: b, schedule: getBarberScheduleForDay(b, dayName) }; })
            .filter(function(x) { return x.schedule !== null; });

        if (scheduledBarbers.length === 0) {
            if (timeSlotsGrid) timeSlotsGrid.innerHTML = '<div class="time-slots-empty">No barbers available on this day</div>';
            return;
        }

        var openMins = Math.min.apply(null, scheduledBarbers.map(function(x) { return timeToMins(x.schedule.open); }));
        var closeMins = Math.max.apply(null, scheduledBarbers.map(function(x) { return timeToMins(x.schedule.close); }));
        var open = String(Math.floor(openMins / 60)).padStart(2, '0') + ':' + String(openMins % 60).padStart(2, '0');
        var close = String(Math.floor(closeMins / 60)).padStart(2, '0') + ':' + String(closeMins % 60).padStart(2, '0');

        var slots = generateSlots(open, close);

        if (slots.length === 0) {
            if (timeSlotsGrid) timeSlotsGrid.innerHTML = '<div class="time-slots-empty">No available slots for today</div>';
            return;
        }

        function getFirestoreSlots() {
            var db = window._db;
            var firebase = window._firebase;
            var startOfDay = getLocalDate(date, 0, 0);
            var endOfDay = getLocalDate(date, 23, 59);
            var q = firebase.query(
                firebase.collection(db, 'tenants/whitecross/bookings'),
                firebase.where('startTime', '>=', firebase.Timestamp.fromDate(startOfDay)),
                firebase.where('startTime', '<=', firebase.Timestamp.fromDate(endOfDay))
            );
            return firebase.getDocs(q).then(function(snap) {
                var busyMap = {};
                ACTIVE_BARBERS.forEach(function(b) { busyMap[b.id] = []; });
                snap.forEach(function(doc) {
                    var d = doc.data();
                    if (d.status === 'CANCELLED') return;
                    if (!d.startTime || !d.endTime) return;
                    var slot = { start: d.startTime.toMillis(), end: d.endTime.toMillis() };
                    if (busyMap[d.barberId] !== undefined) busyMap[d.barberId].push(slot);
                });
                return busyMap;
            });
        }

        function renderSlots(busyMap) {
            timeSlotsGrid.innerHTML = '';
            hiddenTime.value = '';

            slots.forEach(function(slot) {
                var slotStart = getLocalDate(date, slot.h, slot.m).getTime();
                var slotEnd = slotStart + duration * 60 * 1000;

                function isBusy(barberId) {
                    return (busyMap[barberId] || []).some(function(b) { return slotStart < b.end && slotEnd > b.start; });
                }

                function isInSchedule(b) {
                    var sch = getBarberScheduleForDay(b, dayName);
                    if (!sch) return false;
                    var schOpen = getLocalDate(date, parseInt(sch.open.split(':')[0]), parseInt(sch.open.split(':')[1])).getTime();
                    var schClose = getLocalDate(date, parseInt(sch.close.split(':')[0]), parseInt(sch.close.split(':')[1])).getTime();
                    return slotStart >= schOpen && slotEnd <= schClose;
                }

                var busy = false;
                var assignedBarber = '';

                if (barber === 'no-preference') {
                    var available = scheduledBarbers
                        .map(function(x) { return x.barber; })
                        .filter(function(b) { return isInSchedule(b) && !isBusy(b.id); });
                    busy = available.length === 0;
                    if (!busy) assignedBarber = available[0].id;
                } else {
                    var foundB = ACTIVE_BARBERS.find(function(b) { return b.id === barber; });
                    busy = !foundB || !isInSchedule(foundB) || isBusy(barber);
                    if (!busy) assignedBarber = barber;
                }

                var btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = slot.label;
                btn.className = 'time-slot-btn' + (busy ? ' unavailable' : '');
                btn.dataset.time = slot.label;
                btn.dataset.afterHours = 'false';
                btn.dataset.assignedBarber = assignedBarber;
                btn.disabled = busy;

                if (!busy) {
                    btn.addEventListener('click', function() {
                        timeSlotsGrid.querySelectorAll('.time-slot-btn').forEach(function(b) { b.classList.remove('selected'); });
                        btn.classList.add('selected');
                        hiddenTime.value = slot.label;
                        hiddenTime.dataset.afterHours = 'false';
                        hiddenTime.dataset.assignedBarber = assignedBarber;
                    });
                }
                timeSlotsGrid.appendChild(btn);
            });
        }

        getFirestoreSlots().then(function(busyMap) {
            renderSlots(busyMap);
        }).catch(function(err) {
            console.log('Availability check failed:', err);
            renderSlots({});
        });
    }

    /* Barber & Service listeners */
    var serviceHidden = document.getElementById('service');
    document.querySelectorAll('.service-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.service-btn').forEach(function(b) { b.classList.remove('selected'); });
            btn.classList.add('selected');
            serviceHidden.value = btn.dataset.value;
            var selectedDate = dateInput && dateInput.value;
            if (selectedDate) checkAvailability(selectedDate);
        });
    });

    /* ACCORDION */
    document.querySelectorAll(".accordion-toggle").forEach(function(t) {
        t.addEventListener("click", function() {
            var target = document.querySelector('.' + t.dataset.target + '-content');
            var arrow = document.querySelector('.arrow-' + t.dataset.target);
            if (target.classList.contains("open")) {
                target.style.maxHeight = "0px";
                target.classList.remove("open");
                arrow.classList.remove("rotate");
            } else {
                target.classList.add("open");
                target.style.maxHeight = target.scrollHeight + "px";
                arrow.classList.add("rotate");
            }
        });
    });

    /* STRIPE SUCCESS CHECK */
    if (window.isStripeSuccess) {
        var popup = document.getElementById('successPopup');
        var pending = sessionStorage.getItem('pendingBooking');
        var bookingData = pending ? JSON.parse(pending) : null;

        if (popup) {
            var name = bookingData ? bookingData.name.split(' ')[0] : '';
            var bDate = bookingData ? bookingData.date : '';
            var bTime = bookingData ? bookingData.time : '';
            document.getElementById('popup-icon').innerText = "\u2702\uFE0F";
            document.getElementById('popup-title').innerText = "You're all booked, " + name + "!";
            document.getElementById('popup-text').innerText = "See you at I CUT Whitecross Barbers on " + bDate + " at " + bTime + ". Check your email for confirmation!";
            popup.style.display = 'flex';
        }

        if (bookingData) {
            var db = window._db;
            var firebase = window._firebase;
            var dateStr = bookingData.date;
            var timeMatch = bookingData.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
            var h = parseInt(timeMatch[1]), m = parseInt(timeMatch[2]);
            var ap = timeMatch[3].toUpperCase();
            if (ap === 'PM' && h !== 12) h += 12;
            if (ap === 'AM' && h === 12) h = 0;
            var startTime = new Date(dateStr + 'T00:00:00');
            startTime.setHours(h, m, 0, 0);
            var durMap = {"i-cut-royal":60,"i-cut-deluxe":50,"full-skinfade-beard-luxury":40,"full-experience":30,"senior-full-experience":30,"skin-fade":30,"scissor-cut":30,"classic-sbs":20,"hot-towel-shave":15,"clipper-cut":15,"senior-haircut":20,"young-gents":20,"young-gents-skin-fade":25,"full-facial":10,"beard-dyeing":20,"face-mask":10,"face-steam":10,"threading":5,"waxing":10,"shape-up-clean-up":15,"wash-hot-towel":10};
            var dur = durMap[bookingData.service] || 30;
            var endTime = new Date(startTime.getTime() + dur * 60 * 1000);

            firebase.addDoc(firebase.collection(db, 'tenants/whitecross/bookings'), {
                bookingId: bookingData.bookingId,
                tenantId: 'whitecross',
                clientName: bookingData.name,
                clientEmail: bookingData.email,
                clientPhone: bookingData.phone,
                barberId: bookingData.barber,
                serviceId: bookingData.service,
                startTime: firebase.Timestamp.fromDate(startTime),
                endTime: firebase.Timestamp.fromDate(endTime),
                status: 'CONFIRMED',
                paymentType: bookingData.paymentType,
                source: 'website',
                createdAt: firebase.Timestamp.fromDate(new Date()),
            }).then(function() { sessionStorage.removeItem('pendingBooking'); });
        }

        window.history.replaceState({}, '', window.location.pathname);
    }

   setTimeout(function() {
        initBarberSelector();
        startBarberRealtimeSync();
    }, 500);
});