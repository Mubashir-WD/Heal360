// Mobile menu toggle
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    hamburger.classList.toggle('active');
});

// Close mobile menu when clicking on a link
const navItems = document.querySelectorAll('.nav-links li a');
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navLinks.classList.remove('active');
        hamburger.classList.remove('active');
    });
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Fade-in animations using Intersection Observer
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('fade-in');
        }
    });
}, observerOptions);

// Observe elements for fade-in animation
document.querySelectorAll('.service-card, .program-step, .director-profile, .blog-post, .faq-item, .testimonial').forEach(el => {
    observer.observe(el);
});

// Blog category filtering with ARIA and keyboard support
const tabBtns = document.querySelectorAll('.tab-btn');
const blogPosts = document.querySelectorAll('.blog-post');
const tabList = document.querySelector('.tabs');

function activateTab(btn) {
    if (!btn) return;
    // update visual active state
    tabBtns.forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        b.tabIndex = b === btn ? 0 : -1;
    });

    const category = btn.dataset.category;
    blogPosts.forEach(post => {
        if (category === 'all' || post.classList.contains(category)) {
            post.style.display = 'block';
        } else {
            post.style.display = 'none';
        }
    });
}

// Click handlers
tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        activateTab(btn);
    });
});

// Keyboard navigation: Left/Right to move, Enter/Space to activate
if (tabList) {
    tabList.addEventListener('keydown', (e) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '];
        if (!keys.includes(e.key)) return;

        const current = document.activeElement;
        let idx = Array.prototype.indexOf.call(tabBtns, current);

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const prev = tabBtns[(idx - 1 + tabBtns.length) % tabBtns.length];
            prev.focus();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const next = tabBtns[(idx + 1) % tabBtns.length];
            next.focus();
        } else if (e.key === 'Home') {
            e.preventDefault();
            tabBtns[0].focus();
        } else if (e.key === 'End') {
            e.preventDefault();
            tabBtns[tabBtns.length - 1].focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (current && current.classList.contains('tab-btn')) {
                activateTab(current);
            }
        }
    });
}

// Initialize: ensure one active tab
if (tabBtns.length) {
    const initial = Array.from(tabBtns).find(b => b.classList.contains('active')) || tabBtns[0];
    tabBtns.forEach(b => b.tabIndex = -1);
    activateTab(initial);
}

// FAQ accordion behavior (toggle with animation and ARIA updates)
const faqButtons = document.querySelectorAll('.faq-question');
faqButtons.forEach(btn => {
    const targetId = btn.getAttribute('aria-controls');
    const answer = targetId ? document.getElementById(targetId) : null;

    // Click toggles expanded state
    btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        if (!answer) return;
        if (!expanded) {
            // open
            answer.style.maxHeight = answer.scrollHeight + 'px';
        } else {
            // close
            answer.style.maxHeight = '0';
        }
    });

    // Allow Enter/Space to toggle when focused (buttons handle this by default, but ensure)
    btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            btn.click();
        }
    });
});

// Initialize FAQ panels on load
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.faq-answer').forEach(ans => {
        // If its button is aria-expanded true, set maxHeight
        const id = ans.id;
        if (!id) return;
        const btn = document.querySelector(`[aria-controls="${id}"]`);
        if (btn && btn.getAttribute('aria-expanded') === 'true') {
            ans.style.maxHeight = ans.scrollHeight + 'px';
        } else {
            ans.style.maxHeight = '0';
        }
    });
});

// Blog post detail view
const blogReadMoreLinks = document.querySelectorAll('.read-more');
const blogContent = document.getElementById('blog-content');
const blogDetailSections = document.querySelectorAll('.blog-detail');

blogReadMoreLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const postId = link.closest('.blog-post').dataset.post;
        const targetSection = document.getElementById(postId);

        // Hide all blog details
        blogDetailSections.forEach(section => {
            section.style.display = 'none';
        });

        // Show the clicked blog detail
        if (targetSection) {
            targetSection.style.display = 'block';
            blogContent.style.display = 'block';
            targetSection.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Form validation
const forms = document.querySelectorAll('form');
forms.forEach(form => {
    form.addEventListener('submit', (e) => {
        const email = form.querySelector('input[type="email"]');
        const requiredFields = form.querySelectorAll('input[required], textarea[required]');

        let isValid = true;

        // Check required fields
        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                field.classList.add('error');
                isValid = false;
            } else {
                field.classList.remove('error');
            }
        });

        // Email validation
        if (email && email.value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.value)) {
                email.classList.add('error');
                isValid = false;
            } else {
                email.classList.remove('error');
            }
        }

        if (!isValid) {
            e.preventDefault();
            alert('Please fill in all required fields correctly.');
        }
    });
});

// Newsletter signup
const newsletterForm = document.querySelector('.newsletter-form');
if (newsletterForm) {
    newsletterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = newsletterForm.querySelector('input[type="email"]');
        if (email && email.value) {
            alert('Thank you for subscribing! We\'ll keep you updated with the latest fertility tips.');
            email.value = '';
        }
    });
}

// Contact form enhancement
const contactForm = document.querySelector('.contact-form form');
if (contactForm) {
    const phoneInput = contactForm.querySelector('input[name="phone"]');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            // Remove non-numeric characters
            e.target.value = e.target.value.replace(/\D/g, '');
        });
    }
}

// Removed old global redirect for .btn.primary to allow dropdown to function properly
// Lazy loading for images (if needed in future)
const images = document.querySelectorAll('img[loading="lazy"]');
// Intersection Observer for lazy loading is already set up above

