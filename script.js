/* ============================
   SERVICE STORY CONTENT
============================ */
const stories = {
    royal: { 
        title: "I CUT Royal Journey", 
        content: "<strong>VIP Luxury.</strong> Bespoke Haircut, Beard Service, Full Facial & Deep Steam therapy. Includes Turkish Tea/Coffee." 
    },
    deluxe: { 
        title: "I CUT Deluxe Journey", 
        content: "<strong>Professional Upgrade.</strong> Haircut, Beard Trim & Face Mask. Includes Turkish Tea/Coffee." 
    },
    fade_service: { 
        title: "Full Skin Fade Journey", 
        content: "<strong>Precision & Style.</strong> Premium Skin Fade with beard shaping." 
    },
    experience: { 
        title: "The Full Experience", 
        content: "<strong>Gentleman's Signature.</strong> Haircut + Beard Trim with sharp detailing." 
    },
    senior_full: { 
        title: "Senior Full Experience", 
        content: "Classic haircut and beard trim tailored for mature clients." 
    },

    /* Standard Services */
    skin_fade: { title: "Skin Fade Cut", content: "A modern fade with flawless transitions." },
    scissor: { title: "Scissor Cut", content: "Natural-looking style crafted entirely with scissors." },
    short_back: { title: "Classic Short Back & Sides", content: "Timeless, clean and versatile." },
    shave: { title: "Hot Towel Shave", content: "Traditional wet shave with hot towels." },
    clipper: { title: "Clipper Cut", content: "Simple and clean all-clipper cut." },

    /* Missing ones added */
    senior: { title: "Senior Haircut (65+)", content: "A comfortable, classic cut for mature clients." },
    young: { title: "Young Gents (0-12)", content: "A clean, neat cut for young boys with gentle handling." },

    /* Extras */
    full_facial: { title: "Full Facial Treatment", content: "Deep-cleansing facial designed to rejuvenate the skin." },
    beard_dye: { title: "Beard Dyeing", content: "Enhance or restore your beard’s colour for a fuller look." },
    face_mask: { title: "Face Mask & Steam", content: "Opens pores and prepares the skin for deeper cleansing." },
    threading: { 
        title: "Threading & Waxing", 
        content: "Eyebrow tidy-up, nose & ear hair removal for a clean finish." 
    }
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
    document.getElementById('infoModal').style.display = 'none'; 
}

window.onclick = function(e) { 
    if (e.target == document.getElementById('infoModal')) closeInfo(); 
};

/* ============================
   BOOKING TIME GENERATOR
============================ */
document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    if (dateInput) {
        dateInput.setAttribute('min', new Date().toLocaleDateString('en-CA'));
    }

    if (dateInput && timeSelect) {
        dateInput.addEventListener('change', () => {
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
        });
    }

    /* ============================
   GALLERY AUTO-HIDE (GITHUB SAFE)
============================ */
const sliderImages = document.querySelectorAll('.slides img');
const gridImages = document.querySelectorAll('.gallery-grid img');
const slider = document.querySelector('.slider');
const grid = document.querySelector('.gallery-grid');

function isRealImage(img) {
    const src = img.getAttribute("src");
    return src && src.trim() !== "";
}

let hasImages = false;

sliderImages.forEach(img => { if (isRealImage(img)) hasImages = true; });
gridImages.forEach(img => { if (isRealImage(img)) hasImages = true; });

if (!hasImages) {
    if (slider) slider.style.display = "none";
    if (grid) grid.style.display = "none";

    const galleryCard = grid.closest('.card');
    if (galleryCard) {
        galleryCard.innerHTML += `
            <div style="text-align:center; padding:20px; color:#d4af37; font-size:1.1rem;">
                Gallery Coming Soon
            </div>
        `;
    }
}

});
