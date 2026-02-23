document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    const today = new Date().toISOString().split('T')[0];
    if(dateInput) dateInput.setAttribute('min', today);

    dateInput.addEventListener('change', () => {
        const selectedDate = new Date(dateInput.value);
        const dayOfWeek = selectedDate.getDay(); 
        timeSelect.innerHTML = '<option value="" disabled selected>Time</option>';

        let startHour, endHour;
        if (dayOfWeek === 0) { startHour = 10; endHour = 16; } // Pazar 10-4
        else if (dayOfWeek === 6) { startHour = 9; endHour = 18; } // Cts 9-6
        else { startHour = 9; endHour = 19; } // Hafta içi 9-7

        for (let hour = startHour; hour < endHour; hour++) {
            ['00', '30'].forEach(min => {
                const period = hour >= 12 ? 'PM' : 'AM';
                let displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
                const timeText = `${displayHour}:${min} ${period}`;
                const option = document.createElement('option');
                option.value = timeText;
                option.textContent = timeText;
                timeSelect.appendChild(option);
            });
        }
    });
});