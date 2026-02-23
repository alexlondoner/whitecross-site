document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    const today = new Date().toISOString().split('T')[0];
    if(dateInput) dateInput.setAttribute('min', today);

    dateInput.addEventListener('change', () => {
        const selectedDate = new Date(dateInput.value);
        const dayOfWeek = selectedDate.getDay(); 

        timeSelect.innerHTML = '<option value="" disabled selected>Choose a time slot</option>';

        let startHour, endHour;

        if (dayOfWeek === 0) { // PAZAR: 10-4
            startHour = 10; endHour = 16;
        } else if (dayOfWeek === 6) { // CTS: 9-6
            startHour = 9; endHour = 18;
        } else { // HAFTA İÇİ: 9-7
            startHour = 9; endHour = 19;
        }

        for (let hour = startHour; hour < endHour; hour++) {
            ['00', '30'].forEach(min => {
                const period = hour >= 12 ? 'PM' : 'AM';
                let displayHour = hour > 12 ? hour - 12 : hour;
                if (displayHour === 0) displayHour = 12;
                const timeText = `${displayHour}:${min} ${period}`;
                const option = document.createElement('option');
                option.value = timeText;
                option.textContent = timeText;
                timeSelect.appendChild(option);
            });
        }
    });
});