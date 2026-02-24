const stories = {
    royal: { title: "I CUT Royal Journey", content: "<strong>VIP Luxury.</strong> Bespoke Haircut, Beard Service, Full Facial & Deep Steam therapy. The ultimate grooming ritual for deep relaxation. ☕ Includes Turkish Tea/Coffee." },
    deluxe: { title: "I CUT Deluxe Journey", content: "<strong>Professional Upgrade.</strong> Haircut, Beard Trim & a rejuvenating Face Mask to refresh your skin. ☕ Includes Turkish Tea/Coffee." },
    fade_service: { title: "Full Skin Fade Journey", content: "<strong>Precision & Style.</strong> Premium Skin Fade paired with a perfectly shaped beard and expert definition. ☕ Includes Turkish Tea/Coffee." },
    experience: { title: "The Full Experience", content: "<strong>Gentleman's Signature.</strong> Complete grooming session: Haircut + Tailored Beard Trim with sharp detailing. ☕ Includes Turkish Tea/Coffee." },
    senior_full: { title: "Senior Full Experience", content: "<strong>Care & Comfort.</strong> Classic haircut and beard trim tailored for mature clients (65+). ☕ Includes Turkish Tea/Coffee." },
    skin_fade: { title: "Skin Fade Cut", content: "A modern fade taken down to the skin with flawless transitions and a sharp finish." },
    scissor: { title: "Scissor Cut", content: "A tailored, natural-looking style crafted entirely with scissors for precision and texture." },
    short_back: { title: "Classic Short Back & Sides", content: "A timeless, clean, and versatile cut with sharp edges and smooth blending." },
    shave: { title: "Hot Towel Shave", content: "Traditional wet shave with hot towels, soothing products, and a smooth, close finish." },
    clipper: { title: "Clipper Cut", content: "A clean, simple, and efficient all-clipper cut for a neat look." },
    full_facial: { title: "Full Facial Treatment", content: "Deep-cleansing facial designed to rejuvenate the skin, remove impurities, and restore a healthy glow." },
    beard_dye: { title: "Beard Dyeing", content: "Enhance or restore your beard’s colour for a fuller, more defined appearance." },
    face_mask: { title: "Face Mask & Steam", content: "A relaxing treatment that opens pores and prepares the skin for deeper cleansing or a smoother finish." },
    threading: { title: "Threading & Waxing", content: "Precise eyebrow shaping and removal of unwanted hair from nose and ears for a cleaner look." }
};

function openStory(type) {
    const modal = document.getElementById('infoModal');
    if (modal && stories[type]) {
        document.getElementById('modal-title').innerHTML = stories[type].title;
        document.getElementById('modal-desc').innerHTML = stories[type].content;
        modal.style.display = 'flex';
    }
}
function closeInfo() { document.getElementById('infoModal').style.display = 'none'; }
window.onclick = function(e) { if (e.target == document.getElementById('infoModal')) closeInfo(); }

document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');
    if(dateInput) dateInput.setAttribute('min', new Date().toLocaleDateString('en-CA'));
    if(dateInput && timeSelect) {
        dateInput.addEventListener('change', () => {
            timeSelect.innerHTML = '<option value="" disabled selected>Time</option>';
            for(let h=9; h<19; h++) {
                ['00', '30'].forEach(m => {
                    let timeStr = `${h}:${m} ${h>=12?'PM':'AM'}`;
                    let opt = document.createElement('option');
                    opt.value = timeStr; opt.textContent = timeStr;
                    timeSelect.appendChild(opt);
                });
            }
        });
    }
});