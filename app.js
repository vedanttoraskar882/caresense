/**
 * CareSense360 Landing Page Script
 * Fully client-side interactive logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Mobile Navigation Functionality ---
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const mobileNav = document.getElementById('mobile-nav');

  if (menuToggle && mobileNav) {
    const openMenu = () => {
      menuToggle.setAttribute('aria-expanded', 'true');
      mobileNav.removeAttribute('hidden');
    };

    const closeMenu = (returnFocus = false) => {
      menuToggle.setAttribute('aria-expanded', 'false');
      mobileNav.setAttribute('hidden', '');
      if (returnFocus) {
        menuToggle.focus();
      }
    };

    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // Close menu when any link inside mobile navigation is clicked
    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        closeMenu();
      });
    });

    // Close menu when Escape key is pressed
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
        closeMenu(true);
      }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (menuToggle.getAttribute('aria-expanded') === 'true') {
        if (!mobileNav.contains(e.target) && !menuToggle.contains(e.target)) {
          closeMenu();
        }
      }
    });

    // Close menu on resize to desktop view
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 992 && menuToggle.getAttribute('aria-expanded') === 'true') {
        closeMenu();
      }
    });
  }

  // --- Pilot Request Form Logic ---
  const form = document.getElementById('pilot-form');
  const status = document.getElementById('pilot-status');
  const storageKey = 'careSense360PilotRequests';
  const fieldNames = [
    'fullName',
    'phoneNumber',
    'emailAddress',
    'organisationName'
  ];

  if (!form || !status) return;

  function appendPilotRequest(request) {
    const stored = localStorage.getItem(storageKey);
    const requests = stored === null ? [] : JSON.parse(stored);

    if (!Array.isArray(requests)) {
      throw new Error('Unexpected storage format');
    }

    requests.push(request);
    localStorage.setItem(storageKey, JSON.stringify(requests));
  }

  form.addEventListener('input', (event) => {
    if (fieldNames.includes(event.target.name)) {
      event.target.setCustomValidity('');
      status.textContent = '';
      status.removeAttribute('data-state');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;

    const request = {};
    for (const name of fieldNames) {
      const input = form.elements.namedItem(name);
      const value = input.value.trim();
      input.setCustomValidity(value ? '' : 'Please complete this field.');
      request[name] = value;
    }
    if (!form.reportValidity()) return;

    button.disabled = true;
    request.submissionDateTime = new Date().toISOString();

    try {
      // Serialise writes from tabs on the same origin where Web Locks are supported.
      if (navigator.locks?.request) {
        await navigator.locks.request(storageKey, () => appendPilotRequest(request));
      } else {
        appendPilotRequest(request);
      }

      form.reset();
      status.setAttribute('data-state', 'success');
      status.textContent = 'Your pilot request has been saved in this browser.';
    } catch {
      status.setAttribute('data-state', 'error');
      status.textContent =
        'Your request could not be saved in this browser. Your entries are still in the form.';
    } finally {
      button.disabled = false;
    }
  });
});
