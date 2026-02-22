document.addEventListener('DOMContentLoaded', () => {
    const observers = document.querySelectorAll('.animate-in');

    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    observers.forEach(el => observer.observe(el));
});