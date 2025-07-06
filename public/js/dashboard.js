document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard functionality
    initializeStats();
    setupEventListeners();
    setupRealTimeUpdates();
});

function initializeStats() {
    // Animate stat numbers on page load
    const statNumbers = document.querySelectorAll('.stat-number');
    statNumbers.forEach(stat => {
        const finalNumber = parseInt(stat.textContent);
        animateNumber(stat, 0, finalNumber, 1000);
    });
}

function animateNumber(element, start, end, duration) {
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const current = Math.floor(start + (end - start) * progress);
        element.textContent = current;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

function setupEventListeners() {
    // Mobile sidebar toggle
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('show');
        });
    }

    // Export attendance buttons
    const exportButtons = document.querySelectorAll('[data-export-attendance]');
    exportButtons.forEach(button => {
        button.addEventListener('click', function() {
            const classId = this.dataset.classId;
            exportAttendance(classId);
        });
    });

    // Start class buttons
    const startButtons = document.querySelectorAll('[data-start-class]');
    startButtons.forEach(button => {
        button.addEventListener('click', function() {
            const classId = this.dataset.classId;
            const meetingLink = this.dataset.meetingLink;
            startClass(classId, meetingLink);
        });
    });
}

function setupRealTimeUpdates() {
    // Refresh dashboard stats every 30 seconds
    setInterval(refreshStats, 30000);
    
    // Check for upcoming classes every minute
    setInterval(checkUpcomingClasses, 60000);
}

async function refreshStats() {
    try {
        const response = await fetch('/dashboard/stats');
        const stats = await response.json();
        
        // Update stat displays
        Object.keys(stats).forEach(key => {
            const element = document.querySelector(`[data-stat="${key}"]`);
            if (element) {
                const currentValue = parseInt(element.textContent);
                const newValue = stats[key];
                
                if (currentValue !== newValue) {
                    animateNumber(element, currentValue, newValue, 500);
                }
            }
        });
    } catch (error) {
        console.error('Failed to refresh stats:', error);
    }
}

function checkUpcomingClasses() {
    const now = new Date();
    const upcomingRows = document.querySelectorAll('[data-class-time]');
    
    upcomingRows.forEach(row => {
        const classTime = new Date(row.dataset.classTime);
        const timeDiff = classTime - now;
        
        // Show notification if class starts in 10 minutes
        if (timeDiff > 0 && timeDiff <= 10 * 60 * 1000) {
            showNotification('Class starting soon!', `${row.dataset.classTitle} starts in ${Math.ceil(timeDiff / 60000)} minutes`);
        }
    });
}

async function exportAttendance(classId) {
    try {
        showLoading('Generating attendance report...');
        
        const response = await fetch(`/attendance/class/${classId}/export`);
        const result = await response.json();
        
        hideLoading();
        
        if (result.success) {
            // Create download link
            const link = document.createElement('a');
            link.href = result.downloadUrl;
            link.download = result.filename;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showNotification('Success', 'Attendance report downloaded successfully');
        } else {
            showNotification('Error', result.message, 'error');
        }
    } catch (error) {
        hideLoading();
        showNotification('Error', 'Failed to export attendance', 'error');
    }
}

function startClass(classId, meetingLink) {
    // Open meeting in new tab
    window.open(meetingLink, '_blank');
    
    // Update class status
    fetch(`/classes/${classId}/start`, { method: 'POST' })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                showNotification('Success', 'Class started successfully');
                // Refresh page to update UI
                setTimeout(() => location.reload(), 2000);
            }
        })
        .catch(error => {
            console.error('Failed to start class:', error);
        });
}

function showLoading(message = 'Loading...') {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading-overlay';
    loadingDiv.innerHTML = `
        <div class="loading-content">
            <div class="spinner"></div>
            <p>${message}</p>
        </div>
    `;
    loadingDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    document.body.appendChild(loadingDiv);
}

function hideLoading() {
    const loadingDiv = document.getElementById('loading-overlay');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

function showNotification(title, message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <strong>${title}</strong>
            <p>${message}</p>
            <button class="notification-close">&times;</button>
        </div>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        min-width: 300px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        transform: translateX(400px);
        transition: transform 0.3s ease;
    `;
    
    if (type === 'error') {
        notification.style.borderLeft = '4px solid #ef4444';
    } else {
        notification.style.borderLeft = '4px solid #10b981';
    }
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Close button functionality
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => notification.remove(), 300);
    });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}
