document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    // 1. Bugünden öncesini seçmeyi engelle
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA'); // YYYY-MM-DD formatı
    if(dateInput) {
        dateInput.setAttribute('min', todayStr);
    }

    // 2. Tarih seçildiğinde saat dropdown'unu doldur
    dateInput.addEventListener('input', function() {
        const selectedDate = new Date(this.value);
        const dayOfWeek = selectedDate.getDay(); // 0: Pazar, 6: Ctesi
        
        // Saat listesini her seferinde temizle
        timeSelect.innerHTML = '<option value="" disabled selected>Time</option>';

        let startHour, endHour;

        // White Cross St. Çalışma Saatleri (Tabelaya Göre)
        if (dayOfWeek === 0) { // PAZAR
            startHour = 10; endHour = 16;
        } else if (dayOfWeek === 6) { // CUMARTESİ
            startHour = 9; endHour = 18;
        } else { // HAFTA İÇİ
            startHour = 9; endHour = 19;
        }

        // Saat dilimlerini 30 dakikalık aralıklarla ekle
        for (let hour = startHour; hour < endHour; hour++) {
            ['00', '30'].forEach(min => {
                
                // Eğer BUGÜN seçiliyse, şu anki saatten öncesini gösterme
                if (this.value === todayStr) {
                    const now = new Date();
                    const currentHour = now.getHours();
                    const currentMin = now.getMinutes();
                    // Eğer saat veya dakika geçmişse bu slotu ekleme
                    if (hour < currentHour || (hour === currentHour && parseInt(min) <= currentMin)) {
                        return; 
                    }
                }

                const period = hour >= 12 ? 'PM' : 'AM';
                let displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
                
                const timeText = `${displayHour}:${min} ${period}`;
                const option = document.createElement('option');
                option.value = timeText;
                option.textContent = timeText;
                timeSelect.appendChild(option);
            });
        }

        // Eğer o gün için tüm saatler geçmişse veya dükkan kapalıysa
        if (timeSelect.options.length === 1) {
            const option = document.createElement('option');
            option.textContent = "No slots available";
            option.disabled = true;
            timeSelect.appendChild(option);
        }
    });

    // 3. Form gönderildiğinde ufak bir teşekkür mesajı (Opsiyonel)
    const form = document.getElementById('bookingForm');
    if(form) {
        form.addEventListener('submit', () => {
            console.log("Booking request sent to Arda!");
        });
    }
});