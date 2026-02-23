document.addEventListener('DOMContentLoaded', () => {
    console.log("I CUT website is ready!");
    
    // Form gönderildiğinde ufak bir geri bildirim simülasyonu
    const form = document.querySelector('.booking-form');
    if(form) {
        form.addEventListener('submit', () => {
            console.log("Form sending...");
        });
    }
});