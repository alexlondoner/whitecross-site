/* ============================
   SERVICE STORIES (MODAL)
   Booksy metni + premium düzen
============================ */

const stories = {
    /* EXCLUSIVE BUNDLES – FULL JOURNEY */

    royal: {
        title: "I CUT Royal",
        content: `
<p><strong>A premium grooming experience designed for structure, relaxation, and a complete reset.</strong></p>
<p>This service combines a detailed haircut, full beard work, and facial care into one seamless journey.</p>
<ul>
<li><strong>Bespoke Haircut:</strong> Any style you like, tailored to your head shape, hair type, and lifestyle.</li>
<li><strong>Beard Trim & Razor Shape-Up:</strong> Your beard is sculpted for symmetry and definition, with a straight-razor finish on the cheeks and neckline for sharp, clean borders.</li>
<li><strong>Shampoo Wash:</strong> A thorough cleanse to remove product build-up and refresh the scalp.</li>
<li><strong>Cleansing Face Mask & Scrub:</strong> Deep-cleansing and exfoliation to purify the skin and smooth texture.</li>
<li><strong>Face Steam:</strong> Warm steam opens the pores, softens the skin, and enhances product absorption.</li>
</ul>
<p><strong>I CUT Royal</strong> is for those who want more than a haircut – it’s a full reset of your look and presence.</p>
        `
    },

    deluxe: {
        title: "I CUT Deluxe",
        content: `
<p><strong>The ultimate grooming ritual designed for the modern gentleman.</strong></p>
<p>This is more than a service; it is a complete restoration of your style and composure.</p>
<ul>
<li><strong>Bespoke Haircut & Beard Sculpting:</strong> Tailored to your facial structure and personal style.</li>
<li><strong>Precision Razor Finish:</strong> Traditional straight-razor detailing for crisp, clean lines.</li>
<li><strong>Facial Restoration:</strong> Deep-cleansing treatment paired with a revitalising face mask to purify, soothe, and tone your skin.</li>
<li><strong>Total Relaxation:</strong> The signature Whitecross touch – a soothing hot towel treatment and an invigorating arm massage to melt away the stress of the week.</li>
</ul>
<p><strong>I CUT Deluxe</strong> ensures you leave looking sharp and feeling fully renewed.</p>
        `
    },

    fade_service: {
        title: "Full Skin Fade & Beard Luxury",
        content: `
<p><strong>Skin Fade Haircut + Beard + Wash + Hot Towel.</strong></p>
<p>The complete package for a fresh look and total relaxation.</p>
<ul>
<li><strong>The Fade:</strong> A professional skin fade (zero/bald on the sides) blended perfectly into your chosen style on top.</li>
<li><strong>The Beard:</strong> Full beard trim and shape-up using warm shaving foam and a sharp straight-razor for clean, defined lines.</li>
<li><strong>The Refresh:</strong> A relaxing hair wash followed by a steaming hot towel for your face.</li>
<li><strong>The Bonus:</strong> A therapeutic arm and hand massage to help you unwind while you’re in the chair.</li>
</ul>
<p>Leave looking sharp and feeling like a new man.</p>
        `
    },

    experience: {
        title: "The Full Experience",
        content: `
<p><strong>A complete grooming package that brings together haircut, styling, and relaxation.</strong></p>
<p>Designed to feel like a full reset rather than just a quick visit.</p>
<ul>
<li><strong>Haircut & Style:</strong> A tailored cut shaped to your features and finished with professional styling.</li>
<li><strong>Beard or Detailing Work (where applicable):</strong> Light grooming to keep everything clean and balanced.</li>
<li><strong>Relaxation Elements:</strong> May include hot towel, scalp massage, or light facial care depending on your needs.</li>
</ul>
<p><strong>The Full Experience</strong> is ideal when you want to slow down, reset, and walk out feeling fully put together.</p>
        `
    },

    senior_full: {
        title: "Senior Full Experience (65+)",
        content: `
<p><strong>A complete, comfort-focused grooming experience for clients aged 65 and above.</strong></p>
<p>This service combines a classic haircut with gentle grooming and a relaxed pace.</p>
<ul>
<li><strong>Classic Haircut:</strong> Neat, comfortable, and easy to maintain.</li>
<li><strong>Beard or Facial Tidy (if requested):</strong> Light trimming and clean-up for a well-kept look.</li>
<li><strong>Comfort-First Approach:</strong> Extra time, care, and attention to ensure a calm, respectful experience.</li>
</ul>
<p>Perfect for those who value both appearance and comfort in equal measure.</p>
        `
    },

    /* STANDARD PACKAGES – FULL SERVICE (KISA + NET) */

    skin_fade: {
        title: "Skin Fade Cut",
        content: `
<p><strong>A modern skin fade focused on clean transitions and sharp detail.</strong></p>
<p>The sides and back are taken down to the skin and blended smoothly into the length on top, creating a strong, defined look. Ideal if you want a fresh, contemporary style that holds its shape between visits.</p>
        `
    },

    scissor: {
        title: "Scissor Cut",
        content: `
<p><strong>A haircut performed primarily with scissors for natural movement and shape.</strong></p>
<p>Perfect for medium to longer hairstyles, this service focuses on layering, texture, and flow rather than harsh clipper lines. Ideal if you want a softer, more tailored finish.</p>
        `
    },

    short_back: {
        title: "Classic Short Back & Sides",
        content: `
<p><strong>A timeless, clean haircut that works in any setting.</strong></p>
<p>The sides and back are neatly tapered while the top is shaped to suit your style. A balanced choice if you want something smart, low-maintenance, and versatile for both work and everyday life.</p>
        `
    },

    shave: {
        title: "Hot Towel Shave",
        content: `
<p><strong>A traditional shaving service built around comfort and closeness.</strong></p>
<p>Warm towels are applied to open the pores and soften the beard before a close razor shave. This helps achieve a smoother result while relaxing the skin and reducing irritation.</p>
        `
    },

    clipper: {
        title: "Clipper Cut",
        content: `
<p><strong>A clean, all-clipper haircut for a sharp and simple finish.</strong></p>
<p>Ideal for short, even styles such as buzz cuts, tapers, or basic fades. Quick, precise, and easy to maintain if you prefer a straightforward, no-fuss look.</p>
        `
    },

    senior: {
        title: "Senior Haircut (65+)",
        content: `
<p><strong>A comfortable, classic haircut for clients aged 65 and above.</strong></p>
<p>The focus is on neatness, ease of maintenance, and a relaxed experience. The service is carried out gently and professionally to ensure you feel at ease throughout.</p>
        `
    },

    young: {
        title: "Young Gents (0–12)",
        content: `
<p><strong>A haircut service specially for boys aged 0 to 12 years.</strong></p>
<p>The hair is trimmed or styled using clippers on the back and sides to keep it neat and blending into top with scissors , after required amount cutting from the top of the hair to keep it balanced and age-appropriate. The service is usually quick and carried out in a child-friendly manner to ensure a relaxed experience.</p>
        `
    },

    young_gents_skin_fade: {
        title: "Young Gents Skin Fade (4–12)",
        content: `
<p><strong>A modern skin fade tailored for boys aged 4 to 12.</strong></p>
<p>The sides and back are faded down to the skin and blended into longer hair on top, creating a clean, stylish look that is still practical and easy to manage for everyday life.</p>
        `
    },

    /* EXTRAS – FULL SERVICE */

    full_facial: {
        title: "Full Facial Treatment",
        content: `
<p><strong>A complete skincare service designed to refresh and restore the face.</strong></p>
<p>This includes deep cleansing, exfoliation, massage, mask, and moisturising to rejuvenate the skin. Ideal if you want to hydrate, brighten, and improve overall skin health for a more radiant look.</p>
        `
    },

    beard_dye: {
        title: "Beard Dyeing",
        content: `
<p><strong>A colouring service for the beard to enhance or restore its tone.</strong></p>
<p>Beard dyeing can be used to cover grey, deepen your natural shade, or create a more defined look. We use products formulated for facial hair to keep the beard and skin healthy while achieving an even, natural finish.</p>
        `
    },

    face_mask: {
        title: "Face Mask",
        content: `
<p><strong>A targeted facial treatment to cleanse and condition the skin.</strong></p>
<p>The mask helps draw out impurities, refine texture, and support hydration. A simple but effective add-on if your skin feels tired, dull, or congested.</p>
        `
    },

    face_steam: {
        title: "Face Steam",
        content: `
<p><strong>A steam-based treatment to open pores and refresh the skin.</strong></p>
<p>Warm steam helps loosen impurities, improve circulation, and prepare the face for further treatments such as masks or shaves. It leaves the skin feeling softer, cleaner, and more receptive to products.</p>
        `
    },

    threading: {
        title: "Threading",
        content: `
<p><strong>Precision hair removal using traditional threading techniques.</strong></p>
<p>Ideal for eyebrows and fine facial hair, threading allows for sharp definition without the use of chemicals. A great option if you want clean lines and a tidy finish around the brows or other small areas.</p>
        `
    },

    waxing: {
        title: "Waxing (Nose & Ears)",
        content: `
<p><strong>A focused grooming service for unwanted hair in the nose and ears.</strong></p>
<p>Waxing removes hair from the root for a smoother, longer-lasting result compared to trimming. A small detail that makes a big difference to your overall appearance.</p>
        `
    },

    shape_up_clean_up: {
        title: "Shape Up & Clean Up",
        content: `
<p><strong>A grooming service that sharpens what you already have.</strong></p>
<p>We focus on defining hairlines, tidying edges, and cleaning up stray hairs around the forehead, neck, and sides. Ideal between full haircuts when you want to look sharp without a complete restyle.</p>
        `
    },

    wash_style_hot_towel: {
        title: "Wash, Style & Hot Towel",
        content: `
<p><strong>A grooming service that combines hair washing, styling, and relaxation.</strong></p>
<p>Your hair is washed, professionally styled, and finished with a soothing hot towel treatment. Perfect before an event, meeting, or night out when you want to feel fresh and well-presented.</p>
        `
    }
};

