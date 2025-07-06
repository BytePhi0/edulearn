// Ensure code runs after DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    let selectedRole = null;
    let authMode = 'login';

    // Helper to show only one page at a time
    function showPage(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    }

    // Set login/register mode and update form fields
    function setAuthMode(mode) {
        authMode = mode;
        document.getElementById('auth-title').textContent = (mode === 'login') ? 'Login' : 'Register';
        document.getElementById('auth-btn-text').textContent = (mode === 'login') ? 'Send OTP' : 'Register';
        document.getElementById('auth-toggle-text').innerHTML =
            (mode === 'login')
                ? "Don't have an account? <a href='#' id='toggle-link'>Register here</a>"
                : "Already have an account? <a href='#' id='toggle-link'>Login here</a>";

        document.getElementById('otp-section').style.display = 'none';
        document.getElementById('auth-form').style.display = '';
        updateAuthFormForRole(selectedRole);
        attachToggleHandler();
    }

    // Show/hide name and department fields based on role and mode
    function updateAuthFormForRole(role) {
        if (authMode === 'login') {
            document.getElementById('name-group').style.display = 'none';
            document.getElementById('department-group').style.display = 'none';
        } else {
            document.getElementById('name-group').style.display = '';
            document.getElementById('department-group').style.display = (role === 'lecturer') ? '' : 'none';
        }
    }

    // Attach toggle handler every time the toggle link is updated
    function attachToggleHandler() {
        const link = document.getElementById('toggle-link');
        if (link) {
            link.onclick = function (e) {
                e.preventDefault();
                setAuthMode(authMode === 'login' ? 'register' : 'login');
            };
        }
    }

    // Role button click: show auth page, set role, set mode
    document.querySelectorAll('.select-role-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            selectedRole = btn.getAttribute('data-role');
            showPage('auth-page');
            setAuthMode('login');
        });
    });

    // Attach toggle handler for first load
    attachToggleHandler();
});
