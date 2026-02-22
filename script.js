// Intersection Observer for animation on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, observerOptions);

// Observe all elements with animate-in class
document.querySelectorAll('.animate-in').forEach(element => {
    observer.observe(element);
});

// Optional: Form submission tracking
const form = document.querySelector('.booking-form');
if (form) {
    form.addEventListener('submit', (e) => {
        console.log('Form submitted');
    });
}

// Log page load
console.log('White Cross Barbers website loaded successfully');
