document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    // Bugünün tarihini ayarla
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if(dateInput) dateInput.setAttribute('min', todayStr);

    dateInput.addEventListener('change', function() {
        const selectedDate = new Date(this.value);
        const day = selectedDate.getDay(); // 0: Pazar, 6: Ctesi
        
        timeSelect.innerHTML = '<option value="" disabled selected>Time</option>';

        // Beyaz Cross St. Çalışma Saatleri (Tabela Uygunluğu)
        let start = 9, end = 19;
        if (day === 0) { start = 10; end = 16; } // Pazar
        if (day === 6) { start = 9; end = 18; }  // Cumartesi

        for (let h = start; h < end; h++) {
            ['00', '30'].forEach(m => {
                // Geçmiş saat kontrolü (Eğer bugün seçiliyse)
                if (this.value === todayStr) {
                    const now = new Date();
                    if (h < now.getHours() || (h === now.getHours() && parseInt(m) <= now.getMinutes())) return;
                }
                const period = h >= 12 ? 'PM' : 'AM';
                let hDisplay = h > 12 ? h - 12 : (h === 0 ? 12 : h);
                const opt = document.createElement('option');
                opt.value = `${hDisplay}:${m} ${period}`;
                opt.textContent = `${hDisplay}:${m} ${period}`;
                timeSelect.appendChild(opt);
            });
        }
    });
});