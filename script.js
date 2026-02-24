const stories = {
    royal: { title: "I CUT Royal Journey", content: "<strong>VIP Luxury.</strong> Bespoke Cut, Beard Service, Full Facial & Deep Steam. ☕ Turkish Coffee included." },
    deluxe: { title: "I CUT Deluxe Journey", content: "<strong>Upgrade.</strong> Haircut, Beard Trim & Face Mask. ☕ Turkish Coffee included." },
    fade_service: { title: "Full Skin Fade Journey", content: "<strong>Precision.</strong> Premium Skin Fade & Shaped Beard. ☕ Turkish Coffee included." },
    experience: { title: "The Full Experience", content: "<strong>Signature.</strong> Complete Haircut & Beard Trim. ☕ Turkish Coffee included." },
    senior_full: { title: "Senior Full Experience", content: "<strong>Care.</strong> Classic Haircut & Beard Trim for 65+. ☕ Turkish Coffee included." },
    skin_fade: { title: "Skin Fade Cut", content: "Modern precision down to the skin with flawless transitions." },
    scissor: { title: "Scissor Cut", content: "Tailored style crafted entirely with scissors for texture." },
    short_back: { title: "Classic Short Back & Sides", content: "Timeless, clean, and versatile cut." },
    shave: { title: "Hot Towel Shave", content: "Traditional wet shave with hot towels and premium products." },
    clipper: { title: "Clipper Cut", content: "Clean and efficient all-clipper cut." },
    full_facial: { title: "Full Facial Treatment", content: "Deep-cleansing facial to rejuvenate and restore healthy skin." },
    beard_dye: { title: "Beard Dyeing", content: "Restore or enhance your beard's color for a fuller look." },
    face_mask: { title: "Face Mask & Steam", content: "Opens pores and prepares the skin for deep cleansing." },
    threading: { title: "Threading & Waxing", content: "Precise shaping for eyebrows, ears, and nose." },
    shape_up: { title: "Shape Up", content: "Keep your lines sharp between full haircuts." },
    wash_style: { title: "Wash & Style", content: "Relaxing wash and professional styling with premium products." }
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

// TARİH-SAAT AYARLARI
document.addEventListener('DOMContentLoaded', () => {
    const dateIn = document.getElementById('date');
    const timeSel = document.getElementById('time');
    if(dateIn) dateIn.setAttribute('min', new Date().toLocaleDateString('en-CA'));
    
    if(dateIn && timeSel) {
        dateIn.addEventListener('change', () => {
            timeSel.innerHTML = '<option value="" disabled selected>Time</option>';
            for(let h=9; h<19; h++) {
                ['00', '30'].forEach(m => {
                    let t = `${h}:${m} ${h>=12?'PM':'AM'}`;
                    let o = document.createElement('option');
                    o.value = t; o.textContent = t;
                    timeSel.appendChild(o);
                });
            }
        });
    }
});