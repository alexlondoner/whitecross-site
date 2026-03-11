/* ============================
   SERVICE STORIES (MODAL)
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
    beard_dye: { title: "Beard Dyeing", content: "Enhance or restore your beard's colour for a fuller look." },
    face_mask: { title: "Face Mask", content: "Deep pore cleansing treatment that prepares the skin." },
    face_steam: { title: "Face Steam", content: "Relaxing steam therapy to open pores and soften the skin." },
    threading: { title: "Threading", content: "Precision eyebrow shaping and tidy-up using traditional threading." },
    waxing: { title: "Waxing (Nose & Ears)", content: "Professional waxing for nose and ear hair removal for a clean finish." },
    shape_up_clean_up: { title: "Shape Up & Clean Up", content: "Detail work on edges, sideburns, and neckline for a polished look." },
    wash_style_hot_towel: { title: "Wash, Style & Hot Towel", content: "Professional wash, styling, and hot towel finishing treatment." }
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

/* Close modal when clicking outside */
document.addEventListener('click', function(event) {
    const modal = document.getElementById('infoModal');
    if (modal && event.target === modal) {
        closeInfo();
    }
});

/* ============================
   CUSTOM SUCCESS POPUP
============================ */
function showSuccessPopup() {
    const popup = document.getElementById('successPopup');
    if (popup) {
        popup.style.display = 'flex';
        popup.style.animation = 'popupSlideIn 0.4s ease-out';
        
        // Auto-close after 5 seconds
        setTimeout(function() {
            popup.style.animation = 'popupSlideOut 0.4s ease-out';
            setTimeout(function() {
                popup.style.display = 'none';
            }, 400);
        }, 5000);
    }
}

/* ============================
   MAIN INITIALIZATION
============================ */
document.addEventListener('DOMContentLoaded', function() {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    // 1. Bugünün tarihini Londra formatında al (YYYY-MM-DD)
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    if (dateInput) {
        dateInput.setAttribute('min', todayStr);

        dateInput.addEventListener('input', function() {
            const selectedDate = this.value;
            const isToday = (selectedDate === todayStr);
            
            timeSelect.innerHTML = '<option value="" disabled selected>Select Time</option>';

            const currentHour = new Date().getHours();
            const currentMinute = new Date().getMinutes();

            // 9 AM'den 9:30 PM'e kadar döngü
            for (let h = 9; h <= 21; h++) {
                ['00', '30'].forEach(mStr => {
                    const mVal = parseInt(mStr);
                    
                    // 9:30 PM'den sonrasını kapat
                    if (h === 21 && mVal > 0) return;

                    // Bugün için geçmiş saatleri filtrele
                    if (isToday) {
                        if (h < currentHour || (h === currentHour && mVal <= currentMinute)) {
                            return; 
                        }
                    }

                    let hour12 = h % 12 || 12;
                    let ampm = h >= 12 ? 'PM' : 'AM';
                    let timeText = `${hour12}:${mStr} ${ampm}`;
                    
                    let opt = document.createElement('option');
                    opt.value = timeText;
                    opt.textContent = timeText;
                    
                    // 7 PM (19:00) ve sonrası After Hours olarak işaretlenir
                    if (h >= 19) {
                        opt.textContent += " (After Hours)";
                    }
                    
                    timeSelect.appendChild(opt);
                });
            }

            if (isToday) {
                alert("Same-day bookings need confirmation. Please WhatsApp us at +44 7879 553 312");
            }
        });
    }

    // After Hours Surcharge Uyarı Kontrolü (7, 8 ve 9 PM için)
    if (timeSelect) {
        timeSelect.addEventListener('change', function() {
            const val = this.value;
            if (val.includes("7:") || val.includes("8:") || val.includes("9:")) {
                alert("Note: There is a surcharge for After Hours bookings (7PM-9PM). Please contact us directly for confirmation.\n\nWhatsApp: +44 7879 553 312");
            }
        });
    }

    // Phone Number Validation & Formatting
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            // Remove any non-digit and non-plus characters
            let value = this.value.replace(/[^0-9+\s]/g, '');
            
            // Ensure it starts with +
            if (value && !value.startsWith('+')) {
                value = '+' + value;
            }
            
            this.value = value;
        });
        
        phoneInput.addEventListener('blur', function() {
            // Validate phone number format on blur
            const phoneRegex = /^\+[0-9]{1,3}\s?[0-9]{6,14}$/;
            if (this.value && !phoneRegex.test(this.value)) {
                this.style.borderColor = '#ff6b6b';
                console.warn('Invalid phone format. Please use format like: +44 7879 553312');
            } else {
                this.style.borderColor = '#333';
            }
        });
    }
    
    // Email Validation
    const emailInput = document.getElementById('email');
    if (emailInput) {
        emailInput.addEventListener('blur', function() {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (this.value && !emailRegex.test(this.value)) {
                this.style.borderColor = '#ff6b6b';
            } else {
                this.style.borderColor = '#333';
            }
        });
    }

    // Form Gönderimi
    const form = document.getElementById('bookingForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            fetch(this.action, { method: "POST", body: new FormData(this) });
            
            // Show custom styled popup
            showSuccessPopup();
            
            const msg = document.getElementById('form-message');
            if (msg) msg.style.display = "block";
            this.reset();
        });
    }

    // Close popup when clicking the close button
    const closePopupBtn = document.getElementById('closePopup');
    if (closePopupBtn) {
        closePopupBtn.addEventListener('click', function() {
            const popup = document.getElementById('successPopup');
            if (popup) {
                popup.style.animation = 'popupSlideOut 0.4s ease-out';
                setTimeout(function() {
                    popup.style.display = 'none';
                }, 400);
            }
        });
    }

    // Close popup when clicking outside
    const successPopup = document.getElementById('successPopup');
    if (successPopup) {
        successPopup.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.animation = 'popupSlideOut 0.4s ease-out';
                setTimeout(() => {
                    this.style.display = 'none';
                }, 400);
            }
        });
    }

    // Load Booksy Widget (only if container exists and script not already loaded)
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
