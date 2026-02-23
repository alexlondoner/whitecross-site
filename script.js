:root { --gold: #d4af37; --dark: #050505; --card-bg: #0f0f0f; }
body { background-color: var(--dark); color: #fff; margin: 0; font-family: 'Inter', sans-serif; }

.main-logo {
    font-family: 'Oswald', sans-serif; text-align: center; font-size: clamp(3rem, 15vw, 6rem);
    letter-spacing: 12px; text-transform: uppercase; margin-top: 40px;
    background: linear-gradient(to right, #fff 20%, var(--gold) 40%, var(--gold) 60%, #fff 80%);
    background-size: 200% auto; -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; animation: shine 5s linear infinite;
}
@keyframes shine { to { background-position: 200% center; } }
.subtitle { text-align: center; color: var(--gold); letter-spacing: 5px; font-weight: 700; font-size: 0.8rem; margin-top: -5px; }
.walk-in-tag { text-align: center; background: var(--gold); color: #000; font-weight: 900; font-size: 0.6rem; padding: 5px 15px; border-radius: 50px; margin: 10px auto; display: table; }
.location-text { text-align: center; color: #444; font-size: 0.75rem; margin-bottom: 30px; }

.container { max-width: 480px; margin: 0 auto; padding: 0 15px 100px; }
.card { background: var(--card-bg); border: 1px solid #1a1a1a; padding: 25px; border-radius: 20px; margin-bottom: 25px; }
.section-title { font-family: 'Oswald', sans-serif; color: var(--gold); text-align: center; text-transform: uppercase; margin-bottom: 20px; }

.menu-category { color: var(--gold); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 3px; margin: 25px 0 15px 0; border-left: 3px solid var(--gold); padding-left: 10px; }
.services-grid { display: flex; flex-direction: column; gap: 10px; }
.service-item { display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; border: 1px solid #1a1a1a; }
.service-item.highlight { border: 1px solid var(--gold); background: linear-gradient(to right, rgba(212, 175, 55, 0.1), transparent); }

.s-info strong { display: block; font-size: 0.95rem; color: #fff; margin-bottom: 4px; }
.s-info p { font-size: 0.7rem; color: #777; margin: 0; line-height: 1.3; }
.price { font-family: 'Oswald', sans-serif; color: var(--gold); font-size: 1.1rem; }

.booking-form .input-group { margin-bottom: 12px; }
input, select, textarea { width: 100%; padding: 12px; background: #000; border: 1px solid #222; color: #fff; border-radius: 10px; font-family: inherit; }
input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.8) sepia(1) saturate(5) hue-rotate(10deg); cursor: pointer; }

.submit-btn { width: 100%; padding: 16px; background: var(--gold); color: #000; border: none; border-radius: 10px; font-weight: 800; cursor: pointer; text-transform: uppercase; margin-top: 10px; }
.whatsapp-float { position: fixed; bottom: 20px; right: 20px; background: #25d366; color: #fff; padding: 12px 20px; border-radius: 50px; display: flex; align-items: center; gap: 8px; text-decoration: none; font-weight: bold; z-index: 1000; }
.whatsapp-float img { width: 22px; }

.promo-box { text-align: center; color: var(--gold); font-size: 0.7rem; margin-top: 20px; font-weight: bold; border: 1px dashed var(--gold); padding: 10px; border-radius: 10px; }
.animate-in { animation: fadeInUp 0.8s ease forwards; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
.footer { text-align: center; padding: 20px; font-size: 0.7rem; color: #444; }
.footer span { color: var(--gold); }