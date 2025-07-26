const EventEmitter = require('events');

/**
 * WhatsApp Call Manager
 * Handles all call operations including voice calls, video calls, and call management
 */
class WACallManager extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableCalls: options.enableCalls !== false,
            enableVideoCalls: options.enableVideoCalls !== false,
            enableGroupCalls: options.enableGroupCalls !== false,
            maxCallDuration: options.maxCallDuration || 14400000, // 4 hours
            callTimeout: options.callTimeout || 60000, // 1 minute
            enableCallRecording: options.enableCallRecording || false,
            enableCallHistory: options.enableCallHistory !== false,
            maxCallHistory: options.maxCallHistory || 1000,
            enableCallBlocking: options.enableCallBlocking !== false,
            ...options
        };

        // Call data stores
        this.activeCalls = new Map();
        this.callHistory = [];
        this.incomingCalls = new Map();
        this.outgoingCalls = new Map();
        this.missedCalls = new Map();
        this.blockedCallers = new Set();
        this.callSettings = new Map();
        
        // Call states
        this.callStates = {
            IDLE: 'idle',
            RINGING: 'ringing',
            CONNECTING: 'connecting',
            CONNECTED: 'connected',
            ON_HOLD: 'on_hold',
            ENDING: 'ending',
            ENDED: 'ended',
            FAILED: 'failed',
            REJECTED: 'rejected',
            MISSED: 'missed'
        };

        // Call types
        this.callTypes = {
            VOICE: 'voice',
            VIDEO: 'video'
        };

        this.initialize();
    }

    async initialize() {
        try {
            await this.loadCallHistory();
            await this.loadCallSettings();
            this.setupSocketEventHandlers();
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        // Incoming calls
        this.socket.on('call', (calls) => {
            calls.forEach(call => {
                this.handleIncomingCall(call);
            });
        });

        // Call updates
        this.socket.on('call.update', (callUpdate) => {
            this.handleCallUpdate(callUpdate);
        });

        // Call end
        this.socket.on('call.end', (callEnd) => {
            this.handleCallEnd(callEnd);
        });
    }

    // Outgoing calls
    async makeCall(recipientJid, callType = this.callTypes.VOICE, options = {}) {
        try {
            // Validate recipient
            if (!recipientJid) {
                throw new Error('Recipient JID is required');
            }

            // Check if calls are enabled
            if (!this.options.enableCalls) {
                throw new Error('Calls are disabled');
            }

            // Check if video calls are enabled for video calls
            if (callType === this.callTypes.VIDEO && !this.options.enableVideoCalls) {
                throw new Error('Video calls are disabled');
            }

            // Check if caller is blocked
            if (this.blockedCallers.has(recipientJid)) {
                throw new Error('Recipient has blocked calls');
            }

            // Create call object
            const call = {
                id: this.generateCallId(),
                from: this.socket.user.id,
                to: recipientJid,
                type: callType,
                direction: 'outgoing',
                state: this.callStates.RINGING,
                startTime: new Date().toISOString(),
                endTime: null,
                duration: 0,
                isGroup: recipientJid.endsWith('@g.us'),
                participants: [this.socket.user.id, recipientJid],
                mediaState: {
                    audio: true,
                    video: callType === this.callTypes.VIDEO,
                    screen: false
                },
                quality: options.quality || 'auto',
                metadata: options.metadata || {}
            };

            // Send call offer
            const response = await this.socket.query({
                tag: 'call',
                attrs: {
                    id: call.id,
                    from: call.from,
                    to: call.to
                },
                content: [{
                    tag: 'offer',
                    attrs: {
                        'call-id': call.id,
                        'call-creator': call.from,
                        'media': callType
                    },
                    content: this.generateCallOffer(call)
                }]
            });

            // Store call
            this.activeCalls.set(call.id, call);
            this.outgoingCalls.set(call.id, call);

            // Set call timeout
            setTimeout(() => {
                if (this.activeCalls.has(call.id) && 
                    this.activeCalls.get(call.id).state === this.callStates.RINGING) {
                    this.endCall(call.id, 'timeout');
                }
            }, this.options.callTimeout);

            this.emit('call.initiated', call);
            return call;
        } catch (error) {
            throw new Error(`Call initiation failed: ${error.message}`);
        }
    }

    // Answer incoming call
    async answerCall(callId, options = {}) {
        try {
            const call = this.incomingCalls.get(callId);
            if (!call) {
                throw new Error('Call not found');
            }

            if (call.state !== this.callStates.RINGING) {
                throw new Error('Call is not in ringing state');
            }

            // Update call state
            call.state = this.callStates.CONNECTING;
            call.answeredAt = new Date().toISOString();
            
            // Update media state if specified
            if (options.video !== undefined) {
                call.mediaState.video = options.video;
            }
            if (options.audio !== undefined) {
                call.mediaState.audio = options.audio;
            }

            // Send call accept
            await this.socket.query({
                tag: 'call',
                attrs: {
                    id: callId,
                    from: call.to,
                    to: call.from
                },
                content: [{
                    tag: 'accept',
                    attrs: {
                        'call-id': callId,
                        'call-creator': call.from
                    },
                    content: this.generateCallAnswer(call)
                }]
            });

            // Move to active calls
            this.activeCalls.set(callId, call);
            this.incomingCalls.delete(callId);

            this.emit('call.answered', call);
            return call;
        } catch (error) {
            throw new Error(`Call answer failed: ${error.message}`);
        }
    }

    // Reject incoming call
    async rejectCall(callId, reason = 'declined') {
        try {
            const call = this.incomingCalls.get(callId);
            if (!call) {
                throw new Error('Call not found');
            }

            // Update call state
            call.state = this.callStates.REJECTED;
            call.endTime = new Date().toISOString();
            call.endReason = reason;

            // Send call reject
            await this.socket.query({
                tag: 'call',
                attrs: {
                    id: callId,
                    from: call.to,
                    to: call.from
                },
                content: [{
                    tag: 'reject',
                    attrs: {
                        'call-id': callId,
                        'call-creator': call.from,
                        'reason': reason
                    }
                }]
            });

            // Add to call history
            this.addToCallHistory(call);

            // Remove from incoming calls
            this.incomingCalls.delete(callId);

            this.emit('call.rejected', call);
            return call;
        } catch (error) {
            throw new Error(`Call rejection failed: ${error.message}`);
        }
    }

    // End active call
    async endCall(callId, reason = 'ended') {
        try {
            const call = this.activeCalls.get(callId) || 
                        this.outgoingCalls.get(callId) || 
                        this.incomingCalls.get(callId);
            
            if (!call) {
                throw new Error('Call not found');
            }

            // Update call state
            call.state = this.callStates.ENDING;
            const endTime = new Date().toISOString();
            call.endTime = endTime;
            call.endReason = reason;

            // Calculate duration if call was connected
            if (call.connectedAt) {
                call.duration = new Date(endTime).getTime() - new Date(call.connectedAt).getTime();
            }

            // Send call terminate
            await this.socket.query({
                tag: 'call',
                attrs: {
                    id: callId,
                    from: this.socket.user.id,
                    to: call.direction === 'outgoing' ? call.to : call.from
                },
                content: [{
                    tag: 'terminate',
                    attrs: {
                        'call-id': callId,
                        'reason': reason
                    }
                }]
            });

            // Update final state
            call.state = this.callStates.ENDED;

            // Add to call history
            this.addToCallHistory(call);

            // Remove from active calls
            this.activeCalls.delete(callId);
            this.outgoingCalls.delete(callId);
            this.incomingCalls.delete(callId);

            this.emit('call.ended', call);
            return call;
        } catch (error) {
            throw new Error(`Call termination failed: ${error.message}`);
        }
    }

    // Call media control
    async toggleAudio(callId, enabled = null) {
        try {
            const call = this.activeCalls.get(callId);
            if (!call) {
                throw new Error('Active call not found');
            }

            const newState = enabled !== null ? enabled : !call.mediaState.audio;
            call.mediaState.audio = newState;

            // Send media update
            await this.sendMediaUpdate(callId, { audio: newState });

            this.emit('call.audio.toggled', { callId, enabled: newState });
            return newState;
        } catch (error) {
            throw new Error(`Audio toggle failed: ${error.message}`);
        }
    }

    async toggleVideo(callId, enabled = null) {
        try {
            const call = this.activeCalls.get(callId);
            if (!call) {
                throw new Error('Active call not found');
            }

            if (!this.options.enableVideoCalls) {
                throw new Error('Video calls are disabled');
            }

            const newState = enabled !== null ? enabled : !call.mediaState.video;
            call.mediaState.video = newState;

            // Send media update
            await this.sendMediaUpdate(callId, { video: newState });

            this.emit('call.video.toggled', { callId, enabled: newState });
            return newState;
        } catch (error) {
            throw new Error(`Video toggle failed: ${error.message}`);
        }
    }

    async toggleScreenShare(callId, enabled = null) {
        try {
            const call = this.activeCalls.get(callId);
            if (!call) {
                throw new Error('Active call not found');
            }

            const newState = enabled !== null ? enabled : !call.mediaState.screen;
            call.mediaState.screen = newState;

            // Send media update
            await this.sendMediaUpdate(callId, { screen: newState });

            this.emit('call.screen.toggled', { callId, enabled: newState });
            return newState;
        } catch (error) {
            throw new Error(`Screen share toggle failed: ${error.message}`);
        }
    }

    // Call hold
    async holdCall(callId) {
        try {
            const call = this.activeCalls.get(callId);
            if (!call) {
                throw new Error('Active call not found');
            }

            if (call.state !== this.callStates.CONNECTED) {
                throw new Error('Call is not connected');
            }

            call.state = this.callStates.ON_HOLD;
            call.holdTime = new Date().toISOString();

            // Send hold signal
            await this.socket.query({
                tag: 'call',
                attrs: {
                    id: callId,
                    from: this.socket.user.id
                },
                content: [{
                    tag: 'hold',
                    attrs: { 'call-id': callId }
                }]
            });

            this.emit('call.held', call);
            return call;
        } catch (error) {
            throw new Error(`Call hold failed: ${error.message}`);
        }
    }

    async resumeCall(callId) {
        try {
            const call = this.activeCalls.get(callId);
            if (!call) {
                throw new Error('Active call not found');
            }

            if (call.state !== this.callStates.ON_HOLD) {
                throw new Error('Call is not on hold');
            }

            call.state = this.callStates.CONNECTED;
            
            // Calculate hold duration
            if (call.holdTime) {
                const holdDuration = new Date().getTime() - new Date(call.holdTime).getTime();
                call.totalHoldTime = (call.totalHoldTime || 0) + holdDuration;
                delete call.holdTime;
            }

            // Send resume signal
            await this.socket.query({
                tag: 'call',
                attrs: {
                    id: callId,
                    from: this.socket.user.id
                },
                content: [{
                    tag: 'resume',
                    attrs: { 'call-id': callId }
                }]
            });

            this.emit('call.resumed', call);
            return call;
        } catch (error) {
            throw new Error(`Call resume failed: ${error.message}`);
        }
    }

    // Group calls
    async makeGroupCall(groupJid, callType = this.callTypes.VOICE, participants = []) {
        try {
            if (!this.options.enableGroupCalls) {
                throw new Error('Group calls are disabled');
            }

            const call = {
                id: this.generateCallId(),
                from: this.socket.user.id,
                to: groupJid,
                type: callType,
                direction: 'outgoing',
                state: this.callStates.RINGING,
                startTime: new Date().toISOString(),
                isGroup: true,
                participants: [this.socket.user.id, ...participants],
                mediaState: {
                    audio: true,
                    video: callType === this.callTypes.VIDEO,
                    screen: false
                }
            };

            // Send group call offer
            await this.socket.query({
                tag: 'call',
                attrs: {
                    id: call.id,
                    from: call.from,
                    to: call.to
                },
                content: [{
                    tag: 'offer',
                    attrs: {
                        'call-id': call.id,
                        'call-creator': call.from,
                        'media': callType,
                        'group': 'true'
                    },
                    content: this.generateGroupCallOffer(call)
                }]
            });

            this.activeCalls.set(call.id, call);
            this.emit('group.call.initiated', call);
            return call;
        } catch (error) {
            throw new Error(`Group call initiation failed: ${error.message}`);
        }
    }

    // Call event handlers
    handleIncomingCall(callData) {
        try {
            const call = {
                id: callData.id,
                from: callData.from,
                to: this.socket.user.id,
                type: callData.media || this.callTypes.VOICE,
                direction: 'incoming',
                state: this.callStates.RINGING,
                startTime: new Date().toISOString(),
                isGroup: callData.isGroup || false,
                participants: callData.participants || [callData.from, this.socket.user.id],
                mediaState: {
                    audio: true,
                    video: callData.media === this.callTypes.VIDEO,
                    screen: false
                }
            };

            // Check if caller is blocked
            if (this.blockedCallers.has(call.from)) {
                this.rejectCall(call.id, 'blocked');
                return;
            }

            this.incomingCalls.set(call.id, call);
            this.emit('call.incoming', call);

            // Auto-reject after timeout
            setTimeout(() => {
                if (this.incomingCalls.has(call.id)) {
                    this.rejectCall(call.id, 'timeout');
                }
            }, this.options.callTimeout);
        } catch (error) {
            this.emit('error', { message: 'Incoming call handling failed', error });
        }
    }

    handleCallUpdate(callUpdate) {
        const call = this.activeCalls.get(callUpdate.id) || 
                    this.incomingCalls.get(callUpdate.id) || 
                    this.outgoingCalls.get(callUpdate.id);

        if (call) {
            // Update call state
            if (callUpdate.state) {
                call.state = callUpdate.state;
                
                if (callUpdate.state === this.callStates.CONNECTED && !call.connectedAt) {
                    call.connectedAt = new Date().toISOString();
                }
            }

            // Update media state
            if (callUpdate.mediaState) {
                Object.assign(call.mediaState, callUpdate.mediaState);
            }

            this.emit('call.updated', call);
        }
    }

    handleCallEnd(callEnd) {
        const callId = callEnd.id;
        const call = this.activeCalls.get(callId) || 
                    this.incomingCalls.get(callId) || 
                    this.outgoingCalls.get(callId);

        if (call) {
            call.state = this.callStates.ENDED;
            call.endTime = new Date().toISOString();
            call.endReason = callEnd.reason || 'ended';

            // Calculate duration
            if (call.connectedAt) {
                call.duration = new Date(call.endTime).getTime() - new Date(call.connectedAt).getTime();
            }

            // Add to history
            this.addToCallHistory(call);

            // Remove from active calls
            this.activeCalls.delete(callId);
            this.incomingCalls.delete(callId);
            this.outgoingCalls.delete(callId);

            this.emit('call.ended', call);
        }
    }

    // Call history management
    addToCallHistory(call) {
        if (!this.options.enableCallHistory) {
            return;
        }

        const historyEntry = {
            ...call,
            addedToHistory: new Date().toISOString()
        };

        this.callHistory.unshift(historyEntry);

        // Maintain history size
        if (this.callHistory.length > this.options.maxCallHistory) {
            this.callHistory = this.callHistory.slice(0, this.options.maxCallHistory);
        }

        // Track missed calls
        if (call.state === this.callStates.MISSED || 
            (call.direction === 'incoming' && call.state === this.callStates.REJECTED && call.endReason === 'timeout')) {
            this.missedCalls.set(call.id, call);
        }

        this.emit('call.history.updated', historyEntry);
    }

    // Call blocking
    blockCaller(jid) {
        this.blockedCallers.add(jid);
        this.emit('caller.blocked', jid);
    }

    unblockCaller(jid) {
        this.blockedCallers.delete(jid);
        this.emit('caller.unblocked', jid);
    }

    isCallerBlocked(jid) {
        return this.blockedCallers.has(jid);
    }

    // Utility methods
    async sendMediaUpdate(callId, mediaState) {
        await this.socket.query({
            tag: 'call',
            attrs: {
                id: callId,
                from: this.socket.user.id
            },
            content: [{
                tag: 'media',
                attrs: {
                    'call-id': callId,
                    ...mediaState
                }
            }]
        });
    }

    generateCallOffer(call) {
        return [
            { tag: 'media', attrs: { type: call.type } },
            { tag: 'encryption', attrs: { type: 'SDES' } },
            { tag: 'capability', attrs: { ver: '1' } }
        ];
    }

    generateCallAnswer(call) {
        return [
            { tag: 'media', attrs: { type: call.type } },
            { tag: 'encryption', attrs: { type: 'SDES' } },
            { tag: 'accept', attrs: {} }
        ];
    }

    generateGroupCallOffer(call) {
        return [
            { tag: 'media', attrs: { type: call.type } },
            { tag: 'group', attrs: { participants: call.participants.join(',') } },
            { tag: 'encryption', attrs: { type: 'SDES' } }
        ];
    }

    generateCallId() {
        return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async loadCallHistory() {
        // Load call history from storage
        // This would be implemented with actual storage
    }

    async loadCallSettings() {
        // Load call settings from storage
        // This would be implemented with actual storage
    }

    // Getters
    getActiveCalls() {
        return Array.from(this.activeCalls.values());
    }

    getIncomingCalls() {
        return Array.from(this.incomingCalls.values());
    }

    getOutgoingCalls() {
        return Array.from(this.outgoingCalls.values());
    }

    getCallHistory(limit = 50) {
        return this.callHistory.slice(0, limit);
    }

    getMissedCalls() {
        return Array.from(this.missedCalls.values());
    }

    getBlockedCallers() {
        return Array.from(this.blockedCallers);
    }

    getCall(callId) {
        return this.activeCalls.get(callId) || 
               this.incomingCalls.get(callId) || 
               this.outgoingCalls.get(callId);
    }

    // Statistics
    getCallStats() {
        const history = this.callHistory;
        const totalCalls = history.length;
        const missedCalls = history.filter(call => call.state === this.callStates.MISSED).length;
        const answeredCalls = history.filter(call => call.connectedAt).length;
        const totalDuration = history.reduce((sum, call) => sum + (call.duration || 0), 0);

        return {
            totalCalls: totalCalls,
            answeredCalls: answeredCalls,
            missedCalls: missedCalls,
            rejectedCalls: history.filter(call => call.state === this.callStates.REJECTED).length,
            averageDuration: answeredCalls > 0 ? Math.round(totalDuration / answeredCalls) : 0,
            totalDuration: totalDuration,
            activeCalls: this.activeCalls.size,
            blockedCallers: this.blockedCallers.size
        };
    }

    // Cleanup
    cleanup() {
        // End all active calls
        for (const [callId] of this.activeCalls) {
            this.endCall(callId, 'cleanup');
        }

        this.activeCalls.clear();
        this.incomingCalls.clear();
        this.outgoingCalls.clear();
        this.missedCalls.clear();
        this.callHistory = [];
        this.removeAllListeners();
    }
}

module.exports = WACallManager;