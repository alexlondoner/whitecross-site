document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    // 1. Bugünden öncesini seçmeyi engelle
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA'); // YYYY-MM-DD formatı
    if(dateInput) {
        dateInput.setAttribute('min', todayStr);
    }

    // 2. Tarih kutusuna tıklandığında takvimi aç (Klavye gelmesin diye)
    dateInput.addEventListener('click', function() {
        if (this.showPicker) this.showPicker();
    });

    // 3. Tarih değiştiğinde saatleri hesapla
    dateInput.addEventListener('change', function() {
        const selectedDate = new Date(this.value);
        const dayOfWeek = selectedDate.getDay(); // 0: Pazar, 6: Ctesi
        
        // Önce saat listesini temizle
        timeSelect.innerHTML = '<option value="" disabled selected>Time</option>';

        let startHour, endHour;

        // White Cross St. Çalışma Saatleri Kuralları
        if (dayOfWeek === 0) { 
            startHour = 10; endHour = 16; // Pazar 10:00 - 16:00
        } else if (dayOfWeek === 6) { 
            startHour = 9; endHour = 18;  // Cumartesi 09:00 - 18:00
        } else { 
            startHour = 9; endHour = 19;  // Hafta içi 09:00 - 19:00
        }

        // Saat dilimlerini oluştur (30 dakikalık aralıklarla)
        for (let hour = startHour; hour < endHour; hour++) {
            ['00', '30'].forEach(min => {
                
                // Eğer BUGÜN seçiliyse, geçmiş saatleri listeden çıkar
                if (this.value === todayStr) {
                    const now = new Date();
                    const currentHour = now.getHours();
                    const currentMin = now.getMinutes();
                    if (hour < currentHour || (hour === currentHour && parseInt(min) <= currentMin)) {
                        return; // Geçmiş saati ekleme, atla
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

        // Eğer o güne hiç saat kalmadıysa (Dükkan kapanmışsa)
        if (timeSelect.options.length === 1) {
            const option = document.createElement('option');
            option.textContent = "Fully Booked";
            option.disabled = true;
            timeSelect.appendChild(option);
        }
    });
});