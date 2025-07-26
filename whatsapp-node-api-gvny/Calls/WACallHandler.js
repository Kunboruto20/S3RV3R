const EventEmitter = require('events');

/**
 * WhatsApp Call Handler
 * Handles call events and call-related operations
 */
class WACallHandler extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableCallHandling: options.enableCallHandling !== false,
            autoReject: options.autoReject || false,
            callTimeout: options.callTimeout || 60000,
            ...options
        };

        this.activeCalls = new Map();
        this.callQueue = [];
        
        this.initialize();
    }

    initialize() {
        this.setupEventHandlers();
        this.emit('ready');
    }

    setupEventHandlers() {
        this.socket.on('call', (calls) => {
            calls.forEach(call => this.handleCall(call));
        });
    }

    async handleCall(call) {
        try {
            switch (call.status) {
                case 'offer':
                    await this.handleIncomingCall(call);
                    break;
                case 'accept':
                    await this.handleCallAccept(call);
                    break;
                case 'reject':
                    await this.handleCallReject(call);
                    break;
                case 'timeout':
                    await this.handleCallTimeout(call);
                    break;
                default:
                    await this.handleCallEnd(call);
            }
        } catch (error) {
            this.emit('call:error', { call, error });
        }
    }

    async handleIncomingCall(call) {
        this.activeCalls.set(call.id, {
            ...call,
            startTime: Date.now(),
            status: 'incoming'
        });

        this.emit('call:incoming', call);

        if (this.options.autoReject) {
            await this.rejectCall(call.id, 'auto_reject');
        }
    }

    async handleCallAccept(call) {
        const activeCall = this.activeCalls.get(call.id);
        if (activeCall) {
            activeCall.status = 'accepted';
            activeCall.acceptTime = Date.now();
            this.emit('call:accepted', call);
        }
    }

    async handleCallReject(call) {
        const activeCall = this.activeCalls.get(call.id);
        if (activeCall) {
            activeCall.status = 'rejected';
            activeCall.endTime = Date.now();
            this.activeCalls.delete(call.id);
            this.emit('call:rejected', call);
        }
    }

    async handleCallTimeout(call) {
        const activeCall = this.activeCalls.get(call.id);
        if (activeCall) {
            activeCall.status = 'timeout';
            activeCall.endTime = Date.now();
            this.activeCalls.delete(call.id);
            this.emit('call:timeout', call);
        }
    }

    async handleCallEnd(call) {
        const activeCall = this.activeCalls.get(call.id);
        if (activeCall) {
            activeCall.status = 'ended';
            activeCall.endTime = Date.now();
            this.activeCalls.delete(call.id);
            this.emit('call:ended', call);
        }
    }

    async acceptCall(callId) {
        try {
            const query = {
                tag: 'call',
                attrs: {
                    id: callId,
                    action: 'accept'
                }
            };

            await this.socket.sendNode(query);
            this.emit('call:accept_sent', { callId });
            return true;
        } catch (error) {
            this.emit('call:error', { callId, error });
            throw error;
        }
    }

    async rejectCall(callId, reason = 'declined') {
        try {
            const query = {
                tag: 'call',
                attrs: {
                    id: callId,
                    action: 'reject',
                    reason: reason
                }
            };

            await this.socket.sendNode(query);
            this.emit('call:reject_sent', { callId, reason });
            return true;
        } catch (error) {
            this.emit('call:error', { callId, error });
            throw error;
        }
    }

    getActiveCalls() {
        return Array.from(this.activeCalls.values());
    }

    getCallById(callId) {
        return this.activeCalls.get(callId);
    }
}

module.exports = WACallHandler;