// Accessibility improvements
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Close mobile menu if open
        navLinks.classList.remove('active');
        hamburger.classList.remove('active');
    }
});

// Prevent form submission on enter for certain fields
const searchInputs = document.querySelectorAll('input[type="search"]');
searchInputs.forEach(input => {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Implement search functionality here if needed
        }
    });
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Add loading class removal for smooth transitions
    document.body.classList.add('loaded');

    // Initialize any sliders or carousels here if added later

    // Check for URL hash and scroll to element
    if (window.location.hash) {
        const target = document.querySelector(window.location.hash);
        if (target) {
            setTimeout(() => {
                target.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    }

    // Highlight active nav link across pages
    (function setActiveNavLink(){
        try {
            const navLinks = document.querySelectorAll('.nav-links a');
            let current = window.location.pathname.split('/').pop();
            if (!current) current = 'index.html';

            navLinks.forEach(link => {
                // remove any previous state
                link.classList.remove('active');
                link.removeAttribute('aria-current');

                const href = link.getAttribute('href');
                if (!href) return;

                // If href is an anchor (eg. '#home') consider it pointing to index
                if (href.startsWith('#')) {
                    if (current === 'index.html') {
                        link.classList.add('active');
                        link.setAttribute('aria-current','page');
                    }
                    return;
                }

                // Normalize filenames
                const targetFile = href.split('/').pop();
                if (targetFile === current) {
                    link.classList.add('active');
                    link.setAttribute('aria-current','page');
                }
            });
        } catch (e) {
            // fail silently
            console.warn('setActiveNavLink error', e);
        }
    })();

    // Header logo loader: preload and fallback if it fails to load
    (function ensureHeaderLogo(){
        const logoImg = document.querySelector('.logo img');
        if (!logoImg) return console.warn('Header logo img not found');

        // If already loaded successfully, nothing to do
        if (logoImg.complete && logoImg.naturalWidth > 0) {
            console.info('Header logo loaded successfully');
            return;
        }

        const src = logoImg.getAttribute('src');
        const fallback = 'images/hero_fertility.png';

        const probe = new Image();
        probe.onload = function() {
            // image exists and loaded
            console.info('Probed header logo loaded:', src);
            // ensure the DOM image uses the same src (in case browser chose source earlier)
            logoImg.src = src;
        };
        probe.onerror = function() {
            console.warn('Header logo failed to load, applying fallback:', src);
            logoImg.src = fallback;
            logoImg.removeAttribute('srcset');
            // If fallback doesn't load, replace with inline SVG text logo
            setTimeout(() => {
                if (logoImg.naturalWidth === 0) {
                    const link = logoImg.closest('a.logo');
                    if (link) {
                        link.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="52" viewBox="0 0 160 52" aria-label="Heal360 logo"><text x="0" y="36" font-family="Poppins, sans-serif" font-weight="700" font-size="20" fill="#4a5d4a">Heal360</text></svg>';
                        console.warn('Replaced header logo with inline SVG fallback');
                    }
                }
            }, 120);
        };
        probe.src = src;
        // also attach an error handler in case the DOM image fails later
        logoImg.addEventListener('error', () => {
            console.warn('Header logo DOM image error event fired, switching to fallback');
            logoImg.src = fallback;
            logoImg.removeAttribute('srcset');
            const link = logoImg.closest('a.logo');
            setTimeout(() => {
                if (logoImg.naturalWidth === 0 && link) {
                    link.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="52" viewBox="0 0 160 52" aria-label="Heal360 logo"><text x="0" y="36" font-family="Poppins, sans-serif" font-weight="700" font-size="20" fill="#4a5d4a">Heal360</text></svg>';
                    console.warn('Replaced header logo with inline SVG fallback (DOM error)');
                }
            }, 120);
        }, { once: true });
    })();
});

// Performance optimization: Debounce scroll events
let scrollTimer;
window.addEventListener('scroll', () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
        // Any scroll-based functionality can go here
    }, 16); // ~60fps
});

// Error handling for missing elements
const safeQuerySelector = (selector) => {
    try {
        return document.querySelector(selector);
    } catch (e) {
        console.warn(`Selector "${selector}" not found:`, e);
        return null;
    }
};

// Export functions for potential use in other scripts
// Dropdown menu toggle
const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
dropdownToggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrapper = toggle.closest('.dropdown-wrapper');
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        
        // Close all other dropdowns
        document.querySelectorAll('.dropdown-wrapper.active').forEach(el => {
            if (el !== wrapper) {
                el.classList.remove('active');
                el.querySelector('.dropdown-toggle').setAttribute('aria-expanded', 'false');
            }
        });
        
        // Toggle current dropdown
        wrapper.classList.toggle('active');
        toggle.setAttribute('aria-expanded', !isExpanded);
    });
});

// Close dropdown when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-wrapper.active').forEach(wrapper => {
        wrapper.classList.remove('active');
        wrapper.querySelector('.dropdown-toggle').setAttribute('aria-expanded', 'false');
    });
});

// Close dropdown on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.dropdown-wrapper.active').forEach(wrapper => {
            wrapper.classList.remove('active');
            wrapper.querySelector('.dropdown-toggle').setAttribute('aria-expanded', 'false');
        });
    }
});

window.Heal360Utils = {
    toggleMobileMenu: () => {
        navLinks.classList.toggle('active');
        hamburger.classList.toggle('active');
    },
    smoothScroll: (target) => {
        const element = document.querySelector(target);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    }
};

