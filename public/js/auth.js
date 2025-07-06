document.addEventListener('DOMContentLoaded', function () {
    // Get role from query string
    function getRoleFromQuery() {
        const params = new URLSearchParams(window.location.search);
        return params.get('role') || 'student';
    }

    let authMode = 'login';
    let selectedRole = getRoleFromQuery();

    document.getElementById('role').value = selectedRole;

    function setAuthMode(mode) {
        authMode = mode;
        document.getElementById('auth-title').textContent = (mode === 'login') ? 'Login' : 'Register';
        document.getElementById('auth-btn-text').textContent = (mode === 'login') ? 'Login' : 'Register';
        document.getElementById('auth-form').action = (mode === 'login') ? '/auth/login' : '/auth/register';
        document.getElementById('auth-toggle-text').innerHTML =
            (mode === 'login')
                ? "Don't have an account? <a href='#' id='toggle-link'>Register here</a>"
                : "Already have an account? <a href='#' id='toggle-link'>Login here</a>";

        document.getElementById('name-group').style.display = (mode === 'register') ? '' : 'none';
        document.getElementById('department-group').style.display = (mode === 'register' && selectedRole === 'lecturer') ? '' : 'none';
        attachToggleHandler();
    }

    function attachToggleHandler() {
        const link = document.getElementById('toggle-link');
        if (link) {
            link.onclick = function (e) {
                e.preventDefault();
                setAuthMode(authMode === 'login' ? 'register' : 'login');
            };
        }
    }

    setAuthMode('login');
    attachToggleHandler();
});
