document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    // 1. Geçmiş tarihi seçmeyi engelle
    const today = new Date().toISOString().split('T')[0];
    if(dateInput) dateInput.setAttribute('min', today);

    // 2. Gün seçildiğinde saat listesini ayarla
    dateInput.addEventListener('change', () => {
        const selectedDate = new Date(dateInput.value);
        const dayOfWeek = selectedDate.getDay(); // 0: Pazar, 1: Pzt, ..., 6: Cts

        timeSelect.innerHTML = '<option value="" disabled selected>Choose a time slot</option>';

        let startHour, endHour;

        if (dayOfWeek === 0) { // PAZAR
            startHour = 10;
            endHour = 16; // 4 PM
        } else if (dayOfWeek === 6) { // CUMARTESİ
            startHour = 9;
            endHour = 18; // 6 PM
        } else { // HAFTA İÇİ
            startHour = 9;
            endHour = 19; // 7 PM
        }

        // Seçenekleri oluştur
        for (let hour = startHour; hour < endHour; hour++) {
            ['00', '30'].forEach(min => {
                const period = hour >= 12 ? 'PM' : 'AM';
                let displayHour = hour > 12 ? hour - 12 : hour;
                if (displayHour === 0) displayHour = 12;
                
                const timeText = `${displayHour}:${min} ${period}`;
                const timeValue = `${hour}:${min}`;
                
                const option = document.createElement('option');
                option.value = timeValue;
                option.textContent = timeText;
                timeSelect.appendChild(option);
            });
        }
    });
});