const { google } = require('googleapis');
const crypto = require('crypto');
const axios = require('axios');

class MeetingService {
    constructor() {
        // Google Meet setup
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        // BigBlueButton setup
        this.bbbUrl = process.env.BBB_URL;
        this.bbbSecret = process.env.BBB_SECRET;
    }

    // Create Google Meet
    async createGoogleMeet(title, startTime) {
        try {
            const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
            
            const event = {
                summary: title,
                start: {
                    dateTime: new Date(startTime).toISOString(),
                    timeZone: 'UTC',
                },
                end: {
                    dateTime: new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString(),
                    timeZone: 'UTC',
                },
                conferenceData: {
                    createRequest: {
                        requestId: crypto.randomUUID(),
                        conferenceSolutionKey: {
                            type: 'hangoutsMeet'
                        }
                    }
                }
            };

            const response = await calendar.events.insert({
                calendarId: 'primary',
                resource: event,
                conferenceDataVersion: 1
            });

            return {
                hangoutLink: response.data.hangoutLink,
                conferenceData: response.data.conferenceData
            };
        } catch (error) {
            console.error('Google Meet creation error:', error);
            // Fallback to simple meet link
            return {
                hangoutLink: `https://meet.google.com/${crypto.randomBytes(10).toString('hex')}`,
                conferenceData: null
            };
        }
    }

    // Create BigBlueButton meeting
    async createBBBMeeting(meetingId, name) {
        try {
            const attendeePW = crypto.randomBytes(8).toString('hex');
            const moderatorPW = crypto.randomBytes(8).toString('hex');
            
            const params = new URLSearchParams({
                name: name,
                meetingID: meetingId,
                attendeePW: attendeePW,
                moderatorPW: moderatorPW,
                welcome: `Welcome to ${name}`,
                dialNumber: '',
                voiceBridge: Math.floor(Math.random() * 100000),
                maxParticipants: 100,
                logoutURL: `${process.env.APP_URL}/classes`,
                record: 'true',
                duration: 0,
                moderatorOnlyMessage: 'Welcome moderator!',
                autoStartRecording: 'false',
                allowStartStopRecording: 'true'
            });

            const queryString = params.toString();
            const checksum = crypto
                .createHash('sha1')
                .update(`create${queryString}${this.bbbSecret}`)
                .digest('hex');

            const createUrl = `${this.bbbUrl}api/create?${queryString}&checksum=${checksum}`;
            
            const response = await axios.get(createUrl);
            
            if (response.data.includes('<returncode>SUCCESS</returncode>')) {
                // Generate join URL
                const joinParams = new URLSearchParams({
                    fullName: 'Student',
                    meetingID: meetingId,
                    password: attendeePW
                });
                
                const joinQueryString = joinParams.toString();
                const joinChecksum = crypto
                    .createHash('sha1')
                    .update(`join${joinQueryString}${this.bbbSecret}`)
                    .digest('hex');

                const joinUrl = `${this.bbbUrl}api/join?${joinQueryString}&checksum=${joinChecksum}`;

                return {
                    url: joinUrl,
                    meetingId: meetingId,
                    attendeePW: attendeePW,
                    moderatorPW: moderatorPW
                };
            } else {
                throw new Error('Failed to create BBB meeting');
            }
        } catch (error) {
            console.error('BBB meeting creation error:', error);
            throw error;
        }
    }

    // Get meeting info
    async getMeetingInfo(meetingId, type = 'bbb') {
        if (type === 'bbb') {
            try {
                const params = new URLSearchParams({
                    meetingID: meetingId
                });

                const queryString = params.toString();
                const checksum = crypto
                    .createHash('sha1')
                    .update(`getMeetingInfo${queryString}${this.bbbSecret}`)
                    .digest('hex');

                const infoUrl = `${this.bbbUrl}api/getMeetingInfo?${queryString}&checksum=${checksum}`;
                const response = await axios.get(infoUrl);
                
                return response.data;
            } catch (error) {
                console.error('Get meeting info error:', error);
                return null;
            }
        }
        return null;
    }
}

module.exports = new MeetingService();
