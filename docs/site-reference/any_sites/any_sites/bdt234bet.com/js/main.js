// BDT234 Casino - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Set active page in navigation
    setActivePage();
    
    // Mobile menu toggle
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');
    
    if (mobileMenuToggle && mobileMenu) {
        mobileMenuToggle.addEventListener('click', function() {
            mobileMenu.classList.toggle('active');
            
            // Update aria-expanded for accessibility
            const isExpanded = mobileMenu.classList.contains('active');
            mobileMenuToggle.setAttribute('aria-expanded', isExpanded);
        });
    }
    
    // Close mobile menu when clicking on a link
    const mobileMenuLinks = document.querySelectorAll('.mobile-menu .nav a');
    mobileMenuLinks.forEach(link => {
        link.addEventListener('click', function() {
            mobileMenu.classList.remove('active');
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
        });
    });
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(event) {
        if (mobileMenu && mobileMenuToggle && 
            !mobileMenu.contains(event.target) && 
            !mobileMenuToggle.contains(event.target)) {
            mobileMenu.classList.remove('active');
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
        }
    });
    
    // Lazy loading for images
    const images = document.querySelectorAll('img[loading="lazy"]');
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    
                    // Load the image
                    img.src = img.dataset.src || img.src;
                    
                    // Add loaded class for animation
                    img.addEventListener('load', function() {
                        img.classList.add('loaded');
                    });
                    
                    // Remove lazy class and stop observing
                    img.classList.remove('lazy');
                    observer.unobserve(img);
                }
            });
        }, { 
            rootMargin: '50px 0px',
            threshold: 0.01 
        });
        
        images.forEach(img => imageObserver.observe(img));
    } else {
        // Fallback for browsers without IntersectionObserver
        images.forEach(img => {
            img.src = img.dataset.src || img.src;
            img.classList.add('loaded');
        });
    }
    
    // Add fade-in animation to elements
    const animatedElements = document.querySelectorAll('.card, .section');
    if ('IntersectionObserver' in window) {
        const animationObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in-up');
                }
            });
        }, { threshold: 0.1 });
        
        animatedElements.forEach(el => animationObserver.observe(el));
    }
    
    // Performance optimization: Preload critical resources
    function preloadCriticalResources() {
        const criticalImages = document.querySelectorAll('img[fetchpriority="high"]');
        criticalImages.forEach(img => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'image';
            link.href = img.src;
            document.head.appendChild(link);
        });
    }
    
    preloadCriticalResources();
    
    // Initialize Swiper slider (only on homepage)
    if (document.querySelector('.banner-swiper')) {
        const swiper = new Swiper('.banner-swiper', {
            // Basic settings
            loop: true,
            autoplay: {
                delay: 6000, // 6 seconds
                disableOnInteraction: false,
                pauseOnMouseEnter: true,
            },
            speed: 800, // Smooth transitions
            
            // Navigation
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
            
            // Pagination
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
                dynamicBullets: true,
            },
            
            // Responsive breakpoints
            breakpoints: {
                320: {
                    slidesPerView: 1,
                    spaceBetween: 0,
                },
                768: {
                    slidesPerView: 1,
                    spaceBetween: 0,
                },
                1024: {
                    slidesPerView: 1,
                    spaceBetween: 0,
                }
            },
            
            // Effects
            effect: 'slide',
            fadeEffect: {
                crossFade: true
            },
            
            // Accessibility
            a11y: {
                enabled: true,
                prevSlideMessage: 'Previous slide',
                nextSlideMessage: 'Next slide',
                firstSlideMessage: 'This is the first slide',
                lastSlideMessage: 'This is the last slide',
            },
            
            // Keyboard control
            keyboard: {
                enabled: true,
                onlyInViewport: true,
            },
            
            // Mouse wheel control
            mousewheel: {
                invert: false,
            },
            
            // Touch settings
            touchRatio: 1,
            touchAngle: 45,
            grabCursor: true,
        });
        
        // Pause autoplay on hover
        const swiperContainer = document.querySelector('.banner-swiper');
        if (swiperContainer) {
            swiperContainer.addEventListener('mouseenter', () => {
                swiper.autoplay.stop();
            });
            
            swiperContainer.addEventListener('mouseleave', () => {
                swiper.autoplay.start();
            });
        }
    }
    
});

// Function to set active page in navigation
function setActivePage() {
    // Get current page filename
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    // Find all navigation links
    const navLinks = document.querySelectorAll('.nav a[href]');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        
        // Check if this link matches current page
        if (href === currentPage || 
            (currentPage === '' && href === 'index.html') ||
            (currentPage === 'index.html' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    // Debug log (remove in production)
    console.log('Current page:', currentPage);
    console.log('Active links found:', document.querySelectorAll('.nav a.active').length);
}
