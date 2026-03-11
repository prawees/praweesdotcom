function setLanguage(lang) {
    document.getElementById('btn-th').classList.toggle('active', lang === 'th');
    document.getElementById('btn-en').classList.toggle('active', lang === 'en');

    const elements = document.querySelectorAll('[data-th]');
    
    elements.forEach(el => {
        // Fade out slightly
        el.style.opacity = '0';
        
        setTimeout(() => {
            if (lang === 'th') {
                el.textContent = el.getAttribute('data-th');
            } else {
                el.textContent = el.getAttribute('data-en');
            }
            // Fade back in
            el.style.opacity = '1';
        }, 150); // timing for smooth transition
    });

    document.body.className = `lang-${lang}`;
}

// Default to Thai on Load
window.onload = () => {
    setLanguage('th');
    
    // Smooth entrance animation for the CSS elements
    const elements = document.querySelectorAll('.menu-item, .name-title, .role, .bio');
    elements.forEach(el => el.style.transition = 'opacity 0.4s ease');
};