const crypto = require('crypto');

class WACallHandler {
    constructor(socket) {
        this.socket = socket;
        this.activeCalls = new Map();
        this.callHistory = new Map();
        this.callSettings = {
            autoReject: false,
            rejectUnknown: false,
            callWaiting: true
        };
        
        // Call types
        this.callTypes = {
            VOICE: 'voice',
            VIDEO: 'video'
        };
        
        // Call states
        this.callStates = {
            RINGING: 'ringing',
            ACCEPTED: 'accepted',
            REJECTED: 'rejected',
            TIMEOUT: 'timeout',
            BUSY: 'busy',
            FAILED: 'failed',
            ENDED: 'ended'
        };
        
        // Call actions
        this.callActions = {
            OFFER: 'offer',
            ACCEPT: 'accept',
            REJECT: 'reject',
            END: 'end',
            TERMINATE: 'terminate'
        };
    }
    
    async makeCall(jid, type = 'voice', options = {}) {
        try {
            const callId = this.generateCallId();
            const timestamp = Date.now();
            
            const callData = {
                id: callId,
                from: this.socket.user?.id,
                to: jid,
                type: type,
                state: this.callStates.RINGING,
                timestamp: timestamp,
                duration: 0,
                isGroup: jid.includes('@g.us'),
                participants: jid.includes('@g.us') ? [] : [this.socket.user?.id, jid],
                ...options
            };
            
            // Create call offer node
            const callNode = {
                tag: 'call',
                attrs: {
                    id: callId,
                    to: jid,
                    type: type
                },
                content: [{
                    tag: 'offer',
                    attrs: {
                        call_id: callId,
                        call_creator: this.socket.user?.id,
                        count: '1'
                    }
                }]
            };
            
            // Send call offer
            await this.socket.sendNode(callNode);
            
            // Store active call
            this.activeCalls.set(callId, callData);
            
            // Emit call event
            this.socket.emit('call', {
                id: callId,
                from: callData.from,
                to: callData.to,
                type: callData.type,
                state: callData.state,
                timestamp: callData.timestamp,
                isGroup: callData.isGroup,
                participants: callData.participants
            });
            
            // Set call timeout
            setTimeout(() => {
                if (this.activeCalls.has(callId)) {
                    const call = this.activeCalls.get(callId);
                    if (call.state === this.callStates.RINGING) {
                        this.endCall(callId, this.callStates.TIMEOUT);
                    }
                }
            }, 60000); // 60 seconds timeout
            
            return callData;
            
        } catch (error) {
            throw new Error(`Failed to make call: ${error.message}`);
        }
    }
    
