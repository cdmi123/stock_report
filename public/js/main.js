/* =====================================================
   ENTERPRISE ERP DASHBOARD - CLIENT-SIDE SCRIPTS
   Fully Responsive & Interactive
   ===================================================== */

'use strict';

document.addEventListener('DOMContentLoaded', function () {
  initThemeSwitcher();
  initSidebarToggle();
  initActiveNavLink();
  initDataTables();
  initTooltips();
  initFormValidation();
  initResponsiveBehavior();
  initClickOutsideHandler();
});

// ===== THEME SWITCHER =====
function initThemeSwitcher() {
  const themeToggleBtn = document.getElementById('theme-toggle');
  const currentTheme = localStorage.getItem('theme') || 'light';

  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeIcon(currentTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const theme = document.documentElement.getAttribute('data-theme');
      const newTheme = theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcon(newTheme);
    });
  }

  function updateThemeIcon(theme) {
    if (!themeToggleBtn) return;
    const icon = themeToggleBtn.querySelector('i');
    if (theme === 'dark') {
      icon.className = 'bi bi-sun-fill text-warning';
      themeToggleBtn.title = 'Switch to Light Mode';
    } else {
      icon.className = 'bi bi-moon-stars-fill text-dark';
      themeToggleBtn.title = 'Switch to Dark Mode';
    }
  }
}

// ===== SIDEBAR TOGGLE FOR MOBILE / TABLET =====
function initSidebarToggle() {
  const sidebarCollapseBtn = document.getElementById('sidebarCollapse');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('active');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function toggleSidebar() {
    if (sidebar && sidebar.classList.contains('active')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  if (sidebarCollapseBtn && sidebar) {
    sidebarCollapseBtn.addEventListener('click', toggleSidebar);

    const navLinks = sidebar.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', function () {
        if (window.innerWidth <= 991) {
          closeSidebar();
        }
      });
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  window.addEventListener('resize', function () {
    if (window.innerWidth > 991) {
      closeSidebar();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeSidebar();
    }
  });
}

// ===== ACTIVE NAV LINK HIGHLIGHTING =====
function initActiveNavLink() {
  const navLinks = document.querySelectorAll('#sidebar .nav-link');
  const currentPath = window.location.pathname;

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (currentPath === href || (href !== '/' && currentPath.startsWith(href + '/'))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// ===== DATA TABLES INITIALIZATION =====
function initDataTables() {
  if (typeof $ === 'undefined' || !$.fn.DataTable) return;

  $('.datatable').each(function () {
    if ($.fn.DataTable.isDataTable(this)) return;

    $(this).DataTable({
      responsive: false,
      scrollX: true,
      autoWidth: false,
      pageLength: 10,
      lengthMenu: [10, 25, 50, 100],
      dom: '<"row align-items-center g-2"<"col-sm-6 col-12"B><"col-sm-6 col-12"f>>rtip',
      buttons: [
        {
          extend: 'excelHtml5',
          text: '<i class="bi bi-file-earmark-excel-fill me-1"></i> Excel',
          className: 'btn btn-success btn-sm border-0 rounded px-3 py-1.5'
        },
        {
          extend: 'pdfHtml5',
          text: '<i class="bi bi-file-earmark-pdf-fill me-1"></i> PDF',
          className: 'btn btn-danger btn-sm border-0 rounded px-3 py-1.5'
        },
        {
          extend: 'print',
          text: '<i class="bi bi-printer-fill me-1"></i> Print',
          className: 'btn btn-secondary btn-sm border-0 rounded px-3 py-1.5'
        }
      ],
      language: {
        search: '',
        searchPlaceholder: 'Search table...'
      }
    });
  });
}

// ===== BOOTSTRAP TOOLTIPS =====
function initTooltips() {
  if (typeof bootstrap === 'undefined') return;
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
}

// ===== FORM VALIDATION FEEDBACK =====
function initFormValidation() {
  const forms = document.querySelectorAll('.needs-validation');
  forms.forEach(form => {
    form.addEventListener('submit', function (event) {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      form.classList.add('was-validated');
    });
  });
}

// ===== RESPONSIVE BEHAVIOR (resize handlers) =====
function initResponsiveBehavior() {
  let resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (typeof $ !== 'undefined' && $.fn.DataTable) {
        $('.datatable').each(function () {
          if ($.fn.DataTable.isDataTable(this)) {
            $(this).DataTable().columns.adjust();
          }
        });
      }
    }, 200);
  });
}

// ===== CLICK OUTSIDE HANDLER (dropdowns on mobile) =====
function initClickOutsideHandler() {
  document.addEventListener('click', function (e) {
    const sidebar = document.getElementById('sidebar');
    const sidebarBtn = document.getElementById('sidebarCollapse');
    const overlay = document.getElementById('sidebar-overlay');

    if (!sidebar || !sidebar.classList.contains('active')) return;
    if (window.innerWidth > 991) return;

    const clickedInsideSidebar = sidebar.contains(e.target);
    const clickedToggle = sidebarBtn && sidebarBtn.contains(e.target);
    const clickedOverlay = overlay && overlay.contains(e.target);

    if (!clickedInsideSidebar && !clickedToggle && !clickedOverlay) {
      sidebar.classList.remove('active');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
}
