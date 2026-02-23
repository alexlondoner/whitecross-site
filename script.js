document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    // Bugünün tarihini minimum yap (Geçmişe randevu alınmasın)
    const today = new Date().toISOString().split('T')[0];
    if(dateInput) dateInput.setAttribute('min', today);

    // Gün değişince saatleri doldur
    dateInput.addEventListener('change', () => {
        const selectedDate = new Date(dateInput.value);
        const dayOfWeek = selectedDate.getDay(); // 0: Pazar, 6: Cts

        timeSelect.innerHTML = '<option value="" disabled selected>Choose a time slot</option>';

        let startHour, endHour;

        if (dayOfWeek === 0) { // PAZAR: 10:00 - 16:00
            startHour = 10;
            endHour = 16;
        } else if (dayOfWeek === 6) { // CUMARTESİ: 09:00 - 18:00
            startHour = 9;
            endHour = 18;
        } else { // HAFTA İÇİ: 09:00 - 19:00
            startHour = 9;
            endHour = 19;
        }

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