// Meeting functionality for E-Learning Platform

class MeetingManager {
    constructor() {
        this.currentMeeting = null;
        this.participants = new Map();
        this.chatMessages = [];
        this.isRecording = false;
        this.localStream = null;
        this.remoteStreams = new Map();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeMediaDevices();
    }

    setupEventListeners() {
        // Meeting controls
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-action="start-meeting"]')) {
                this.startMeeting(e.target.dataset.meetingId);
            }
            
            if (e.target.matches('[data-action="join-meeting"]')) {
                this.joinMeeting(e.target.dataset.meetingId);
            }
            
            if (e.target.matches('[data-action="leave-meeting"]')) {
                this.leaveMeeting();
            }
            
            if (e.target.matches('[data-action="toggle-video"]')) {
                this.toggleVideo();
            }
            
            if (e.target.matches('[data-action="toggle-audio"]')) {
                this.toggleAudio();
            }
            
            if (e.target.matches('[data-action="toggle-screen-share"]')) {
                this.toggleScreenShare();
            }
            
            if (e.target.matches('[data-action="toggle-recording"]')) {
                this.toggleRecording();
            }
            
            if (e.target.matches('[data-action="toggle-chat"]')) {
                this.toggleChat();
            }
        });

        // Chat functionality
        const chatForm = document.getElementById('chatForm');
        if (chatForm) {
            chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendChatMessage();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'm':
                        e.preventDefault();
                        this.toggleAudio();
                        break;
                    case 'e':
                        e.preventDefault();
                        this.toggleVideo();
                        break;
                    case 'd':
                        e.preventDefault();
                        this.toggleScreenShare();
                        break;
                }
            }
        });

        // Window events
        window.addEventListener('beforeunload', () => {
            if (this.currentMeeting) {
                this.leaveMeeting();
            }
        });
    }

    async initializeMediaDevices() {
        try {
            // Get available devices
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.populateDeviceSelectors(devices);
            
            // Test camera and microphone access
            await this.testMediaDevices();
        } catch (error) {
            console.error('Failed to initialize media devices:', error);
            this.showError('Unable to access camera or microphone');
        }
    }

    populateDeviceSelectors(devices) {
        const videoSelect = document.getElementById('videoDeviceSelect');
        const audioSelect = document.getElementById('audioDeviceSelect');
        
        if (videoSelect) {
            videoSelect.innerHTML = '';
            devices
                .filter(device => device.kind === 'videoinput')
                .forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.textContent = device.label || `Camera ${device.deviceId.slice(0, 8)}`;
                    videoSelect.appendChild(option);
                });
        }
        
        if (audioSelect) {
            audioSelect.innerHTML = '';
            devices
                .filter(device => device.kind === 'audioinput')
                .forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.textContent = device.label || `Microphone ${device.deviceId.slice(0, 8)}`;
                    audioSelect.appendChild(option);
                });
        }
    }

    async testMediaDevices() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            // Stop the test stream
            stream.getTracks().forEach(track => track.stop());
            
            this.updateDeviceStatus('ready');
        } catch (error) {
            console.error('Media device test failed:', error);
            this.updateDeviceStatus('error');
        }
    }

    updateDeviceStatus(status) {
        const statusElement = document.getElementById('deviceStatus');
        if (statusElement) {
            statusElement.className = `device-status device-status-${status}`;
            statusElement.textContent = {
                'ready': 'Devices ready',
                'error': 'Device access denied',
                'testing': 'Testing devices...'
            }[status] || status;
        }
    }

    async startMeeting(meetingId) {
        try {
            this.showLoadingState('Starting meeting...');
            
            // Initialize local media
            await this.initializeLocalMedia();
            
            // Start meeting on server
            const response = await fetch(`/api/meetings/${meetingId}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error('Failed to start meeting');
            }
            
            const meetingData = await response.json();
            this.currentMeeting = meetingData;
            
            // Setup meeting UI
            this.setupMeetingUI();
            this.startHeartbeat();
            
            this.hideLoadingState();
            this.showSuccess('Meeting started successfully');
            
        } catch (error) {
            console.error('Failed to start meeting:', error);
            this.hideLoadingState();
            this.showError('Failed to start meeting: ' + error.message);
        }
    }

    async joinMeeting(meetingId) {
        try {
            this.showLoadingState('Joining meeting...');
            
            // Initialize local media
            await this.initializeLocalMedia();
            
            // Join meeting on server
            const response = await fetch(`/api/meetings/${meetingId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error('Failed to join meeting');
            }
            
            const meetingData = await response.json();
            this.currentMeeting = meetingData;
            
            // Setup meeting UI
            this.setupMeetingUI();
            this.startHeartbeat();
            
            // Record attendance
            await this.recordAttendance();
            
            this.hideLoadingState();
            this.showSuccess('Joined meeting successfully');
            
        } catch (error) {
            console.error('Failed to join meeting:', error);
            this.hideLoadingState();
            this.showError('Failed to join meeting: ' + error.message);
        }
    }

    async leaveMeeting() {
        try {
            if (!this.currentMeeting) return;
            
            // Stop local media
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
            
            // Stop recording if active
            if (this.isRecording) {
                await this.stopRecording();
            }
            
            // Leave meeting on server
            await fetch(`/api/meetings/${this.currentMeeting.id}/leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            // Stop heartbeat
            this.stopHeartbeat();
            
            // Reset state
            this.currentMeeting = null;
            this.participants.clear();
            this.chatMessages = [];
            
            // Reset UI
            this.resetMeetingUI();
            
            this.showSuccess('Left meeting successfully');
            
        } catch (error) {
            console.error('Failed to leave meeting:', error);
            this.showError('Failed to leave meeting properly');
        }
    }

    async initializeLocalMedia() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Display local video
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
                localVideo.muted = true;
            }
            
        } catch (error) {
            console.error('Failed to get user media:', error);
            throw new Error('Camera or microphone access denied');
        }
    }

    toggleVideo() {
        if (!this.localStream) return;
        
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            this.updateControlButton('video', videoTrack.enabled);
            
            // Notify other participants
            this.broadcastMediaState();
        }
    }

    toggleAudio() {
        if (!this.localStream) return;
        
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            this.updateControlButton('audio', audioTrack.enabled);
            
            // Notify other participants
            this.broadcastMediaState();
        }
    }

    async toggleScreenShare() {
        try {
            if (this.isScreenSharing) {
                await this.stopScreenShare();
            } else {
                await this.startScreenShare();
            }
        } catch (error) {
            console.error('Screen share error:', error);
            this.showError('Failed to toggle screen share');
        }
    }

    async startScreenShare() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            
            // Replace video track
            const videoTrack = screenStream.getVideoTracks()[0];
            const sender = this.peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
            
            this.isScreenSharing = true;
            this.updateControlButton('screen-share', true);
            
            // Handle screen share end
            videoTrack.addEventListener('ended', () => {
                this.stopScreenShare();
            });
            
        } catch (error) {
            console.error('Failed to start screen share:', error);
            throw error;
        }
    }

    async stopScreenShare() {
        try {
            // Get camera stream back
            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
            
            const videoTrack = cameraStream.getVideoTracks()[0];
            const sender = this.peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
            
            this.isScreenSharing = false;
            this.updateControlButton('screen-share', false);
            
        } catch (error) {
            console.error('Failed to stop screen share:', error);
            throw error;
        }
    }

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const response = await fetch(`/api/meetings/${this.currentMeeting.id}/start-recording`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error('Failed to start recording');
            }
            
            this.isRecording = true;
            this.updateControlButton('recording', true);
            this.showSuccess('Recording started');
            
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.showError('Failed to start recording');
        }
    }

    async stopRecording() {
        try {
            const response = await fetch(`/api/meetings/${this.currentMeeting.id}/stop-recording`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error('Failed to stop recording');
            }
            
            this.isRecording = false;
            this.updateControlButton('recording', false);
            this.showSuccess('Recording stopped');
            
        } catch (error) {
            console.error('Failed to stop recording:', error);
            this.showError('Failed to stop recording');
        }
    }

    sendChatMessage() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput || !chatInput.value.trim()) return;
        
        const message = {
            id: Date.now(),
            text: chatInput.value.trim(),
            sender: this.currentUser,
            timestamp: new Date().toISOString()
        };
        
        this.chatMessages.push(message);
        this.displayChatMessage(message);
        
        // Send to other participants
        this.broadcastChatMessage(message);
        
        chatInput.value = '';
    }

    displayChatMessage(message) {
        const chatContainer = document.getElementById('chatMessages');
        if (!chatContainer) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        messageElement.innerHTML = `
            <div class="chat-message-header">
                <span class="chat-sender">${message.sender.name}</span>
                <span class="chat-time">${new Date(message.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="chat-message-text">${this.escapeHtml(message.text)}</div>
        `;
        
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    updateControlButton(control, enabled) {
        const button = document.querySelector(`[data-action="toggle-${control}"]`);
        if (!button) return;
        
        button.classList.toggle('active', enabled);
        
        const icon = button.querySelector('i');
        if (icon) {
            const iconClasses = {
                'video': enabled ? 'fa-video' : 'fa-video-slash',
                'audio': enabled ? 'fa-microphone' : 'fa-microphone-slash',
                'screen-share': enabled ? 'fa-stop' : 'fa-desktop',
                'recording': enabled ? 'fa-stop' : 'fa-record-vinyl'
            };
            
            icon.className = `fas ${iconClasses[control]}`;
        }
    }

    setupMeetingUI() {
        // Show meeting interface
        const meetingContainer = document.getElementById('meetingContainer');
        if (meetingContainer) {
            meetingContainer.classList.add('active');
        }
        
        // Hide pre-meeting interface
        const preMeetingContainer = document.getElementById('preMeetingContainer');
        if (preMeetingContainer) {
            preMeetingContainer.classList.add('hidden');
        }
        
        // Update meeting info
        this.updateMeetingInfo();
        
        // Initialize participant list
        this.updateParticipantList();
    }

    resetMeetingUI() {
        // Hide meeting interface
        const meetingContainer = document.getElementById('meetingContainer');
        if (meetingContainer) {
            meetingContainer.classList.remove('active');
        }
        
        // Show pre-meeting interface
        const preMeetingContainer = document.getElementById('preMeetingContainer');
        if (preMeetingContainer) {
            preMeetingContainer.classList.remove('hidden');
        }
        
        // Clear video elements
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = null;
        }
        
        // Clear chat
        const chatContainer = document.getElementById('chatMessages');
        if (chatContainer) {
            chatContainer.innerHTML = '';
        }
    }

    updateMeetingInfo() {
        if (!this.currentMeeting) return;
        
        const titleElement = document.getElementById('meetingTitle');
        if (titleElement) {
            titleElement.textContent = this.currentMeeting.title;
        }
        
        const timeElement = document.getElementById('meetingTime');
        if (timeElement) {
            this.startMeetingTimer(timeElement);
        }
    }

    startMeetingTimer(element) {
        const startTime = new Date();
        
        this.timerInterval = setInterval(() => {
            const elapsed = new Date() - startTime;
            const hours = Math.floor(elapsed / 3600000);
            const minutes = Math.floor((elapsed % 3600000) / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            
            element.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(async () => {
            try {
                await fetch(`/api/meetings/${this.currentMeeting.id}/heartbeat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error) {
                console.error('Heartbeat failed:', error);
            }
        }, 30000); // Send heartbeat every 30 seconds
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    async recordAttendance() {
        try {
            await fetch(`/api/meetings/${this.currentMeeting.id}/attendance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Failed to record attendance:', error);
        }
    }

    // Utility methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showLoadingState(message) {
        // Implementation for showing loading state
        console.log('Loading:', message);
    }

    hideLoadingState() {
        // Implementation for hiding loading state
        console.log('Loading complete');
    }

    showSuccess(message) {
        // Implementation for showing success message
        console.log('Success:', message);
    }

    showError(message) {
        // Implementation for showing error message
        console.error('Error:', message);
    }
}

// Initialize meeting manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.meetingManager = new MeetingManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MeetingManager;
}
