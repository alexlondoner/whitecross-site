const stories = {
    // 🔥 EXCLUSIVE BUNDLE PACKAGES (JOURNEY DETAILS)
    experience: {
        title: "The Full Experience Journey",
        content: "<strong>The Signature Gentleman’s Choice.</strong><br><br>• A complete grooming session combining precision haircut with a tailored beard trim.<br>• Designed to refresh your look from top to bottom with sharp detailing.<br>• Includes a refreshing hair wash and premium styling.<br>• ☕ Complimentary Turkish Tea or Coffee included."
    },
    fade_service: {
        title: "Full Skin Fade Journey",
        content: "<strong>Sharpness & Definition.</strong><br><br>• A premium skin fade paired with a perfectly shaped beard.<br>• Ideal for clients who want a crisp, modern style with seamless transitions.<br>• Expert beard definition and razor-sharp line-up.<br>• ☕ Complimentary Turkish Tea or Coffee included."
    },
    deluxe: {
        title: "I CUT Deluxe Journey",
        content: "<strong>The Refresh & Glow Ritual.</strong><br><br>• Full grooming upgrade including a precision haircut and beard trim.<br>• A rejuvenating <strong>Face Mask</strong> to pull out impurities and refresh the skin.<br>• Invigorating hair wash and hot towel finish.<br>• ☕ Complimentary Turkish Tea or Coffee included."
    },
    royal: {
        title: "I CUT Royal Journey",
        content: "<strong>The Ultimate VIP Ritual.</strong><br><br>• Our most luxurious 60-minute package.<br>• Includes bespoke Haircut, Beard Service, and a Full Facial treatment.<br>• <strong>Deep Steam Therapy</strong> to open pores and relax the mind.<br>• A full grooming ritual designed for deep relaxation and a polished finish.<br>• ☕ Complimentary Turkish Tea or Coffee included."
    },
    senior_full: {
        title: "Senior Citizen Full Experience Journey",
        content: "<strong>Tradition & Care.</strong><br><br>• A classic haircut and beard trim tailored for our mature clients.<br>• Delivered with extra care, comfort, and professional attention to detail.<br>• ☕ Complimentary Turkish Tea or Coffee included."
    },

    // 💈 STANDARD PACKAGES (SERVICE DETAILS)
    short_back: {
        title: "Classic Short Back & Sides Service",
        content: "A timeless, clean, and versatile cut. Sharp edges and smooth blending for a professional finish."
    },
    skin_fade: {
        title: "Skin Fade Service",
        content: "A modern, precision fade taken down to the skin with flawless transitions and a razor-sharp finish."
    },
    scissor: {
        title: "Scissor Cut Service",
        content: "A tailored, natural-looking style crafted entirely with scissors for superior precision and texture."
    },
    clipper: {
        title: "Clipper Cut Service",
        content: "Clean, simple, and efficient. A uniform all-clipper cut for a neat, low-maintenance look."
    },
    shave: {
        title: "Hot Towel Shave Service",
        content: "A traditional wet shave experience. Includes hot towels, soothing pre-shave products, and a smooth, close finish."
    },
    senior_cut: {
        title: "Senior Citizen Haircut Service",
        content: "A classic, comfortable haircut tailored to mature clients. Quick, clean, and respectful."
    },
    young_gents: {
        title: "Young Gents Service (0-12)",
        content: "A fresh, age-appropriate cut for young boys, styled with care and patience to make them look their best."
    },
    young_fade: {
        title: "Young Gents Skin Fade Service",
        content: "A clean, modern skin fade designed for younger clients who want that sharp, professional look early on."
    },

    // ✨ EXTRAS (SERVICE DETAILS)
    threading: {
        title: "Threading Service",
        content: "Precise eyebrow and facial hair shaping using traditional threading techniques for a clean, defined look."
    },
    waxing: {
        title: "Waxing (Nose & Ears) Service",
        content: "Quick and effective removal of unwanted hair from nose and ears for a cleaner, groomed appearance."
    },
    face_mask: {
        title: "Face Mask Treatment",
        content: "A cleansing and hydrating mask designed to refresh and brighten the skin, leaving you looking awake and revitalized."
    },
    face_steam: {
        title: "Face Steam Treatment",
        content: "A relaxing steam session that opens pores and prepares the skin for deeper cleansing or a smoother shave."
    },
    beard_dye: {
        title: "Beard Dyeing Service",
        content: "Enhance or restore your beard’s natural colour for a fuller, more defined, and younger appearance."
    },
    shape_up: {
        title: "Shape Up & Clean Up Service",
        content: "Sharp line-ups and tidy detailing to keep your haircut and beard looking fresh between full services. The ultimate maintenance."
    },
    wash_style: {
        title: "Wash, Style & Hot Towel Service",
        content: "A relaxing premium shampoo, professional styling with top-tier products, and a signature hot towel finish."
    },
    full_facial: {
        title: "Full Facial Treatment",
        content: "A deep-cleansing facial designed to rejuvenate the skin, remove impurities, and restore a healthy, masculine glow."
    }
};

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