    async acceptCall(callId) {
        try {
            if (!this.activeCalls.has(callId)) {
                throw new Error('Call not found');
            }
            
            const call = this.activeCalls.get(callId);
            
            if (call.state !== this.callStates.RINGING) {
                throw new Error('Call is not in ringing state');
            }
            
            // Create accept node
            const acceptNode = {
                tag: 'call',
                attrs: {
                    id: callId,
                    to: call.from
                },
                content: [{
                    tag: 'accept',
                    attrs: {
                        call_id: callId
                    }
                }]
            };
            
            // Send accept
            await this.socket.sendNode(acceptNode);
            
            // Update call state
            call.state = this.callStates.ACCEPTED;
            call.acceptedAt = Date.now();
            
            // Emit call update
            this.socket.emit('call', {
                id: callId,
                from: call.from,
                to: call.to,
                type: call.type,
                state: call.state,
                timestamp: call.timestamp,
                acceptedAt: call.acceptedAt,
                isGroup: call.isGroup,
                participants: call.participants
            });
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to accept call: ${error.message}`);
        }
    }
    
    async rejectCall(callId, reason = 'declined') {
        try {
            if (!this.activeCalls.has(callId)) {
                throw new Error('Call not found');
            }
            
            const call = this.activeCalls.get(callId);
            
            // Create reject node
            const rejectNode = {
                tag: 'call',
                attrs: {
                    id: callId,
                    to: call.from
                },
                content: [{
                    tag: 'reject',
                    attrs: {
                        call_id: callId,
                        reason: reason
                    }
                }]
            };
            
            // Send reject
            await this.socket.sendNode(rejectNode);
            
            // Update call state
            call.state = this.callStates.REJECTED;
            call.endedAt = Date.now();
            call.duration = call.acceptedAt ? call.endedAt - call.acceptedAt : 0;
            
            // Move to history
            this.callHistory.set(callId, call);
            this.activeCalls.delete(callId);
            
            // Emit call update
            this.socket.emit('call', {
                id: callId,
                from: call.from,
                to: call.to,
                type: call.type,
                state: call.state,
                timestamp: call.timestamp,
                endedAt: call.endedAt,
                duration: call.duration,
                rejectReason: call.rejectReason,
                isGroup: call.isGroup,
                participants: call.participants
            });
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to reject call: ${error.message}`);
        }
    }
    
    async endCall(callId, reason = 'ended') {
        try {
            if (!this.activeCalls.has(callId)) {
                throw new Error('Call not found');
            }
            
            const call = this.activeCalls.get(callId);
            
            // Create end node
            const endNode = {
                tag: 'call',
                attrs: {
                    id: callId,
                    to: call.from === this.socket.user?.id ? call.to : call.from
                },
                content: [{
                    tag: 'terminate',
                    attrs: {
                        call_id: callId,
                        reason: reason
                    }
                }]
            };
            
            // Send end
            await this.socket.sendNode(endNode);
            
            // Update call state
            call.state = reason === 'timeout' ? this.callStates.TIMEOUT : this.callStates.ENDED;
            call.endedAt = Date.now();
            call.duration = call.acceptedAt ? call.endedAt - call.acceptedAt : 0;
            
            // Move to history
            this.callHistory.set(callId, call);
            this.activeCalls.delete(callId);
            
            // Emit call update
            this.socket.emit('call', {
                id: callId,
                from: call.from,
                to: call.to,
                type: call.type,
                state: call.state,
                timestamp: call.timestamp,
                endedAt: call.endedAt,
                duration: call.duration,
                endReason: call.endReason,
                isGroup: call.isGroup,
                participants: call.participants
            });
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to end call: ${error.message}`);
        }
    }
    
    handleCall(node) {
        try {
            const attrs = node.attrs || {};
            const callId = attrs.id;
            const from = attrs.from;
            const type = attrs.type || 'voice';
            
            if (!callId || !from) return;
            
            // Parse call content
            let action = null;
            let callData = {};
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag) {
                        switch (child.tag) {
                            case 'offer':
                                action = this.callActions.OFFER;
                                callData = {
                                    call_id: child.attrs?.call_id || callId,
                                    call_creator: child.attrs?.call_creator || from,
                                    count: parseInt(child.attrs?.count) || 1
                                };
                                break;
                            case 'accept':
                                action = this.callActions.ACCEPT;
                                callData = {
                                    call_id: child.attrs?.call_id || callId
                                };
                                break;
                            case 'reject':
                                action = this.callActions.REJECT;
                                callData = {
                                    call_id: child.attrs?.call_id || callId,
                                    reason: child.attrs?.reason || 'declined'
                                };
                                break;
                            case 'terminate':
                                action = this.callActions.END;
                                callData = {
                                    call_id: child.attrs?.call_id || callId,
                                    reason: child.attrs?.reason || 'ended'
                                };
                                break;
                        }
                        break;
                    }
                }
            }
            
            if (!action) return;
            
            // Handle different call actions
            switch (action) {
                case this.callActions.OFFER:
                    this.handleIncomingCall(callId, from, type, callData);
                    break;
                case this.callActions.ACCEPT:
                    this.handleCallAccepted(callId, callData);
                    break;
                case this.callActions.REJECT:
                    this.handleCallRejected(callId, callData);
                    break;
                case this.callActions.END:
                    this.handleCallEnded(callId, callData);
                    break;
            }
            
        } catch (error) {
            this.socket.options.logger.error('Error handling call:', error);
        }
    }
    
    handleIncomingCall(callId, from, type, callData) {
        try {
            const timestamp = Date.now();
            
            const call = {
                id: callId,
                from: from,
                to: this.socket.user?.id,
                type: type,
                state: this.callStates.RINGING,
                timestamp: timestamp,
                duration: 0,
                isGroup: from.includes('@g.us'),
                participants: from.includes('@g.us') ? [] : [from, this.socket.user?.id],
                isIncoming: true,
                ...callData
            };
            
            // Check auto-reject settings
            if (this.shouldAutoReject(from, type)) {
                setTimeout(() => {
                    this.rejectCall(callId, 'auto_reject');
                }, 1000);
                return;
            }
            
            // Store active call
            this.activeCalls.set(callId, call);
            
            // Emit incoming call event
            this.socket.emit('call', {
                id: callId,
                from: call.from,
                to: call.to,
                type: call.type,
                state: call.state,
                timestamp: call.timestamp,
                isGroup: call.isGroup,
                participants: call.participants,
                isIncoming: true
            });
            
            // Set auto-timeout
            setTimeout(() => {
                if (this.activeCalls.has(callId)) {
                    const activeCall = this.activeCalls.get(callId);
                    if (activeCall.state === this.callStates.RINGING) {
                        this.handleCallEnded(callId, { reason: 'timeout' });
                    }
                }
            }, 60000); // 60 seconds
            
        } catch (error) {
            this.socket.options.logger.error('Error handling incoming call:', error);
        }
    }
    
    handleCallAccepted(callId, callData) {
        try {
            if (!this.activeCalls.has(callId)) return;
            
            const call = this.activeCalls.get(callId);
            call.state = this.callStates.ACCEPTED;
            call.acceptedAt = Date.now();
            
            // Emit call update
            this.socket.emit('call', {
                id: callId,
                from: call.from,
                to: call.to,
                type: call.type,
                state: call.state,
                timestamp: call.timestamp,
                acceptedAt: call.acceptedAt,
                isGroup: call.isGroup,
                participants: call.participants
            });
            
        } catch (error) {
            this.socket.options.logger.error('Error handling call accepted:', error);
        }
    }
    
    handleCallRejected(callId, callData) {
        try {
            if (!this.activeCalls.has(callId)) return;
            
            const call = this.activeCalls.get(callId);
            call.state = this.callStates.REJECTED;
            call.endedAt = Date.now();
            call.duration = call.acceptedAt ? call.endedAt - call.acceptedAt : 0;
            call.rejectReason = callData.reason;
            
            // Move to history
            this.callHistory.set(callId, call);
            this.activeCalls.delete(callId);
            
            // Emit call update
            this.socket.emit('call', {
                id: callId,
                from: call.from,
                to: call.to,
                type: call.type,
                state: call.state,
                timestamp: call.timestamp,
                endedAt: call.endedAt,
                duration: call.duration,
                rejectReason: call.rejectReason,
                isGroup: call.isGroup,
                participants: call.participants
            });
            
        } catch (error) {
            this.socket.options.logger.error('Error handling call rejected:', error);
        }
    }
    
    handleCallEnded(callId, callData) {
        try {
            if (!this.activeCalls.has(callId)) return;
            
            const call = this.activeCalls.get(callId);
            call.state = callData.reason === 'timeout' ? this.callStates.TIMEOUT : this.callStates.ENDED;
            call.endedAt = Date.now();
            call.duration = call.acceptedAt ? call.endedAt - call.acceptedAt : 0;
            call.endReason = callData.reason;
            
            // Move to history
            this.callHistory.set(callId, call);
            this.activeCalls.delete(callId);
            
            // Emit call update
            this.socket.emit('call', {
                id: callId,
                from: call.from,
                to: call.to,
                type: call.type,
                state: call.state,
                timestamp: call.timestamp,
                endedAt: call.endedAt,
                duration: call.duration,
                endReason: call.endReason,
                isGroup: call.isGroup,
                participants: call.participants
            });
            
        } catch (error) {
            this.socket.options.logger.error('Error handling call ended:', error);
        }
    }
    
    shouldAutoReject(from, type) {
        if (this.callSettings.autoReject) {
            return true;
        }
        
        if (this.callSettings.rejectUnknown) {
            // Check if contact is in contacts list
            const contact = this.socket.contacts.get(from);
            if (!contact) {
                return true;
            }
        }
        
        return false;
    }
    
    getActiveCall(callId) {
        return this.activeCalls.get(callId);
    }
    
    getActiveCalls() {
        return Array.from(this.activeCalls.values());
    }
    
    getCallHistory(limit = 50) {
        const history = Array.from(this.callHistory.values())
            .sort((a, b) => b.timestamp - a.timestamp);
        
        return history.slice(0, limit);
    }
    
    getCallHistoryForContact(jid, limit = 20) {
        const history = Array.from(this.callHistory.values())
            .filter(call => call.from === jid || call.to === jid)
            .sort((a, b) => b.timestamp - a.timestamp);
        
        return history.slice(0, limit);
    }
    
    updateCallSettings(settings) {
        this.callSettings = {
            ...this.callSettings,
            ...settings
        };
    }
    
    getCallSettings() {
        return { ...this.callSettings };
    }
    
    generateCallId() {
        return crypto.randomBytes(16).toString('hex').toUpperCase();
    }
    
    formatCallDuration(duration) {
        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
        }
    }
    
    getCallStats() {
        const stats = {
            activeCalls: this.activeCalls.size,
            totalCallsInHistory: this.callHistory.size,
            voiceCalls: 0,
            videoCalls: 0,
            incomingCalls: 0,
            outgoingCalls: 0,
            acceptedCalls: 0,
            rejectedCalls: 0,
            missedCalls: 0,
            totalCallDuration: 0
        };
        
        for (const call of this.callHistory.values()) {
            if (call.type === this.callTypes.VOICE) stats.voiceCalls++;
            if (call.type === this.callTypes.VIDEO) stats.videoCalls++;
            if (call.isIncoming) stats.incomingCalls++;
            else stats.outgoingCalls++;
            
            if (call.state === this.callStates.ACCEPTED) stats.acceptedCalls++;
            if (call.state === this.callStates.REJECTED) stats.rejectedCalls++;
            if (call.state === this.callStates.TIMEOUT) stats.missedCalls++;
            
            stats.totalCallDuration += call.duration;
        }
        
        return stats;
    }
    
    clearCallHistory() {
        this.callHistory.clear();
    }
    
    removeCallFromHistory(callId) {
        return this.callHistory.delete(callId);
    }
    
    isCallActive(callId) {
        return this.activeCalls.has(callId);
    }
    
    hasActiveCalls() {
        return this.activeCalls.size > 0;
    }
}

module.exports = WACallHandler;