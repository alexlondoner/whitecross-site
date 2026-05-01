const config = {
  shopName: 'I CUT Whitecross Barbers',
  shopAddress: '136 Whitecross Street, London EC1Y 8QJ',
  shopPhone: '020 3621 5929',
  shopEmail: 'whitecrossbarbers@gmail.com',
  shopWhatsApp: '447470108578',
  
  // Platform Settings
  platforms: {
    booksy: {
      depositEnabled: true,
      depositAmount: 10,
    },
    fresha: {
      depositEnabled: false,
      depositAmount: 0,
    },
  },
  // Apps Script URL
  scriptUrl: 'https://script.google.com/macros/s/AKfycbymASCa4MN7LMPoPa6fYwfeu2OCYfxKlLvoIBlauXhe_o7BDMF5DFgrrpBtUIrZAZi_/exec',
  
  // Admin password (change this!)
  adminPassword: 'icut2026',
  // Opening hours
  hours: {
    Monday: { open: '09:00', close: '19:00', closed: false },
    Tuesday: { open: '09:00', close: '19:00', closed: false },
    Wednesday: { open: '09:00', close: '19:00', closed: false },
    Thursday: { open: '09:00', close: '19:00', closed: false },
    Friday: { open: '09:00', close: '19:00', closed: false },
    Saturday: { open: '09:00', close: '19:00', closed: false },
    Sunday: { open: '10:00', close: '16:00', closed: false },
  },

  // Barbers
  barbers: [
    { id: 'alex', name: 'Alex', color: '#d4af37' },
    { id: 'arda', name: 'Arda', color: '#4caf50' },
  ],

  // Services
  services: [
  // Exclusive Bundles
  { id: 'i-cut-royal', name: 'I CUT Royal', price: 65, duration: 60, category: 'Exclusive Bundles', description: 'A premium grooming experience designed for structure, relaxation, and a complete reset. Includes bespoke haircut tailored to your head shape and lifestyle, beard trim & razor shape-up with straight-razor finish, shampoo wash, cleansing face mask & scrub, and face steam to open pores.', stripeUrl: 'https://buy.stripe.com/5kQ9AVcpH0mt56F2VBg360a', depositUrl: 'https://buy.stripe.com/dRm8wR75n3yF9mV0Ntg360q' },
  { id: 'i-cut-deluxe', name: 'I CUT Deluxe', price: 55, duration: 50, category: 'Exclusive Bundles', description: 'The ultimate grooming ritual for the modern gentleman. Includes bespoke haircut & beard sculpting, precision straight-razor finish, facial restoration with deep-cleansing face mask, hot towel treatment, and a relaxing arm massage.', stripeUrl: 'https://buy.stripe.com/5kQ5kFahzfhnaqZgMrg360b', depositUrl: 'https://buy.stripe.com/dRm8wR75n3yF9mV0Ntg360q' },
  { id: 'full-skinfade-beard-luxury', name: 'Full Skin Fade & Beard Luxury', price: 48, duration: 40, category: 'Exclusive Bundles', description: 'The complete package for a fresh look and total relaxation. Includes professional skin fade, full beard trim & razor shape-up, relaxing hair wash, steaming hot towel, and arm & hand massage.', stripeUrl: 'https://buy.stripe.com/4gM14p0GZ0mt6aJbs7g360c', depositUrl: 'https://buy.stripe.com/bJe5kFgFX1qxgPn53Jg360p' },
  { id: 'full-experience', name: 'The Full Experience', price: 40, duration: 30, category: 'Exclusive Bundles', description: 'A complete grooming package that brings together haircut, styling, and relaxation. Includes tailored haircut & style, beard or detailing work where applicable, and relaxation elements such as hot towel or scalp massage.', stripeUrl: 'https://buy.stripe.com/bJe8wRcpH8SZ0Qp7bRg360d', depositUrl: '' },
  { id: 'senior-full-experience', name: 'Senior Full Experience (65+)', price: 35, duration: 30, category: 'Exclusive Bundles', description: 'A complete, comfort-focused grooming experience for clients aged 65 and above. Includes classic haircut, beard or facial tidy if requested, with extra time and care for a calm, respectful experience.', stripeUrl: '', depositUrl: '' },
  // Standard
  { id: 'skin-fade', name: 'Skin Fade Cut', price: 32, duration: 30, category: 'Standard', description: 'A modern skin fade focused on clean transitions and sharp detail. The sides and back are taken down to the skin and blended smoothly into the length on top, creating a strong, defined look.', stripeUrl: 'https://buy.stripe.com/bJefZjgFXd9f1UtgMrg3602', depositUrl: '' },
  { id: 'scissor-cut', name: 'Scissor Cut', price: 30, duration: 30, category: 'Standard', description: 'A haircut performed primarily with scissors for natural movement and shape. Perfect for medium to longer hairstyles, focusing on layering, texture, and flow for a softer, more tailored finish.', stripeUrl: 'https://buy.stripe.com/bJe9AV89rfhn2YxeEjg3609', depositUrl: '' },
  { id: 'classic-sbs', name: 'Classic Short Back & Sides', price: 28, duration: 20, category: 'Standard', description: 'A timeless, clean haircut that works in any setting. Neatly tapered sides and back with the top shaped to suit your style. Smart, low-maintenance, and versatile for work and everyday life.', stripeUrl: 'https://buy.stripe.com/bJe28t0GZb176aJ67Ng360m', depositUrl: '' },
  { id: 'hot-towel-shave', name: 'Hot Towel Shave', price: 22, duration: 15, category: 'Standard', description: 'A traditional shaving service built around comfort and closeness. Warm towels open the pores and soften the beard before a close razor shave, achieving a smoother result while reducing irritation.', stripeUrl: 'https://buy.stripe.com/00wfZj89r8SZ1Ut9jZg3605', depositUrl: '' },
  { id: 'clipper-cut', name: 'Clipper Cut', price: 22, duration: 15, category: 'Standard', description: 'A clean, all-clipper haircut for a sharp and simple finish. Ideal for short, even styles such as buzz cuts, tapers, or basic fades. Quick, precise, and easy to maintain.', stripeUrl: 'https://buy.stripe.com/eVqeVffBT3yF42B53Jg3606', depositUrl: '' },
  { id: 'senior-haircut', name: 'Senior Haircut (65+)', price: 23, duration: 20, category: 'Standard', description: 'A comfortable, classic haircut for clients aged 65 and above. Focus on neatness, ease of maintenance, and a relaxed experience carried out gently and professionally.', stripeUrl: 'https://buy.stripe.com/eVq4gB75nc5b8iR8fVg3607', depositUrl: '' },
  { id: 'young-gents', name: 'Young Gents (0-12)', price: 20, duration: 20, category: 'Standard', description: 'A haircut service specially for boys aged 0 to 12 years. Trimmed and styled using clippers on the back and sides, blended into the top with scissors. Quick and carried out in a child-friendly manner.', stripeUrl: 'https://buy.stripe.com/fZu6oJexPc5b56F3ZFg3604', depositUrl: '' },
  { id: 'young-gents-skin-fade', name: 'Young Gents Skin Fade (4-12)', price: 24, duration: 25, category: 'Standard', description: 'A modern skin fade tailored for boys aged 4 to 12. The sides and back are faded down to the skin and blended into longer hair on top, creating a clean, stylish look that is easy to manage.', stripeUrl: 'https://buy.stripe.com/eVqcN74Xfd9f2Yx67Ng3608', depositUrl: '' },
  // Extras
  { id: 'full-facial', name: 'Full Facial Treatment', price: 24, duration: 20, category: 'Extras', description: 'A complete skincare service with deep cleansing, exfoliation, massage, mask, and moisturising to rejuvenate the skin. Ideal to hydrate, brighten, and improve overall skin health.', stripeUrl: 'https://buy.stripe.com/3cI5kFahz4CJ0QpgMrg360n', depositUrl: '' },
  { id: 'beard-dyeing', name: 'Beard Dyeing', price: 24, duration: 20, category: 'Extras', description: 'A colouring service for the beard to cover grey, deepen your natural shade, or create a more defined look. Uses products formulated for facial hair for an even, natural finish.', stripeUrl: 'https://buy.stripe.com/7sY28tfBT9X356F7bRg360f', depositUrl: '' },
  { id: 'face-mask', name: 'Face Mask', price: 12, duration: 15, category: 'Extras', description: 'A targeted facial treatment to cleanse and condition the skin. Draws out impurities, refines texture, and supports hydration. A simple but effective add-on for tired or congested skin.', stripeUrl: 'https://buy.stripe.com/4gM7sN3Tb3yF9mV9jZg360g', depositUrl: '' },
  { id: 'face-steam', name: 'Face Steam', price: 12, duration: 15, category: 'Extras', description: 'A steam-based treatment to open pores, improve circulation, and prepare the face for further treatments such as masks or shaves. Leaves the skin feeling softer, cleaner, and more receptive to products.', stripeUrl: 'https://buy.stripe.com/8x2cN7ahz0mtaqZ1Rxg360h', depositUrl: '' },
  { id: 'threading', name: 'Threading', price: 10, duration: 10, category: 'Extras', description: 'Precision hair removal using traditional threading techniques. Ideal for eyebrows and fine facial hair, allowing sharp definition without the use of chemicals.', stripeUrl: 'https://buy.stripe.com/aFafZj9dv2uB8iR0Ntg360i', depositUrl: '' },
  { id: 'waxing', name: 'Waxing (Nose & Ears)', price: 10, duration: 10, category: 'Extras', description: 'A focused grooming service for unwanted hair in the nose and ears. Waxing removes hair from the root for a smoother, longer-lasting result compared to trimming.', stripeUrl: 'https://buy.stripe.com/bJe4gB89r4CJ7eNfIng360j', depositUrl: '' },
  { id: 'shape-up-clean-up', name: 'Shape Up & Clean Up', price: 20, duration: 15, category: 'Extras', description: 'A grooming service that sharpens hairlines, tidies edges, and cleans up stray hairs around the forehead, neck, and sides. Ideal between full haircuts to stay looking sharp.', stripeUrl: 'https://buy.stripe.com/8x23cxgFXc5b1Ut3ZFg360k', depositUrl: '' },
  { id: 'wash-hot-towel', name: 'Wash, Style & Hot Towel', price: 10, duration: 10, category: 'Extras', description: 'Your hair is washed, professionally styled, and finished with a soothing hot towel treatment. Perfect before an event or night out when you want to feel fresh and well-presented.', stripeUrl: 'https://buy.stripe.com/test_dRmbJ3gFX7OVgPn0Ntg3600', depositUrl: '' },
],
};

export default config;
