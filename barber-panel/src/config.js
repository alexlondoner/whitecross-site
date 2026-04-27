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
  { id: 'i-cut-royal', name: 'I CUT Royal', price: 65, duration: 60 },
  { id: 'i-cut-deluxe', name: 'I CUT Deluxe', price: 55, duration: 50 },
  { id: 'full-skinfade-beard-luxury', name: 'Full Skin Fade & Beard Luxury', price: 48, duration: 40 },
  { id: 'full-experience', name: 'The Full Experience', price: 40, duration: 30 },
  { id: 'senior-full-experience', name: 'Senior Full Experience (65+)', price: 35, duration: 30 },
  // Standard
  { id: 'skin-fade', name: 'Skin Fade Cut', price: 32, duration: 30 },
  { id: 'scissor-cut', name: 'Scissor Cut', price: 30, duration: 30 },
  { id: 'classic-sbs', name: 'Classic Short Back & Sides', price: 28, duration: 20 },
  { id: 'hot-towel-shave', name: 'Hot Towel Shave', price: 22, duration: 15 },
  { id: 'clipper-cut', name: 'Clipper Cut', price: 22, duration: 15 },
  { id: 'senior-haircut', name: 'Senior Haircut (65+)', price: 23, duration: 20 },
  { id: 'young-gents', name: 'Young Gents (0-12)', price: 20, duration: 20 },
  { id: 'young-gents-skin-fade', name: 'Young Gents Skin Fade (4-12)', price: 24, duration: 25 },
  // Extras
  { id: 'full-facial', name: 'Full Facial Treatment', price: 24, duration: 20 },
  { id: 'beard-dyeing', name: 'Beard Dyeing', price: 24, duration: 20 },
  { id: 'face-mask', name: 'Face Mask', price: 12, duration: 15 },
  { id: 'face-steam', name: 'Face Steam', price: 12, duration: 15 },
  { id: 'threading', name: 'Threading', price: 10, duration: 10 },
  { id: 'waxing', name: 'Waxing (Nose & Ears)', price: 10, duration: 10 },
  { id: 'shape-up-clean-up', name: 'Shape Up & Clean Up', price: 20, duration: 15 },
  { id: 'wash-hot-towel', name: 'Wash, Style & Hot Towel', price: 10, duration: 10 },
],
};

export default config;
