/* ============================
   SERVICE STORY CONTENT
============================ */
const stories = {
    royal: { title: "I CUT Royal Journey", content: "<strong>VIP Luxury.</strong> Bespoke Haircut, Beard Service, Full Facial & Deep Steam therapy. Includes Turkish Tea/Coffee." },
    deluxe: { title: "I CUT Deluxe Journey", content: "<strong>Professional Upgrade.</strong> Haircut, Beard Trim & Face Mask. Includes Turkish Tea/Coffee." },
    fade_service: { title: "Full Skin Fade Journey", content: "<strong>Precision & Style.</strong> Premium Skin Fade with beard shaping." },
    experience: { title: "The Full Experience", content: "<strong>Gentleman's Signature.</strong> Haircut + Beard Trim with sharp detailing." },
    senior_full: { title: "Senior Full Experience", content: "Classic haircut and beard trim tailored for mature clients." },
    skin_fade: { title: "Skin Fade Cut", content: "A modern fade with flawless transitions." },
    scissor: { title: "Scissor Cut", content: "Natural-looking style crafted entirely with scissors." },
    short_back: { title: "Classic Short Back & Sides", content: "Timeless, clean and versatile." },
    shave: { title: "Hot Towel Shave", content: "Traditional wet shave with hot towels." },
    clipper: { title: "Clipper Cut", content: "Simple and clean all-clipper cut." },
    senior: { title: "Senior Haircut (65+)", content: "A comfortable, classic cut for mature clients." },
    young: { title: "Young Gents (0-12)", content: "A clean, neat cut for young boys with gentle handling." },
    young_gents_skin_fade: { title: "Young Gents Skin Fade (4-12)", content: "Modern fade technique tailored for young boys with precision shaping." },
    full_facial: { title: "Full Facial Treatment", content: "Deep-cleansing facial designed to rejuvenate the skin." },
    beard_dye: { title: "Beard Dyeing", content: "Enhance or restore your beard’s colour for a fuller look." },
    face_mask: { title: "Face Mask", content: "Deep pore cleansing treatment that prepares the skin." },
    face_steam: { title: "Face Steam", content: "Relaxing steam therapy to open pores and soften the skin." },
    threading: { title: "Threading", content: "Precision eyebrow shaping and tidy-up using traditional threading." },
    waxing: { title: "Waxing (Nose & Ears)", content: "Professional waxing for nose and ear hair removal for a clean finish." },
    shape_up_clean_up: { title: "Shape Up & Clean Up", content: "Detail work on edges, sideburns, and neckline for a polished look." },
    wash_style_hot_towel: { title: "Wash, Style & Hot Towel", content: "Professional wash, styling, and hot towel finishing treatment." }
};

/* ============================
   MODAL FUNCTIONS
============================ */
function openStory(type) {
    const modal = document.getElementById('infoModal');
    if (modal && stories[type]) {
        document.getElementById('modal-title').innerHTML = stories[type].title;
        document.getElementById('modal-desc').innerHTML = stories[type].content;
        modal.style.display = 'flex';
    }
}

function closeInfo() { 
    const modal = document.getElementById('infoModal');
    if (modal) modal.style.display = 'none'; 
}

window.onclick = function(e) { 
    const modal = document.getElementById('infoModal');
    if (modal && e.target == modal) closeInfo(); 
};

/* ============================
   BOOKING & TIME GENERATOR
============================ */
document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    if (dateInput) {
        // Geçmiş tarihleri engelle
        dateInput.setAttribute('min', new Date().toLocaleDateString('en-CA'));
        
        // Tarih değişince saatleri oluştur ve "Aynı Gün" uyarısı ver
        dateInput.addEventListener('change', function() {
            // 1. Saatleri Doldur
            if (timeSelect) {
                timeSelect.innerHTML = '<option value="" disabled selected>Select Time</option>';
                for (let h = 9; h < 19; h++) {
                    ['00', '30'].forEach(m => {
                        let hour12 = h % 12 || 12;
                        let ampm = h >= 12 ? 'PM' : 'AM';
                        let timeStr = `${hour12}:${m} ${ampm}`;
                        let opt = document.createElement('option');
                        opt.value = timeStr;
                        opt.textContent = timeStr;
                        timeSelect.appendChild(opt);
                    });
                }
            }

            // 2. Aynı Gün Uyarısı
            const selected = new Date(this.value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            selected.setHours(0, 0, 0, 0);

            if (selected.getTime() === today.getTime()) {
                alert("For same-day bookings, please WhatsApp or call us for faster confirmation.\n\nWhatsApp: +44 7879 553 312");
            }
        });
    }

    /* GALLERY AUTO-HIDE (GITHUB SAFE) */
    const slider = document.querySelector('.slider');
    const grid = document.querySelector('.gallery-grid');
    if (grid || slider) {
        const sliderImages = document.querySelectorAll('.slides img');
        const gridImages = document.querySelectorAll('.gallery-grid img');
        let hasImages = false;
        const isRealImage = (img) => img.getAttribute("src") && img.getAttribute("src").trim() !== "";
        sliderImages.forEach(img => { if (isRealImage(img)) hasImages = true; });
        gridImages.forEach(img => { if (isRealImage(img)) hasImages = true; });
        if (!hasImages) {
            if (slider) slider.style.display = "none";
            if (grid) grid.style.display = "none";
        }
    }
});

/* ============================
   FORM & PHONE HANDLERS
============================ */
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
    bookingForm.addEventListener('submit', function (e) {
        e.preventDefault();
        fetch(this.action, { method: "POST", body: new FormData(this) });
        const msg = document.getElementById('form-message');
        if (msg) msg.style.display = "block";
        this.reset();
    });
}

const phoneInput = document.getElementById('phone');
if (phoneInput) {
    phoneInput.addEventListener('input', function () {
        let value = this.value;
        if (value && !value.startsWith("+")) value = "+" + value;
        let cleaned = value.replace(/[^\d+]/g, "");
        const match = cleaned.match(/^(\+)(\d{1,3})(\d*)$/);
        if (match) {
            const countryCode = match[2];
            let phoneNumber = (match[3] || "").substring(0, 15);
            this.value = "+" + countryCode + (phoneNumber ? " " + phoneNumber : "");
        }
    });
}