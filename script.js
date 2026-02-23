document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    // 1. Bugünden öncesini seçmeyi engelle
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if(dateInput) dateInput.setAttribute('min', todayStr);

    dateInput.addEventListener('change', () => {
        const selectedDate = new Date(dateInput.value);
        const dayOfWeek = selectedDate.getDay(); // 0: Pazar, 6: Cumartesi
        
        // Temizle ve Hazırla
        timeSelect.innerHTML = '<option value="" disabled selected>Select Time</option>';

        let startHour, endHour;

        // 2. White Cross St. Mesai Saatleri Tanımlama
        if (dayOfWeek === 0) { // PAZAR: 10:00 - 16:00
            startHour = 10; endHour = 16;
        } else if (dayOfWeek === 6) { // CUMARTESİ: 09:00 - 18:00
            startHour = 9; endHour = 18;
        } else { // HAFTA İÇİ: 09:00 - 19:00
            startHour = 9; endHour = 19;
        }

        // 3. Saat Dilimlerini Oluştur (30 dakikalık aralıklarla)
        for (let hour = startHour; hour < endHour; hour++) {
            ['00', '30'].forEach(min => {
                // Eğer seçilen gün BUGÜNSE, geçmiş saatleri listeden çıkar
                if (dateInput.value === todayStr) {
                    const currentHour = new Date().getHours();
                    const currentMin = new Date().getMinutes();
                    if (hour < currentHour || (hour === currentHour && parseInt(min) <= currentMin)) {
                        return; // Bu saati listeye ekleme
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

        // Eğer o gün için hiç saat kalmadıysa (mesela bugün geç saatte bakıyorsa)
        if (timeSelect.options.length === 1) {
            const option = document.createElement('option');
            option.textContent = "Fully Booked / Closed";
            option.disabled = true;
            timeSelect.appendChild(option);
        }
    });
});