/* ============================
   MODAL CONTROL
============================ */

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

/* ============================
   SUCCESS POPUP
============================ */

function showSuccessPopup() {
    const popup = document.getElementById('successPopup');
    if (!popup) return;

    popup.style.display = 'flex';
    popup.style.animation = 'popupSlideIn 0.4s ease-out';

    setTimeout(() => {
        popup.style.animation = 'popupSlideOut 0.4s ease-out';
        setTimeout(() => {
            popup.style.display = 'none';
        }, 400);
    }, 5000);
}

/* ============================
   MAIN INITIALIZATION
============================ */

document.addEventListener('DOMContentLoaded', function () {
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
                alert("Same-day bookings need confirmation. Please WhatsApp us at +44 7879 553312");
            }
        });
    }

    if (timeSelect) {
    timeSelect.addEventListener('change', function () {
        const v = this.value;
        
        // Ensure the time includes "PM" AND starts with 7, 8, or 9
        const isAfterHours = v.includes("PM") && (v.startsWith("7:") || v.startsWith("8:") || v.startsWith("9:"));

        if (isAfterHours) {
            alert("Note: There is a surcharge for After Hours bookings (7PM–9PM). Please contact us directly for confirmation.\n\nWhatsApp: +44 7879 553312");
        }
    });
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
                console.warn('Invalid phone format. Please use format like: +44 7879 553312');
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

    /* FORM SUBMIT */
    const form = document.getElementById('bookingForm');
    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            fetch(this.action, { method: "POST", body: new FormData(this) });
            showSuccessPopup();
            this.reset();
        });
    }

    /* POPUP CLOSE */
    const closePopupBtn = document.getElementById('closePopup');
    if (closePopupBtn) {
        closePopupBtn.addEventListener('click', function () {
            const popup = document.getElementById('successPopup');
            if (!popup) return;
            popup.style.animation = 'popupSlideOut 0.4s ease-out';
            setTimeout(() => {
                popup.style.display = 'none';
            }, 400);
        });
    }

    const successPopup = document.getElementById('successPopup');
    if (successPopup) {
        successPopup.addEventListener('click', function (e) {
            if (e.target === this) {
                this.style.animation = 'popupSlideOut 0.4s ease-out';
                setTimeout(() => {
                    this.style.display = 'none';
                }, 400);
            }
        });
    }

    /* BOOKSY WIDGET (opsiyonel, container varsa) */
    const booksyContainer = document.getElementById('booksy-widget-container');
    if (booksyContainer && !window.booksyLoaded) {
        window.booksyLoaded = true;
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://booksy.com/widget/code.js?id=179328&country=gb&lang=en';
        script.async = true;
        booksyContainer.appendChild(script);
    }
});

const booksyContainer = document.getElementById('booksy-widget-container');
if (booksyContainer && !window.booksyLoaded) {
    window.booksyLoaded = true;
    const script = document.createElement('script');
    script.src = 'https://booksy.com/widget/code.js?id=179328&country=gb&lang=en';
    booksyContainer.appendChild(script);
}
