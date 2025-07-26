const EventEmitter = require('events');

/**
 * WhatsApp Notification Manager
 * Handles all notification operations including push notifications, alerts, and system notifications
 */
class WANotificationManager extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableNotifications: options.enableNotifications !== false,
            enablePushNotifications: options.enablePushNotifications !== false,
            enableSoundNotifications: options.enableSoundNotifications !== false,
            enableDesktopNotifications: options.enableDesktopNotifications !== false,
            notificationRetention: options.notificationRetention || 604800000, // 7 days
            maxNotifications: options.maxNotifications || 1000,
            defaultSound: options.defaultSound || 'default',
            enableGrouping: options.enableGrouping !== false,
            enableBadgeCount: options.enableBadgeCount !== false,
            ...options
        };

        // Notification stores
        this.notifications = new Map();
        this.notificationHistory = [];
        this.notificationSettings = new Map();
        this.soundProfiles = new Map();
        this.notificationQueue = [];
        this.badgeCount = 0;
        
        // Notification types
        this.notificationTypes = {
            MESSAGE: 'message',
            CALL: 'call',
            GROUP_INVITE: 'group_invite',
            GROUP_UPDATE: 'group_update',
            CONTACT_UPDATE: 'contact_update',
            PAYMENT: 'payment',
            BUSINESS: 'business',
            SYSTEM: 'system',
            REMINDER: 'reminder',
            CUSTOM: 'custom'
        };

        // Notification priorities
        this.priorities = {
            LOW: 1,
            NORMAL: 2,
            HIGH: 3,
            URGENT: 4
        };

        // Default notification settings
        this.defaultSettings = {
            enabled: true,
            sound: true,
            vibration: true,
            showPreview: true,
            groupMessages: true,
            priority: this.priorities.NORMAL,
            quietHours: {
                enabled: false,
                start: '22:00',
                end: '08:00'
            }
        };

        this.initialize();
    }

    async initialize() {
        try {
            await this.loadNotificationSettings();
            this.setupSocketEventHandlers();
            this.startNotificationProcessor();
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        // Message notifications
        this.socket.on('messages.upsert', (messageUpdate) => {
            messageUpdate.messages.forEach(message => {
                if (!message.key.fromMe) {
                    this.createMessageNotification(message);
                }
            });
        });

        // Call notifications
        this.socket.on('call', (calls) => {
            calls.forEach(call => {
                if (call.status === 'offer' && !call.isGroup) {
                    this.createCallNotification(call);
                }
            });
        });

        // Group notifications
        this.socket.on('groups.update', (groups) => {
            groups.forEach(group => {
                this.createGroupNotification(group);
            });
        });

        // Contact notifications
        this.socket.on('contacts.update', (contacts) => {
            contacts.forEach(contact => {
                this.createContactNotification(contact);
            });
        });
    }

    // Create different types of notifications
    async createMessageNotification(message) {
        try {
            const chatId = message.key.remoteJid;
            const settings = await this.getNotificationSettings(chatId);
            
            if (!settings.enabled || this.isInQuietHours()) {
                return;
            }

            const notification = {
                id: this.generateNotificationId(),
                type: this.notificationTypes.MESSAGE,
                chatId: chatId,
                messageId: message.key.id,
                title: await this.getMessageNotificationTitle(message),
                body: await this.getMessageNotificationBody(message),
                icon: await this.getContactAvatar(message.key.participant || chatId),
                timestamp: new Date().toISOString(),
                priority: settings.priority,
                sound: settings.sound ? this.getNotificationSound(chatId) : null,
                vibration: settings.vibration,
                showPreview: settings.showPreview,
                data: {
                    chatId: chatId,
                    messageKey: message.key,
                    messageType: this.getMessageType(message)
                },
                actions: this.getMessageActions(message)
            };

            await this.processNotification(notification);
        } catch (error) {
            this.emit('error', { message: 'Failed to create message notification', error });
        }
    }

    async createCallNotification(call) {
        try {
            const settings = await this.getNotificationSettings(call.from);
            
            if (!settings.enabled) {
                return;
            }

            const notification = {
                id: this.generateNotificationId(),
                type: this.notificationTypes.CALL,
                chatId: call.from,
                title: 'Incoming Call',
                body: `${await this.getContactName(call.from)} is calling...`,
                icon: await this.getContactAvatar(call.from),
                timestamp: new Date().toISOString(),
                priority: this.priorities.URGENT,
                sound: 'ringtone',
                vibration: true,
                showPreview: true,
                persistent: true,
                data: {
                    callId: call.id,
                    from: call.from,
                    isVideo: call.isVideo
                },
                actions: [
                    { id: 'accept', title: 'Accept', type: 'button' },
                    { id: 'decline', title: 'Decline', type: 'button' }
                ]
            };

            await this.processNotification(notification);
        } catch (error) {
            this.emit('error', { message: 'Failed to create call notification', error });
        }
    }

    async createGroupNotification(group) {
        try {
            const settings = await this.getNotificationSettings(group.id);
            
            if (!settings.enabled || !settings.groupMessages) {
                return;
            }

            let title = 'Group Update';
            let body = `${group.subject} was updated`;

            if (group.participants) {
                if (group.participants.added?.length > 0) {
                    title = 'New Group Member';
                    body = `${group.participants.added.length} member(s) added to ${group.subject}`;
                } else if (group.participants.removed?.length > 0) {
                    title = 'Group Member Left';
                    body = `${group.participants.removed.length} member(s) left ${group.subject}`;
                }
            }

            const notification = {
                id: this.generateNotificationId(),
                type: this.notificationTypes.GROUP_UPDATE,
                chatId: group.id,
                title: title,
                body: body,
                icon: group.icon || '/assets/group-icon.png',
                timestamp: new Date().toISOString(),
                priority: settings.priority,
                sound: settings.sound ? this.getNotificationSound(group.id) : null,
                vibration: settings.vibration,
                showPreview: settings.showPreview,
                data: {
                    groupId: group.id,
                    updateType: 'participants'
                }
            };

            await this.processNotification(notification);
        } catch (error) {
            this.emit('error', { message: 'Failed to create group notification', error });
        }
    }

    async createContactNotification(contact) {
        try {
            const notification = {
                id: this.generateNotificationId(),
                type: this.notificationTypes.CONTACT_UPDATE,
                chatId: contact.id,
                title: 'Contact Updated',
                body: `${contact.name || contact.pushName} updated their profile`,
                icon: contact.profilePictureUrl,
                timestamp: new Date().toISOString(),
                priority: this.priorities.LOW,
                sound: null,
                vibration: false,
                showPreview: true,
                data: {
                    contactId: contact.id,
                    updateType: 'profile'
                }
            };

            await this.processNotification(notification);
        } catch (error) {
            this.emit('error', { message: 'Failed to create contact notification', error });
        }
    }

    // Custom notification creation
    async createCustomNotification(notificationData) {
        try {
            const notification = {
                id: this.generateNotificationId(),
                type: this.notificationTypes.CUSTOM,
                title: notificationData.title,
                body: notificationData.body,
                icon: notificationData.icon,
                timestamp: new Date().toISOString(),
                priority: notificationData.priority || this.priorities.NORMAL,
                sound: notificationData.sound,
                vibration: notificationData.vibration !== false,
                showPreview: notificationData.showPreview !== false,
                persistent: notificationData.persistent || false,
                data: notificationData.data || {},
                actions: notificationData.actions || []
            };

            await this.processNotification(notification);
            return notification;
        } catch (error) {
            throw new Error(`Failed to create custom notification: ${error.message}`);
        }
    }

    // Process notifications
    async processNotification(notification) {
        try {
            // Store notification
            this.notifications.set(notification.id, notification);
            this.notificationHistory.push(notification);
            
            // Maintain history size
            if (this.notificationHistory.length > this.options.maxNotifications) {
                this.notificationHistory.shift();
            }

            // Update badge count
            if (this.options.enableBadgeCount) {
                this.updateBadgeCount();
            }

            // Group similar notifications if enabled
            if (this.options.enableGrouping) {
                notification = await this.groupNotification(notification);
            }

            // Add to processing queue
            this.notificationQueue.push(notification);

            // Emit notification event
            this.emit('notification.created', notification);

        } catch (error) {
            this.emit('error', { message: 'Failed to process notification', error });
        }
    }

    // Notification grouping
    async groupNotification(notification) {
        const groupKey = `${notification.type}_${notification.chatId}`;
        const existingNotifications = this.notificationHistory.filter(n => 
            n.type === notification.type && 
            n.chatId === notification.chatId &&
            (Date.now() - new Date(n.timestamp).getTime()) < 300000 // 5 minutes
        );

        if (existingNotifications.length > 1) {
            // Update existing grouped notification
            notification.title = `${existingNotifications.length + 1} new messages`;
            notification.body = `From ${await this.getContactName(notification.chatId)}`;
            notification.grouped = true;
            notification.groupCount = existingNotifications.length + 1;
        }

        return notification;
    }

    // Notification processor
    startNotificationProcessor() {
        setInterval(async () => {
            if (this.notificationQueue.length > 0) {
                const notification = this.notificationQueue.shift();
                await this.displayNotification(notification);
            }
        }, 100); // Process every 100ms
    }

    // Display notification
    async displayNotification(notification) {
        try {
            // Desktop notification
            if (this.options.enableDesktopNotifications && typeof window !== 'undefined' && window.Notification) {
                await this.showDesktopNotification(notification);
            }

            // Push notification
            if (this.options.enablePushNotifications) {
                await this.sendPushNotification(notification);
            }

            // Sound notification
            if (this.options.enableSoundNotifications && notification.sound) {
                await this.playNotificationSound(notification.sound);
            }

            // Mark as displayed
            notification.displayed = true;
            notification.displayedAt = new Date().toISOString();

            this.emit('notification.displayed', notification);

        } catch (error) {
            this.emit('error', { message: 'Failed to display notification', error });
        }
    }

    // Desktop notifications
    async showDesktopNotification(notification) {
        if (typeof window === 'undefined' || !window.Notification) {
            return;
        }

        if (Notification.permission === 'granted') {
            const desktopNotification = new Notification(notification.title, {
                body: notification.showPreview ? notification.body : 'New message',
                icon: notification.icon,
                tag: notification.id,
                requireInteraction: notification.persistent,
                silent: !notification.sound
            });

            desktopNotification.onclick = () => {
                this.handleNotificationClick(notification);
                desktopNotification.close();
            };

            // Auto close after 5 seconds if not persistent
            if (!notification.persistent) {
                setTimeout(() => {
                    desktopNotification.close();
                }, 5000);
            }
        } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                await this.showDesktopNotification(notification);
            }
        }
    }

    // Push notifications (placeholder for actual push service integration)
    async sendPushNotification(notification) {
        // This would integrate with actual push notification services
        // like Firebase Cloud Messaging, Apple Push Notification Service, etc.
        console.log('Push notification sent:', notification.title);
    }

    // Sound notifications
    async playNotificationSound(soundName) {
        try {
            if (typeof Audio !== 'undefined') {
                const audio = new Audio(`/sounds/${soundName}.mp3`);
                audio.volume = 0.5;
                await audio.play();
            }
        } catch (error) {
            console.warn('Failed to play notification sound:', error);
        }
    }

    // Notification settings
    async getNotificationSettings(chatId) {
        let settings = this.notificationSettings.get(chatId);
        if (!settings) {
            settings = { ...this.defaultSettings };
            this.notificationSettings.set(chatId, settings);
        }
        return settings;
    }

    async updateNotificationSettings(chatId, updates) {
        const currentSettings = await this.getNotificationSettings(chatId);
        const updatedSettings = { ...currentSettings, ...updates };
        this.notificationSettings.set(chatId, updatedSettings);
        
        this.emit('notification.settings.updated', { chatId, settings: updatedSettings });
        return updatedSettings;
    }

    async loadNotificationSettings() {
        // Load settings from storage (placeholder)
        // In a real implementation, this would load from a database or file
    }

    // Notification actions
    handleNotificationClick(notification) {
        this.emit('notification.clicked', notification);
        
        // Default action based on notification type
        switch (notification.type) {
            case this.notificationTypes.MESSAGE:
                this.emit('chat.open', notification.chatId);
                break;
            case this.notificationTypes.CALL:
                this.emit('call.handle', notification.data);
                break;
            default:
                // Custom handling
                break;
        }
    }

    handleNotificationAction(notificationId, actionId) {
        const notification = this.notifications.get(notificationId);
        if (!notification) {
            return;
        }

        this.emit('notification.action', { notification, actionId });

        // Handle specific actions
        switch (actionId) {
            case 'accept':
                if (notification.type === this.notificationTypes.CALL) {
                    this.emit('call.accept', notification.data.callId);
                }
                break;
            case 'decline':
                if (notification.type === this.notificationTypes.CALL) {
                    this.emit('call.decline', notification.data.callId);
                }
                break;
            case 'reply':
                this.emit('message.reply', notification.data);
                break;
            case 'mark_read':
                this.emit('message.mark_read', notification.data);
                break;
        }

        // Dismiss notification after action
        this.dismissNotification(notificationId);
    }

    // Notification management
    dismissNotification(notificationId) {
        const notification = this.notifications.get(notificationId);
        if (notification) {
            notification.dismissed = true;
            notification.dismissedAt = new Date().toISOString();
            this.emit('notification.dismissed', notification);
        }
    }

    dismissAllNotifications() {
        Array.from(this.notifications.values()).forEach(notification => {
            this.dismissNotification(notification.id);
        });
        this.updateBadgeCount();
    }

    clearNotificationHistory() {
        this.notificationHistory = [];
        this.notifications.clear();
        this.updateBadgeCount();
        this.emit('notifications.cleared');
    }

    // Badge count management
    updateBadgeCount() {
        const unreadCount = Array.from(this.notifications.values())
            .filter(n => !n.dismissed && !n.read).length;
        
        this.badgeCount = unreadCount;
        this.emit('badge.count.updated', this.badgeCount);
        
        // Update browser badge if supported
        if (typeof navigator !== 'undefined' && navigator.setAppBadge) {
            navigator.setAppBadge(this.badgeCount);
        }
    }

    // Quiet hours
    isInQuietHours() {
        const settings = this.defaultSettings.quietHours;
        if (!settings.enabled) {
            return false;
        }

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const [startHour, startMin] = settings.start.split(':').map(Number);
        const [endHour, endMin] = settings.end.split(':').map(Number);
        
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        if (startTime <= endTime) {
            return currentTime >= startTime && currentTime <= endTime;
        } else {
            // Quiet hours span midnight
            return currentTime >= startTime || currentTime <= endTime;
        }
    }

    // Helper methods
    async getMessageNotificationTitle(message) {
        const chatId = message.key.remoteJid;
        if (chatId.endsWith('@g.us')) {
            // Group message
            const groupName = await this.getGroupName(chatId);
            const senderName = await this.getContactName(message.key.participant);
            return `${senderName} in ${groupName}`;
        } else {
            // Individual message
            return await this.getContactName(chatId);
        }
    }

    async getMessageNotificationBody(message) {
        const messageType = this.getMessageType(message);
        
        switch (messageType) {
            case 'conversation':
                return message.message.conversation;
            case 'extendedTextMessage':
                return message.message.extendedTextMessage.text;
            case 'imageMessage':
                return '📷 Photo';
            case 'videoMessage':
                return '🎥 Video';
            case 'audioMessage':
                return '🎵 Audio';
            case 'documentMessage':
                return '📄 Document';
            case 'stickerMessage':
                return '🎭 Sticker';
            case 'locationMessage':
                return '📍 Location';
            case 'contactMessage':
                return '👤 Contact';
            default:
                return 'New message';
        }
    }

    getMessageType(message) {
        if (message.message) {
            const messageTypes = Object.keys(message.message);
            return messageTypes.find(type => message.message[type]) || 'unknown';
        }
        return 'unknown';
    }

    getMessageActions(message) {
        const actions = [
            { id: 'reply', title: 'Reply', type: 'button' },
            { id: 'mark_read', title: 'Mark as Read', type: 'button' }
        ];

        // Add quick reply for text messages
        if (this.getMessageType(message) === 'conversation' || 
            this.getMessageType(message) === 'extendedTextMessage') {
            actions.unshift({ id: 'quick_reply', title: 'Quick Reply', type: 'input' });
        }

        return actions;
    }

    getNotificationSound(chatId) {
        // Get custom sound for chat or use default
        return this.soundProfiles.get(chatId) || this.options.defaultSound;
    }

    async getContactName(jid) {
        // This would integrate with the contact manager
        return jid.split('@')[0]; // Placeholder
    }

    async getGroupName(jid) {
        // This would integrate with the group manager
        return 'Group'; // Placeholder
    }

    async getContactAvatar(jid) {
        // This would integrate with the contact manager
        return '/assets/default-avatar.png'; // Placeholder
    }

    generateNotificationId() {
        return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Getters
    getNotifications(options = {}) {
        let notifications = Array.from(this.notifications.values());

        if (options.type) {
            notifications = notifications.filter(n => n.type === options.type);
        }

        if (options.chatId) {
            notifications = notifications.filter(n => n.chatId === options.chatId);
        }

        if (options.unreadOnly) {
            notifications = notifications.filter(n => !n.read && !n.dismissed);
        }

        return notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    getNotificationHistory(limit = 50) {
        return this.notificationHistory.slice(-limit);
    }

    getBadgeCount() {
        return this.badgeCount;
    }

    // Statistics
    getNotificationStats() {
        const notifications = Array.from(this.notifications.values());
        const typeStats = {};
        
        notifications.forEach(notification => {
            typeStats[notification.type] = (typeStats[notification.type] || 0) + 1;
        });

        return {
            total: notifications.length,
            unread: notifications.filter(n => !n.read && !n.dismissed).length,
            dismissed: notifications.filter(n => n.dismissed).length,
            byType: typeStats,
            badgeCount: this.badgeCount
        };
    }

    // Cleanup
    cleanup() {
        this.notifications.clear();
        this.notificationHistory = [];
        this.notificationSettings.clear();
        this.notificationQueue = [];
        this.badgeCount = 0;
        this.removeAllListeners();
    }
}

module.exports = WANotificationManager;