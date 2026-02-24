const stories = {
    royal: {
        title: "The I CUT Royal Journey",
        content: "<strong>The Ultimate 60-Minute VIP Escape.</strong><br><br>• Precision haircut & beard sculpting.<br>• Deep steam session with a traditional straight-edge shave.<br>• Enjoy <strong>Turkish Tea or Coffee</strong> while your face mask sets.<br>• Extended arm & shoulder massage.<br>• Invigorating hair wash & hot towel finish."
    },
    deluxe: {
        title: "The I CUT Deluxe Ritual",
        content: "<strong>Sharp Look, Relaxed Mind.</strong><br><br>• Master haircut & beard shape-up.<br>• Revitalizing face mask treatment.<br>• Relaxing scalp massage during wash.<br>• Finished with premium styling & hot towel."
    },
    fade: {
        title: "Full Skin Fade Service",
        content: "<strong>The Precision Specialist.</strong><br><br>• Flawless zero-fade using detailers & foil shavers.<br>• Razor-sharp beard line-up.<br>• Hair wash and cooling tonic treatment.<br>• Signature hot towel finish."
    },
    experience: {
        title: "The Full Experience",
        content: "<strong>The Gentleman's Signature.</strong><br><br>• Classic tailored haircut.<br>• Professional beard trim & shape.<br>• Invigorating hair wash.<br>• The perfect refresh for the modern man."
    }
};

function openStory(type) {
    document.getElementById('modal-title').innerHTML = stories[type].title;
    document.getElementById('modal-desc').innerHTML = stories[type].content;
    document.getElementById('infoModal').style.display = 'flex';
}

function closeInfo() {
    document.getElementById('infoModal').style.display = 'none';
}

// Tarih ve Saat Mantığı
document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');
    const today = new Date().toLocaleDateString('en-CA');
    dateInput.setAttribute('min', today);

    dateInput.addEventListener('change', () => {
        timeSelect.innerHTML = '<option value="" disabled selected>Time</option>';
        for(let h=9; h<19; h++) {
            [0, 30].forEach(m => {
                let time = `${h}:${m === 0 ? '00' : '30'} ${h >= 12 ? 'PM' : 'AM'}`;
                let opt = document.createElement('option');
                opt.value = time; opt.textContent = time;
                timeSelect.appendChild(opt);
            });
        }
    });
});
const stories = {
    // PREMIUMS (Journey)
    royal: { title: "I CUT Royal Journey", content: "..." },
    deluxe: { title: "I CUT Deluxe Journey", content: "..." },
    fade: { title: "Full Skin Fade Journey", content: "..." },
    experience: { title: "The Full Experience Journey", content: "..." },
    
    // STANDARDS (Service)
    skin_fade_only: { title: "Skin Fade Service", content: "..." },
    scissor_cut: { title: "Scissor Cut Service", content: "..." },
    short_back_sides: { title: "Short Back & Sides Service", content: "..." }
};