const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * WhatsApp Device Manager
 * Handles device information, registration, and management
 */
class WADevice extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableDeviceSync: options.enableDeviceSync !== false,
            maxDevices: options.maxDevices || 10,
            deviceTimeout: options.deviceTimeout || 300000, // 5 minutes
            ...options
        };

        // Device data
        this.deviceInfo = {
            id: null,
            platform: 'web',
            version: '2.2412.54',
            manufacturer: 'WhatsApp',
            model: 'WhatsApp Web',
            osVersion: process.platform,
            battery: null,
            plugged: null,
            pushName: null
        };

        this.linkedDevices = new Map();
        this.deviceSessions = new Map();

        this.initialize();
    }

    async initialize() {
        try {
            this.generateDeviceId();
            this.setupSocketEventHandlers();
            this.emit('device:ready');
        } catch (error) {
            this.emit('device:error', error);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        this.socket.on('device.update', (update) => {
            this.handleDeviceUpdate(update);
        });

        this.socket.on('device.sync', (devices) => {
            this.handleDeviceSync(devices);
        });
    }

    // Device Registration
    generateDeviceId() {
        if (!this.deviceInfo.id) {
            this.deviceInfo.id = crypto.randomBytes(16).toString('hex');
        }
        return this.deviceInfo.id;
    }

    async registerDevice(deviceData = {}) {
        try {
            const device = {
                ...this.deviceInfo,
                ...deviceData,
                registered: new Date().toISOString(),
                lastActive: new Date().toISOString()
            };

            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:sync:app:state'
                },
                content: [{
                    tag: 'device',
                    attrs: { action: 'register' },
                    content: this.serializeDevice(device)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.deviceInfo = device;
                this.emit('device:registered', device);
                return device;
            } else {
                throw new Error('Failed to register device');
            }
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    async updateDevice(updates) {
        try {
            const updatedDevice = {
                ...this.deviceInfo,
                ...updates,
                lastActive: new Date().toISOString()
            };

            this.deviceInfo = updatedDevice;
            this.emit('device:updated', updatedDevice);
            return updatedDevice;
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    // Multi-Device Management
    async linkDevice(deviceCode) {
        try {
            if (this.linkedDevices.size >= this.options.maxDevices) {
                throw new Error('Maximum linked devices limit reached');
            }

            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:sync:md'
                },
                content: [{
                    tag: 'link',
                    attrs: { code: deviceCode },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                const linkedDevice = {
                    id: result.content?.[0]?.attrs?.id,
                    platform: result.content?.[0]?.attrs?.platform,
                    name: result.content?.[0]?.attrs?.name,
                    linked: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                    active: true
                };

                this.linkedDevices.set(linkedDevice.id, linkedDevice);
                this.emit('device:linked', linkedDevice);
                return linkedDevice;
            } else {
                throw new Error('Failed to link device');
            }
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    async unlinkDevice(deviceId) {
        try {
            const device = this.linkedDevices.get(deviceId);
            if (!device) {
                throw new Error(`Device ${deviceId} not found`);
            }

            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:sync:md'
                },
                content: [{
                    tag: 'unlink',
                    attrs: { id: deviceId },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.linkedDevices.delete(deviceId);
                this.deviceSessions.delete(deviceId);
                
                this.emit('device:unlinked', { deviceId, device });
                return { success: true, message: 'Device unlinked successfully' };
            } else {
                throw new Error('Failed to unlink device');
            }
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    // Device Sessions
    async createDeviceSession(deviceId, sessionData) {
        try {
            const device = this.linkedDevices.get(deviceId);
            if (!device) {
                throw new Error(`Device ${deviceId} not found`);
            }

            const session = {
                id: this.generateSessionId(),
                deviceId: deviceId,
                created: new Date().toISOString(),
                lastActive: new Date().toISOString(),
                data: sessionData || {},
                active: true
            };

            this.deviceSessions.set(session.id, session);
            this.emit('device:session:created', session);
            return session;
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    async endDeviceSession(sessionId) {
        try {
            const session = this.deviceSessions.get(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }

            session.active = false;
            session.ended = new Date().toISOString();
            
            this.deviceSessions.set(sessionId, session);
            this.emit('device:session:ended', session);
            return session;
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    // Device Synchronization
    async syncDevices() {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:sync:md'
                },
                content: [{
                    tag: 'devices',
                    attrs: {},
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                const devices = this.parseDevicesFromResult(result);
                
                devices.forEach(device => {
                    this.linkedDevices.set(device.id, device);
                });

                this.emit('devices:synced', devices);
                return devices;
            } else {
                throw new Error('Failed to sync devices');
            }
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    // Device Status and Monitoring
    async updateDeviceStatus(status) {
        try {
            const statusUpdate = {
                status: status,
                timestamp: new Date().toISOString(),
                battery: this.deviceInfo.battery,
                plugged: this.deviceInfo.plugged
            };

            this.deviceInfo.lastActive = statusUpdate.timestamp;
            
            const query = {
                tag: 'presence',
                attrs: {
                    type: status === 'online' ? 'available' : 'unavailable'
                },
                content: null
            };

            await this.socket.sendNode(query);
            this.emit('device:status:updated', statusUpdate);
            return statusUpdate;
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    async updateBatteryStatus(batteryLevel, isPlugged) {
        try {
            this.deviceInfo.battery = batteryLevel;
            this.deviceInfo.plugged = isPlugged;
            this.deviceInfo.lastActive = new Date().toISOString();

            const batteryUpdate = {
                level: batteryLevel,
                plugged: isPlugged,
                timestamp: new Date().toISOString()
            };

            this.emit('device:battery:updated', batteryUpdate);
            return batteryUpdate;
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    // Device Security
    async generateDeviceFingerprint() {
        try {
            const deviceData = {
                id: this.deviceInfo.id,
                platform: this.deviceInfo.platform,
                version: this.deviceInfo.version,
                manufacturer: this.deviceInfo.manufacturer,
                model: this.deviceInfo.model
            };

            const fingerprint = crypto
                .createHash('sha256')
                .update(JSON.stringify(deviceData))
                .digest('hex');

            this.deviceInfo.fingerprint = fingerprint;
            return fingerprint;
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    async verifyDeviceFingerprint(fingerprint) {
        try {
            const currentFingerprint = await this.generateDeviceFingerprint();
            return currentFingerprint === fingerprint;
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    // Helper methods
    serializeDevice(device) {
        return [
            { tag: 'id', attrs: {}, content: device.id },
            { tag: 'platform', attrs: {}, content: device.platform },
            { tag: 'version', attrs: {}, content: device.version },
            { tag: 'manufacturer', attrs: {}, content: device.manufacturer },
            { tag: 'model', attrs: {}, content: device.model },
            { tag: 'os_version', attrs: {}, content: device.osVersion },
            { tag: 'push_name', attrs: {}, content: device.pushName || '' }
        ];
    }

    parseDevicesFromResult(result) {
        const devices = [];
        const deviceNodes = result.content?.filter(c => c.tag === 'device') || [];
        
        deviceNodes.forEach(node => {
            const device = {
                id: node.attrs?.id,
                platform: node.attrs?.platform,
                name: node.attrs?.name,
                version: node.attrs?.version,
                lastSeen: node.attrs?.last_seen ? 
                    new Date(parseInt(node.attrs.last_seen) * 1000).toISOString() : null,
                active: node.attrs?.active === 'true'
            };
            
            if (device.id) {
                devices.push(device);
            }
        });

        return devices;
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Event handlers
    handleDeviceUpdate(update) {
        try {
            if (update.deviceId && this.linkedDevices.has(update.deviceId)) {
                const device = this.linkedDevices.get(update.deviceId);
                const updatedDevice = { ...device, ...update, lastSeen: new Date().toISOString() };
                this.linkedDevices.set(update.deviceId, updatedDevice);
                
                this.emit('device:server:update', updatedDevice);
            }
        } catch (error) {
            this.emit('device:error', error);
        }
    }

    handleDeviceSync(devices) {
        try {
            devices.forEach(device => {
                this.linkedDevices.set(device.id, device);
            });

            this.emit('devices:server:sync', devices);
        } catch (error) {
            this.emit('device:error', error);
        }
    }

    // Device Management
    async getDeviceInfo() {
        return { ...this.deviceInfo };
    }

    async getLinkedDevices() {
        return Array.from(this.linkedDevices.values());
    }

    async getActiveDevices() {
        return Array.from(this.linkedDevices.values()).filter(device => device.active);
    }

    async getDeviceSessions(deviceId) {
        return Array.from(this.deviceSessions.values()).filter(session => 
            session.deviceId === deviceId
        );
    }

    async getActiveSessions() {
        return Array.from(this.deviceSessions.values()).filter(session => session.active);
    }

    // Device Statistics
    getDeviceStatistics() {
        const activeSessions = this.getActiveSessions();
        const activeDevices = Array.from(this.linkedDevices.values()).filter(d => d.active);

        return {
            totalLinkedDevices: this.linkedDevices.size,
            activeDevices: activeDevices.length,
            totalSessions: this.deviceSessions.size,
            activeSessions: activeSessions.length,
            devicePlatforms: this.getDevicePlatformStats(),
            lastSync: this.getLastSyncTime()
        };
    }

    getDevicePlatformStats() {
        const platforms = {};
        
        for (const device of this.linkedDevices.values()) {
            platforms[device.platform] = (platforms[device.platform] || 0) + 1;
        }

        return platforms;
    }

    getLastSyncTime() {
        let lastSync = null;
        
        for (const device of this.linkedDevices.values()) {
            if (device.lastSeen && (!lastSync || new Date(device.lastSeen) > new Date(lastSync))) {
                lastSync = device.lastSeen;
            }
        }

        return lastSync;
    }

    // Device Cleanup
    async cleanupInactiveDevices() {
        try {
            const now = Date.now();
            const inactiveDevices = [];

            for (const [deviceId, device] of this.linkedDevices.entries()) {
                const lastSeen = new Date(device.lastSeen || device.linked).getTime();
                if (now - lastSeen > this.options.deviceTimeout) {
                    inactiveDevices.push(deviceId);
                }
            }

            for (const deviceId of inactiveDevices) {
                const device = this.linkedDevices.get(deviceId);
                device.active = false;
                this.linkedDevices.set(deviceId, device);
                
                this.emit('device:inactive', { deviceId, device });
            }

            return inactiveDevices.length;
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }

    async cleanupInactiveSessions() {
        try {
            const now = Date.now();
            const inactiveSessions = [];

            for (const [sessionId, session] of this.deviceSessions.entries()) {
                const lastActive = new Date(session.lastActive).getTime();
                if (now - lastActive > this.options.deviceTimeout) {
                    inactiveSessions.push(sessionId);
                }
            }

            for (const sessionId of inactiveSessions) {
                await this.endDeviceSession(sessionId);
            }

            return inactiveSessions.length;
        } catch (error) {
            this.emit('device:error', error);
            throw error;
        }
    }
}

module.exports = WADevice;