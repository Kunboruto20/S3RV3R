const EventEmitter = require('events');

/**
 * WhatsApp Event Manager
 * Handles all WhatsApp events including messages, presence, calls, and system events
 */
class WAEventManager extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableEventLogging: options.enableEventLogging !== false,
            maxEventHistory: options.maxEventHistory || 1000,
            eventRetention: options.eventRetention || 86400000, // 24 hours
            enableEventFiltering: options.enableEventFiltering !== false,
            eventFilters: options.eventFilters || [],
            enableEventMetrics: options.enableEventMetrics !== false,
            ...options
        };

        // Event stores
        this.eventHistory = [];
        this.eventMetrics = new Map();
        this.eventHandlers = new Map();
        this.eventFilters = new Set(this.options.eventFilters);
        this.eventSubscriptions = new Map();
        
        // Event types
        this.eventTypes = {
            // Connection events
            CONNECTION_UPDATE: 'connection.update',
            CONNECTION_OPEN: 'connection.open',
            CONNECTION_CLOSE: 'connection.close',
            CONNECTION_RECONNECT: 'connection.reconnect',
            
            // Authentication events
            AUTH_STATE_CHANGE: 'auth.state.change',
            QR_CODE: 'qr.code',
            PAIRING_CODE: 'pairing.code',
            AUTH_SUCCESS: 'auth.success',
            AUTH_FAILURE: 'auth.failure',
            
            // Message events
            MESSAGE_RECEIVED: 'message.received',
            MESSAGE_SENT: 'message.sent',
            MESSAGE_UPDATE: 'message.update',
            MESSAGE_DELETE: 'message.delete',
            MESSAGE_REACTION: 'message.reaction',
            MESSAGE_READ: 'message.read',
            MESSAGE_DELIVERED: 'message.delivered',
            
            // Chat events
            CHAT_UPDATE: 'chat.update',
            CHAT_DELETE: 'chat.delete',
            CHAT_ARCHIVE: 'chat.archive',
            CHAT_UNARCHIVE: 'chat.unarchive',
            CHAT_PIN: 'chat.pin',
            CHAT_UNPIN: 'chat.unpin',
            
            // Contact events
            CONTACT_UPDATE: 'contact.update',
            CONTACT_ADD: 'contact.add',
            CONTACT_REMOVE: 'contact.remove',
            CONTACT_BLOCK: 'contact.block',
            CONTACT_UNBLOCK: 'contact.unblock',
            
            // Presence events
            PRESENCE_UPDATE: 'presence.update',
            TYPING_START: 'typing.start',
            TYPING_STOP: 'typing.stop',
            RECORDING_START: 'recording.start',
            RECORDING_STOP: 'recording.stop',
            
            // Group events
            GROUP_CREATE: 'group.create',
            GROUP_UPDATE: 'group.update',
            GROUP_DELETE: 'group.delete',
            GROUP_PARTICIPANT_ADD: 'group.participant.add',
            GROUP_PARTICIPANT_REMOVE: 'group.participant.remove',
            GROUP_PARTICIPANT_PROMOTE: 'group.participant.promote',
            GROUP_PARTICIPANT_DEMOTE: 'group.participant.demote',
            GROUP_SETTINGS_UPDATE: 'group.settings.update',
            
            // Call events
            CALL_INCOMING: 'call.incoming',
            CALL_OUTGOING: 'call.outgoing',
            CALL_ACCEPT: 'call.accept',
            CALL_REJECT: 'call.reject',
            CALL_END: 'call.end',
            CALL_MISSED: 'call.missed',
            
            // Status/Story events
            STATUS_UPDATE: 'status.update',
            STATUS_VIEW: 'status.view',
            STATUS_DELETE: 'status.delete',
            
            // Business events
            BUSINESS_PROFILE_UPDATE: 'business.profile.update',
            CATALOG_UPDATE: 'catalog.update',
            PRODUCT_UPDATE: 'product.update',
            ORDER_CREATE: 'order.create',
            ORDER_UPDATE: 'order.update',
            
            // Payment events
            PAYMENT_REQUEST: 'payment.request',
            PAYMENT_SENT: 'payment.sent',
            PAYMENT_RECEIVED: 'payment.received',
            PAYMENT_UPDATE: 'payment.update',
            
            // System events
            SYSTEM_UPDATE: 'system.update',
            ERROR: 'error',
            WARNING: 'warning',
            INFO: 'info'
        };

        this.initialize();
    }

    initialize() {
        this.setupSocketEventHandlers();
        this.startEventCleanup();
        this.emit('ready');
    }

    // Setup event handlers for socket events
    setupSocketEventHandlers() {
        // Connection events
        this.socket.on('connection.update', (update) => {
            this.handleEvent(this.eventTypes.CONNECTION_UPDATE, update);
        });

        this.socket.on('open', (data) => {
            this.handleEvent(this.eventTypes.CONNECTION_OPEN, data);
        });

        this.socket.on('close', (data) => {
            this.handleEvent(this.eventTypes.CONNECTION_CLOSE, data);
        });

        // Authentication events
        this.socket.on('creds.update', (creds) => {
            this.handleEvent(this.eventTypes.AUTH_STATE_CHANGE, creds);
        });

        this.socket.on('qr', (qr) => {
            this.handleEvent(this.eventTypes.QR_CODE, { qr });
        });

        // Message events
        this.socket.on('messages.upsert', (messageUpdate) => {
            messageUpdate.messages.forEach(message => {
                if (message.key.fromMe) {
                    this.handleEvent(this.eventTypes.MESSAGE_SENT, message);
                } else {
                    this.handleEvent(this.eventTypes.MESSAGE_RECEIVED, message);
                }
            });
        });

        this.socket.on('messages.update', (updates) => {
            updates.forEach(update => {
                this.handleEvent(this.eventTypes.MESSAGE_UPDATE, update);
            });
        });

        this.socket.on('message-receipt.update', (receipts) => {
            receipts.forEach(receipt => {
                if (receipt.receipt.readTimestamp) {
                    this.handleEvent(this.eventTypes.MESSAGE_READ, receipt);
                } else if (receipt.receipt.deliveredTimestamp) {
                    this.handleEvent(this.eventTypes.MESSAGE_DELIVERED, receipt);
                }
            });
        });

        // Presence events
        this.socket.on('presence.update', (presence) => {
            this.handleEvent(this.eventTypes.PRESENCE_UPDATE, presence);
        });

        // Chat events
        this.socket.on('chats.update', (chats) => {
            chats.forEach(chat => {
                this.handleEvent(this.eventTypes.CHAT_UPDATE, chat);
            });
        });

        // Contact events
        this.socket.on('contacts.update', (contacts) => {
            contacts.forEach(contact => {
                this.handleEvent(this.eventTypes.CONTACT_UPDATE, contact);
            });
        });

        // Group events
        this.socket.on('groups.update', (groups) => {
            groups.forEach(group => {
                this.handleEvent(this.eventTypes.GROUP_UPDATE, group);
            });
        });

        // Call events
        this.socket.on('call', (calls) => {
            calls.forEach(call => {
                switch (call.status) {
                    case 'offer':
                        this.handleEvent(this.eventTypes.CALL_INCOMING, call);
                        break;
                    case 'accept':
                        this.handleEvent(this.eventTypes.CALL_ACCEPT, call);
                        break;
                    case 'reject':
                        this.handleEvent(this.eventTypes.CALL_REJECT, call);
                        break;
                    case 'timeout':
                        this.handleEvent(this.eventTypes.CALL_MISSED, call);
                        break;
                    default:
                        this.handleEvent(this.eventTypes.CALL_END, call);
                }
            });
        });
    }

    // Handle individual events
    handleEvent(eventType, data) {
        try {
            // Apply filters
            if (this.shouldFilterEvent(eventType, data)) {
                return;
            }

            // Create event object
            const event = {
                id: this.generateEventId(),
                type: eventType,
                data: data,
                timestamp: new Date().toISOString(),
                source: 'whatsapp'
            };

            // Log event if enabled
            if (this.options.enableEventLogging) {
                this.logEvent(event);
            }

            // Update metrics if enabled
            if (this.options.enableEventMetrics) {
                this.updateEventMetrics(eventType);
            }

            // Store in history
            this.addToHistory(event);

            // Execute custom handlers
            this.executeEventHandlers(eventType, event);

            // Emit the event
            this.emit(eventType, event);
            this.emit('event', event);

        } catch (error) {
            this.emit('error', {
                message: 'Event handling failed',
                eventType,
                error: error.message
            });
        }
    }

    // Event filtering
    shouldFilterEvent(eventType, data) {
        if (!this.options.enableEventFiltering) {
            return false;
        }

        // Check if event type is in filter list
        if (this.eventFilters.has(eventType)) {
            return true;
        }

        // Custom filter logic can be added here
        return false;
    }

    // Event logging
    logEvent(event) {
        const logEntry = {
            timestamp: event.timestamp,
            type: event.type,
            id: event.id,
            dataSize: JSON.stringify(event.data).length
        };

        console.log(`[WAEvent] ${logEntry.timestamp} - ${logEntry.type} (${logEntry.id})`);
    }

    // Event metrics
    updateEventMetrics(eventType) {
        if (!this.eventMetrics.has(eventType)) {
            this.eventMetrics.set(eventType, {
                count: 0,
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString()
            });
        }

        const metrics = this.eventMetrics.get(eventType);
        metrics.count++;
        metrics.lastSeen = new Date().toISOString();
    }

    // Event history management
    addToHistory(event) {
        this.eventHistory.push(event);

        // Maintain max history size
        if (this.eventHistory.length > this.options.maxEventHistory) {
            this.eventHistory.shift();
        }
    }

    // Custom event handlers
    addEventHandler(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    removeEventHandler(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    executeEventHandlers(eventType, event) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            handlers.forEach(handler => {
                try {
                    handler(event);
                } catch (error) {
                    this.emit('error', {
                        message: 'Event handler execution failed',
                        eventType,
                        error: error.message
                    });
                }
            });
        }
    }

    // Event subscriptions
    subscribe(eventType, callback, options = {}) {
        const subscriptionId = this.generateSubscriptionId();
        const subscription = {
            id: subscriptionId,
            eventType: eventType,
            callback: callback,
            options: options,
            createdAt: new Date().toISOString(),
            active: true
        };

        this.eventSubscriptions.set(subscriptionId, subscription);
        this.on(eventType, callback);

        return subscriptionId;
    }

    unsubscribe(subscriptionId) {
        const subscription = this.eventSubscriptions.get(subscriptionId);
        if (subscription) {
            subscription.active = false;
            this.removeListener(subscription.eventType, subscription.callback);
            this.eventSubscriptions.delete(subscriptionId);
            return true;
        }
        return false;
    }

    // Event filtering management
    addEventFilter(eventType) {
        this.eventFilters.add(eventType);
    }

    removeEventFilter(eventType) {
        this.eventFilters.delete(eventType);
    }

    clearEventFilters() {
        this.eventFilters.clear();
    }

    // Event history queries
    getEventHistory(options = {}) {
        let events = [...this.eventHistory];

        // Filter by event type
        if (options.eventType) {
            events = events.filter(event => event.type === options.eventType);
        }

        // Filter by time range
        if (options.startTime) {
            const startTime = new Date(options.startTime);
            events = events.filter(event => new Date(event.timestamp) >= startTime);
        }

        if (options.endTime) {
            const endTime = new Date(options.endTime);
            events = events.filter(event => new Date(event.timestamp) <= endTime);
        }

        // Limit results
        if (options.limit) {
            events = events.slice(-options.limit);
        }

        return events;
    }

    getRecentEvents(count = 10) {
        return this.eventHistory.slice(-count);
    }

    getEventsByType(eventType) {
        return this.eventHistory.filter(event => event.type === eventType);
    }

    // Event metrics
    getEventMetrics(eventType = null) {
        if (eventType) {
            return this.eventMetrics.get(eventType) || null;
        }
        return Object.fromEntries(this.eventMetrics);
    }

    getTotalEventCount() {
        return Array.from(this.eventMetrics.values())
            .reduce((total, metrics) => total + metrics.count, 0);
    }

    getMostFrequentEvents(limit = 10) {
        return Array.from(this.eventMetrics.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit)
            .map(([type, metrics]) => ({ type, count: metrics.count }));
    }

    // Event cleanup
    startEventCleanup() {
        setInterval(() => {
            this.cleanupOldEvents();
        }, 300000); // Clean every 5 minutes
    }

    cleanupOldEvents() {
        const cutoffTime = Date.now() - this.options.eventRetention;
        const cutoffDate = new Date(cutoffTime);

        this.eventHistory = this.eventHistory.filter(event => 
            new Date(event.timestamp) > cutoffDate
        );
    }

    // Event export/import
    exportEvents(options = {}) {
        const events = this.getEventHistory(options);
        return {
            events: events,
            metadata: {
                exportTime: new Date().toISOString(),
                totalEvents: events.length,
                eventTypes: [...new Set(events.map(e => e.type))],
                timeRange: {
                    start: events.length > 0 ? events[0].timestamp : null,
                    end: events.length > 0 ? events[events.length - 1].timestamp : null
                }
            }
        };
    }

    importEvents(exportData) {
        if (!exportData.events || !Array.isArray(exportData.events)) {
            throw new Error('Invalid export data format');
        }

        let importedCount = 0;
        exportData.events.forEach(event => {
            if (this.validateEventFormat(event)) {
                this.addToHistory(event);
                importedCount++;
            }
        });

        return {
            imported: importedCount,
            total: exportData.events.length
        };
    }

    validateEventFormat(event) {
        return event && 
               typeof event.id === 'string' &&
               typeof event.type === 'string' &&
               typeof event.timestamp === 'string' &&
               event.data !== undefined;
    }

    // Utility methods
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateSubscriptionId() {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Event statistics
    getEventStatistics() {
        const totalEvents = this.getTotalEventCount();
        const eventTypes = this.eventMetrics.size;
        const averageEventsPerType = eventTypes > 0 ? totalEvents / eventTypes : 0;

        return {
            totalEvents: totalEvents,
            eventTypes: eventTypes,
            averageEventsPerType: Math.round(averageEventsPerType * 100) / 100,
            historySize: this.eventHistory.length,
            activeSubscriptions: Array.from(this.eventSubscriptions.values())
                .filter(sub => sub.active).length,
            activeFilters: this.eventFilters.size,
            customHandlers: Array.from(this.eventHandlers.values())
                .reduce((total, handlers) => total + handlers.length, 0)
        };
    }

    // Event type utilities
    getAvailableEventTypes() {
        return Object.values(this.eventTypes);
    }

    isValidEventType(eventType) {
        return Object.values(this.eventTypes).includes(eventType);
    }

    // Real-time event monitoring
    startEventMonitoring(callback, options = {}) {
        const monitorId = this.generateSubscriptionId();
        
        const monitor = {
            id: monitorId,
            callback: callback,
            options: options,
            startTime: new Date().toISOString(),
            eventCount: 0
        };

        const eventHandler = (event) => {
            monitor.eventCount++;
            
            // Apply monitoring filters
            if (options.eventTypes && !options.eventTypes.includes(event.type)) {
                return;
            }

            try {
                callback(event, monitor);
            } catch (error) {
                this.emit('error', {
                    message: 'Event monitor callback failed',
                    monitorId: monitorId,
                    error: error.message
                });
            }
        };

        this.on('event', eventHandler);
        
        // Store monitor for cleanup
        this.eventSubscriptions.set(monitorId, {
            ...monitor,
            eventHandler: eventHandler,
            type: 'monitor'
        });

        return monitorId;
    }

    stopEventMonitoring(monitorId) {
        const monitor = this.eventSubscriptions.get(monitorId);
        if (monitor && monitor.type === 'monitor') {
            this.removeListener('event', monitor.eventHandler);
            this.eventSubscriptions.delete(monitorId);
            return true;
        }
        return false;
    }

    // Event debugging
    debugEvent(eventId) {
        const event = this.eventHistory.find(e => e.id === eventId);
        if (!event) {
            return null;
        }

        return {
            event: event,
            handlers: this.eventHandlers.get(event.type) || [],
            subscriptions: Array.from(this.eventSubscriptions.values())
                .filter(sub => sub.eventType === event.type),
            metrics: this.eventMetrics.get(event.type)
        };
    }

    // Cleanup
    cleanup() {
        this.eventHistory = [];
        this.eventMetrics.clear();
        this.eventHandlers.clear();
        this.eventSubscriptions.clear();
        this.removeAllListeners();
    }
}

module.exports = WAEventManager;