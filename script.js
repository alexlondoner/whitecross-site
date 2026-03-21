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

document.addEventListener('DOMContentLoaded', function () {

    /* DATE & TIME */
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (dateInput && timeSelect) {
        dateInput.setAttribute('min', todayStr);
        dateInput.addEventListener('input', function () {
            const selectedDate = this.value;
            const isToday = selectedDate === todayStr;
            timeSelect.innerHTML = '<option value="" disabled selected>Select Time</option>';
            const currentHour = new Date().getHours();
            const currentMinute = new Date().getMinutes();
            for (let h = 9; h <= 21; h++) {
                for (let m of [0, 30]) {
                    if (h === 21 && m > 0) continue;
                    if (isToday) {
                        if (h < currentHour || (h === currentHour && m <= currentMinute)) continue;
                    }
                    const hour12 = h % 12 || 12;
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    let label = `${hour12}:${m === 0 ? '00' : '30'} ${ampm}`;
                    if (h >= 19) label += " (After Hours)";
                    const opt = document.createElement('option');
                    opt.value = label;
                    opt.textContent = label;
                    timeSelect.appendChild(opt);
                }
            }
            if (isToday) {
            document.getElementById('sameDayPopup').style.display = 'flex';            }
        });
    }

    if (timeSelect) {
        timeSelect.addEventListener('change', function () {
            const v = this.value;
            const isAfterHours = v.includes("PM") && (v.startsWith("7:") || v.startsWith("8:") || v.startsWith("9:"));
            if (isAfterHours) {
                alert("Note: There is a surcharge for After Hours bookings (7PM–9PM). Please contact us directly for confirmation.\n\nWhatsApp: +44 7879 553312");
            }
        });
        /* HOURS WIDGET */
(function() {
    const schedule = [
        { day: 'Monday',    open: '09:00', close: '19:00' },
        { day: 'Tuesday',   open: '09:00', close: '19:00' },
        { day: 'Wednesday', open: '09:00', close: '19:00' },
        { day: 'Thursday',  open: '09:00', close: '19:00' },
        { day: 'Friday',    open: '09:00', close: '19:00' },
        { day: 'Saturday',  open: '09:00', close: '19:00' },
        { day: 'Sunday',    open: '10:00', close: '16:00' },
    ];

    const now = new Date();
    const jsToSchedule = [6, 0, 1, 2, 3, 4, 5];
    const todayScheduleIndex = jsToSchedule[now.getDay()];
    const currentTime = now.getHours() * 60 + now.getMinutes();

    function timeToMinutes(t) {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }

    function formatTime(t) {
        const [h, m] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 || 12;
        return `${hour12}:${m === 0 ? '00' : m} ${ampm}`;
    }

    const todaySchedule = schedule[todayScheduleIndex];
    const isOpenNow = currentTime >= timeToMinutes(todaySchedule.open) && currentTime < timeToMinutes(todaySchedule.close);

    const statusEl = document.getElementById('hoursStatus');
    if (!statusEl) return;

    if (isOpenNow) {
        const minsLeft = timeToMinutes(todaySchedule.close) - currentTime;
        const hoursLeft = Math.floor(minsLeft / 60);
        const minsLeftRem = minsLeft % 60;
        const closingMsg = hoursLeft > 0 ? `Closes in ${hoursLeft}h ${minsLeftRem}m` : `Closes in ${minsLeftRem} min`;
        statusEl.innerHTML = `<span class="status-dot open"></span><span class="status-text open-text">OPEN NOW</span><span class="status-closing">${closingMsg}</span>`;
    } else {
        const nextDay = schedule[(todayScheduleIndex + 1) % 7];
        statusEl.innerHTML = `<span class="status-dot closed"></span><span class="status-text closed-text">CLOSED</span><span class="status-closing">Opens ${nextDay.day} at ${formatTime(nextDay.open)}</span>`;
    }

    const grid = document.getElementById('hoursGrid');
    if (!grid) return;

    schedule.forEach((item, index) => {
        const isToday = index === todayScheduleIndex;
        const row = document.createElement('div');
        row.className = 'hours-row-new' + (isToday ? ' today' : '');
        row.innerHTML = `
            <span class="hours-day">${isToday ? '▶ ' + item.day : item.day}</span>
            <span class="hours-time">${formatTime(item.open)} – ${formatTime(item.close)}</span>
            ${isToday ? `<span class="hours-badge ${isOpenNow ? 'badge-open' : 'badge-closed'}">${isOpenNow ? 'OPEN' : 'CLOSED'}</span>` : '<span class="hours-badge-empty"></span>'}
        `;
        grid.appendChild(row);
    });
})();
    }

    /* PHONE VALIDATION */
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function () {
            let v = this.value.replace(/[^0-9+\s]/g, '');
            if (v && !v.startsWith('+')) v = '+' + v;
            this.value = v;
        });
        phoneInput.addEventListener('blur', function () {
            const phoneRegex = /^\+[0-9]{1,3}\s?[0-9]{6,14}$/;
            if (this.value && !phoneRegex.test(this.value)) {
                this.style.borderColor = '#ff6b6b';
            } else {
                this.style.borderColor = '#333';
            }
        });
    }

    /* EMAIL VALIDATION */
    const emailInput = document.getElementById('email');
    if (emailInput) {
        emailInput.addEventListener('blur', function () {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (this.value && !emailRegex.test(this.value)) {
                this.style.borderColor = '#ff6b6b';
            } else {
                this.style.borderColor = '#333';
            }
        });
    }

    /* POPUP CLOSE */
    const popup = document.getElementById('successPopup');
    const closePopupBtn = document.getElementById('closePopup');
    if (closePopupBtn) {
        closePopupBtn.addEventListener('click', function () {
            if (popup) popup.style.display = 'none';
        });
    }
    if (popup) {
        popup.addEventListener('click', function (e) {
            if (e.target === this) this.style.display = 'none';
        });
    }

    /* BOOKING FORM */
    const form = document.getElementById('bookingForm');
    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const service = document.getElementById('service').value;
            const stripeLinks = {
                "full-experience":            "https://buy.stripe.com/bJe8wRcpH8SZ0Qp7bRg360d",
                "full-skinfade-beard-luxury": "https://buy.stripe.com/4gM14p0GZ0mt6aJbs7g360c",
                "i-cut-deluxe":               "https://buy.stripe.com/5kQ5kFahzfhnaqZgMrg360b",
                "i-cut-royal":                "https://buy.stripe.com/5kQ9AVcpH0mt56F2VBg360a",
                "senior-full-experience":     "https://buy.stripe.com/6oUbJ3dtLc5b9mVgMrg360e",
                "skin-fade":                  "https://buy.stripe.com/bJefZjgFXd9f1UtgMrg3602",
                "scissor-cut":                "https://buy.stripe.com/bJe9AV89rfhn2YxeEjg3609",
                "classic-sbs":                "https://buy.stripe.com/bJe28t0GZb176aJ67Ng360m",
                "hot-towel-shave":            "https://buy.stripe.com/00wfZj89r8SZ1Ut9jZg3605",
                "clipper-cut":                "https://buy.stripe.com/eVqeVffBT3yF42B53Jg3606",
                "senior-haircut":             "https://buy.stripe.com/eVq4gB75nc5b8iR8fVg3607",
                "young-gents":                "https://buy.stripe.com/fZu6oJexPc5b56F3ZFg3604",
                "young-gents-skin-fade":      "https://buy.stripe.com/eVqcN74Xfd9f2Yx67Ng3608",
                "full-facial":                "https://buy.stripe.com/3cI5kFahz4CJ0QpgMrg360n",
                "beard-dyeing":               "https://buy.stripe.com/7sY28tfBT9X356F7bRg360f",
                "face-mask":                  "https://buy.stripe.com/4gM7sN3Tb3yF9mV9jZg360g",
                "face-steam":                 "https://buy.stripe.com/8x2cN7ahz0mtaqZ1Rxg360h",
                "threading":                  "https://buy.stripe.com/aFafZj9dv2uB8iR0Ntg360i",
                "waxing":                     "https://buy.stripe.com/bJe4gB89r4CJ7eNfIng360j",
                "shape-up-clean-up":          "https://buy.stripe.com/8x23cxgFXc5b1Ut3ZFg360k",
                "wash-hot-towel":             "https://buy.stripe.com/5kQbJ32P79X3bv37bRg360l"
        };
            const stripeUrl = stripeLinks[service];
            if (!stripeUrl) {
                alert("Please select a service before booking.");
                return;
            }

            // Show redirecting popup
            const successPopup = document.getElementById('successPopup');
            const pIcon  = document.getElementById('popup-icon');
            const pTitle = document.getElementById('popup-title');
            const pText  = document.getElementById('popup-text');

            if (pIcon)  pIcon.innerText  = "⏳";
            if (pTitle) pTitle.innerText = "Redirecting to Payment...";
            if (pText)  pText.innerText  = "Please wait while we connect you to Stripe.";
            if (successPopup) successPopup.style.display = 'flex';

            fetch(this.action, {
                method: "POST",
                body: new FormData(this),
                headers: { "Accept": "application/json" }
            }).finally(() => {
                setTimeout(() => { window.location.href = stripeUrl; }, 1000);
            });
        });
    }

    /* ACCORDION */
    document.querySelectorAll(".accordion-toggle").forEach(toggle => {
        toggle.addEventListener("click", () => {
            const target = toggle.getAttribute("data-target");
            const content = document.querySelector(`.${target}-content`);
            const arrow = document.querySelector(`.arrow-${target}`);
            const isOpen = content.classList.contains("open");
            if (isOpen) {
                content.style.maxHeight = content.scrollHeight + "px";
                requestAnimationFrame(() => { content.style.maxHeight = "0px"; });
                content.classList.remove("open");
                arrow.classList.remove("rotate");
            } else {
                content.classList.add("open");
                content.style.maxHeight = content.scrollHeight + "px";
                arrow.classList.add("rotate");
            }
        });
    });

    /* BOOKSY WIDGET */
    const booksyContainer = document.getElementById('booksy-widget-container');
    if (booksyContainer && !window.booksyLoaded) {
        window.booksyLoaded = true;
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://booksy.com/widget/code.js?id=179328&country=gb&lang=en';
        script.async = true;
        booksyContainer.appendChild(script);
    }

    /* STRIPE SUCCESS POPUP */
    if (window.isStripeSuccess) {
        console.log("Booking Success Detected!");
        const pIcon  = document.getElementById('popup-icon');
        const pTitle = document.getElementById('popup-title');
        const pText  = document.getElementById('popup-text');
        const successPopup = document.getElementById('successPopup');
        if (pIcon)  pIcon.innerText  = "✅";
        if (pTitle) pTitle.innerText = "Booking Confirmed!";
        if (pText)  pText.innerText  = "Payment received. We'll see you soon at Whitecross Street!";
        if (successPopup) successPopup.style.display = 'flex';  
         window.history.replaceState({}, document.title, window.location.pathname);
    }

});
