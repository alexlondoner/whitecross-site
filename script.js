const stories = {
    // BUNDLES (Journey)
    royal: { title: "I CUT Royal Journey", content: "<strong>The Ultimate VIP Ritual.</strong> Our most luxurious 60-minute package. Includes bespoke Haircut, Beard Service, and a Full Facial treatment with Deep Steam Therapy. Designed for deep relaxation and a polished finish. ☕ Includes Turkish Tea/Coffee." },
    deluxe: { title: "I CUT Deluxe Journey", content: "<strong>The Refresh & Glow Ritual.</strong> A full grooming upgrade including a precision haircut, beard trim, and a rejuvenating Face Mask to refresh the skin. ☕ Includes Turkish Tea/Coffee." },
    fade_service: { title: "Full Skin Fade Journey", content: "<strong>Sharpness & Definition.</strong> A premium skin fade paired with a perfectly shaped beard. Expert beard definition and razor-sharp line-up for a crisp, modern look. ☕ Includes Turkish Tea/Coffee." },
    experience: { title: "The Full Experience Journey", content: "<strong>The Signature Choice.</strong> A complete grooming session combining a precision haircut with a tailored beard trim. Sharp detailing and a clean finish. ☕ Includes Turkish Tea/Coffee." },
    senior_full: { title: "Senior Full Experience", content: "<strong>Tradition & Care.</strong> A classic haircut and beard trim tailored for our mature clients (65+). Delivered with extra care and professional attention. ☕ Includes Turkish Tea/Coffee." },

    // STANDARDS (Service)
    skin_fade: { title: "Skin Fade Service", content: "A modern, precision fade taken down to the skin with flawless transitions and a razor-sharp finish." },
    scissor: { title: "Scissor Cut Service", content: "A tailored, natural-looking style crafted entirely with scissors for superior precision and texture." },
    short_back: { title: "Classic Short Back & Sides", content: "A timeless, clean, and versatile cut. Sharp edges and smooth blending for a professional finish." },
    shave: { title: "Hot Towel Shave Service", content: "A traditional wet shave experience. Includes hot towels, soothing pre-shave products, and a smooth, close finish." },
    clipper: { title: "Clipper Cut Service", content: "Clean, simple, and efficient. A uniform all-clipper cut for a neat, low-maintenance look." },

    // EXTRAS (Service)
    full_facial: { title: "Full Facial Treatment", content: "A deep-cleansing facial designed to rejuvenate the skin, remove impurities, and restore a healthy, masculine glow." },
    beard_dye: { title: "Beard Dyeing Service", content: "Expert color application to enhance or restore your beard's natural color for a fuller and more defined appearance." },
    shape_up: { title: "Shape Up & Clean Up", content: "Sharp line-ups and tidy detailing to keep your haircut and beard looking fresh between full services." },
    face_mask: { title: "Face Mask & Steam Treatment", content: "A cleansing Face Mask or Face Steam session. It opens pores, removes impurities, and leaves your skin feeling hydrated and fresh." },
    threading: { title: "Threading & Waxing Service", content: "Traditional Threading for precise eyebrow shaping or professional Waxing (Nose & Ears) for a clean, groomed look." },
    wash_style: { title: "Wash, Style & Hot Towel", content: "A relaxing premium shampoo, professional styling, and a signature hot towel finish." }
};

// --- MODAL AÇMA/KAPATMA ---
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

window.onclick = function(event) {
    const modal = document.getElementById('infoModal');
    if (event.target == modal) { modal.style.display = "none"; }
}

// --- TARİH VE SAAT AYARI (BURASI UNUTULAN KISIM) ---
document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    if (dateInput && timeSelect) {
        // Bugünden öncesini seçmeyi engelle
        const today = new Date().toLocaleDateString('en-CA');
        dateInput.setAttribute('min', today);

        // Tarih seçildiğinde saatleri oluştur
        dateInput.addEventListener('change', () => {
            timeSelect.innerHTML = '<option value="" disabled selected>Time</option>';
            for (let h = 9; h < 19; h++) {
                [0, 30].forEach(m => {
                    let timeStr = `${h}:${m === 0 ? '00' : '30'} ${h >= 12 ? 'PM' : 'AM'}`;
                    let opt = document.createElement('option');
                    opt.value = timeStr;
                    opt.textContent = timeStr;
                    timeSelect.appendChild(opt);
                });
            }
        });
    }
});