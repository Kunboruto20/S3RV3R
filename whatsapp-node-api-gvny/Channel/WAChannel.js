const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * WhatsApp Channel Manager
 * Handles WhatsApp Channels functionality including creation, management, and broadcasting
 */
class WAChannel extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            channelPath: options.channelPath || './wa_channels',
            enableAutoSync: options.enableAutoSync !== false,
            maxChannels: options.maxChannels || 100,
            maxSubscribers: options.maxSubscribers || 1000000,
            enableAnalytics: options.enableAnalytics !== false,
            ...options
        };

        // Channel data
        this.channels = new Map();
        this.subscribers = new Map();
        this.channelMessages = new Map();
        this.channelAnalytics = new Map();
        this.channelSettings = new Map();

        this.initialize();
    }

    async initialize() {
        try {
            await this.createChannelStructure();
            await this.loadChannels();
            this.setupSocketEventHandlers();
            this.emit('channel:ready');
        } catch (error) {
            this.emit('channel:error', error);
        }
    }

    // Create channel directory structure
    async createChannelStructure() {
        try {
            await fs.mkdir(this.options.channelPath, { recursive: true });
            
            const subdirs = ['channels', 'messages', 'analytics', 'media', 'subscribers'];
            for (const subdir of subdirs) {
                await fs.mkdir(path.join(this.options.channelPath, subdir), { recursive: true });
            }
        } catch (error) {
            throw new Error(`Channel structure creation failed: ${error.message}`);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        // Handle channel updates
        this.socket.on('channel.update', (update) => {
            this.handleChannelUpdate(update);
        });

        // Handle channel messages
        this.socket.on('channel.message', (message) => {
            this.handleChannelMessage(message);
        });

        // Handle subscriber updates
        this.socket.on('channel.subscriber.update', (update) => {
            this.handleSubscriberUpdate(update);
        });
    }

    // Channel Management
    async createChannel(channelData) {
        try {
            if (this.channels.size >= this.options.maxChannels) {
                throw new Error('Maximum channels limit reached');
            }

            const channel = {
                id: channelData.id || this.generateChannelId(),
                name: channelData.name,
                description: channelData.description || '',
                category: channelData.category || 'general',
                profilePicture: channelData.profilePicture,
                isPrivate: channelData.isPrivate || false,
                isVerified: false,
                subscriberCount: 0,
                messageCount: 0,
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                owner: this.socket.user?.id,
                admins: [this.socket.user?.id],
                settings: {
                    allowComments: channelData.allowComments !== false,
                    allowForwarding: channelData.allowForwarding !== false,
                    showSubscriberCount: channelData.showSubscriberCount !== false,
                    autoArchive: channelData.autoArchive || false
                }
            };

            // Send channel creation request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:channel'
                },
                content: [{
                    tag: 'channel',
                    attrs: { action: 'create' },
                    content: this.serializeChannel(channel)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.channels.set(channel.id, channel);
                this.subscribers.set(channel.id, new Set());
                this.channelMessages.set(channel.id, []);
                this.channelSettings.set(channel.id, channel.settings);
                
                if (this.options.enableAnalytics) {
                    this.initializeChannelAnalytics(channel.id);
                }

                await this.saveChannels();
                this.emit('channel:created', channel);
                return channel;
            } else {
                throw new Error('Failed to create channel');
            }
        } catch (error) {
            this.emit('channel:error', error);
            throw error;
        }
    }

    async updateChannel(channelId, updates) {
        try {
            const channel = this.channels.get(channelId);
            if (!channel) {
                throw new Error(`Channel ${channelId} not found`);
            }

            const updatedChannel = {
                ...channel,
                ...updates,
                updated: new Date().toISOString()
            };

            // Send update request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:channel'
                },
                content: [{
                    tag: 'channel',
                    attrs: { 
                        action: 'update',
                        id: channelId
                    },
                    content: this.serializeChannel(updatedChannel)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.channels.set(channelId, updatedChannel);
                
                await this.saveChannels();
                this.emit('channel:updated', updatedChannel);
                return updatedChannel;
            } else {
                throw new Error('Failed to update channel');
            }
        } catch (error) {
            this.emit('channel:error', error);
            throw error;
        }
    }

    async deleteChannel(channelId) {
        try {
            const channel = this.channels.get(channelId);
            if (!channel) {
                throw new Error(`Channel ${channelId} not found`);
            }

            // Send delete request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:channel'
                },
                content: [{
                    tag: 'channel',
                    attrs: { 
                        action: 'delete',
                        id: channelId
                    },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.channels.delete(channelId);
                this.subscribers.delete(channelId);
                this.channelMessages.delete(channelId);
                this.channelAnalytics.delete(channelId);
                this.channelSettings.delete(channelId);
                
                await this.saveChannels();
                this.emit('channel:deleted', { channelId, channel });
                return { success: true, message: 'Channel deleted successfully' };
            } else {
                throw new Error('Failed to delete channel');
            }
        } catch (error) {
            this.emit('channel:error', error);
            throw error;
        }
    }

    // Message Broadcasting
    async broadcastMessage(channelId, messageData) {
        try {
            const channel = this.channels.get(channelId);
            if (!channel) {
                throw new Error(`Channel ${channelId} not found`);
            }

            const message = {
                id: this.generateMessageId(),
                channelId: channelId,
                content: messageData.content,
                type: messageData.type || 'text',
                media: messageData.media,
                timestamp: new Date().toISOString(),
                views: 0,
                forwards: 0,
                reactions: new Map()
            };

            // Send broadcast message
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:channel:message'
                },
                content: [{
                    tag: 'broadcast',
                    attrs: { channelId: channelId },
                    content: this.serializeMessage(message)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                // Store message
                const channelMessages = this.channelMessages.get(channelId) || [];
                channelMessages.push(message);
                this.channelMessages.set(channelId, channelMessages);
                
                // Update channel message count
                channel.messageCount++;
                this.channels.set(channelId, channel);
                
                // Record analytics
                if (this.options.enableAnalytics) {
                    this.recordMessageAnalytics(channelId, message);
                }

                await this.saveChannels();
                this.emit('channel:message:sent', { channelId, message });
                return message;
            } else {
                throw new Error('Failed to broadcast message');
            }
        } catch (error) {
            this.emit('channel:error', error);
            throw error;
        }
    }

    // Subscriber Management
    async subscribeToChannel(channelId, subscriberId) {
        try {
            const channel = this.channels.get(channelId);
            if (!channel) {
                throw new Error(`Channel ${channelId} not found`);
            }

            const subscribers = this.subscribers.get(channelId) || new Set();
            
            if (subscribers.has(subscriberId)) {
                return { success: false, message: 'Already subscribed' };
            }

            if (subscribers.size >= this.options.maxSubscribers) {
                throw new Error('Maximum subscribers limit reached');
            }

            // Send subscribe request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:channel:subscribe'
                },
                content: [{
                    tag: 'subscribe',
                    attrs: { 
                        channelId: channelId,
                        subscriberId: subscriberId
                    },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                subscribers.add(subscriberId);
                this.subscribers.set(channelId, subscribers);
                
                // Update subscriber count
                channel.subscriberCount = subscribers.size;
                this.channels.set(channelId, channel);
                
                // Record analytics
                if (this.options.enableAnalytics) {
                    this.recordSubscriberAnalytics(channelId, 'subscribe');
                }

                await this.saveChannels();
                this.emit('channel:subscriber:added', { channelId, subscriberId });
                return { success: true, message: 'Subscribed successfully' };
            } else {
                throw new Error('Failed to subscribe');
            }
        } catch (error) {
            this.emit('channel:error', error);
            throw error;
        }
    }

    async unsubscribeFromChannel(channelId, subscriberId) {
        try {
            const channel = this.channels.get(channelId);
            if (!channel) {
                throw new Error(`Channel ${channelId} not found`);
            }

            const subscribers = this.subscribers.get(channelId) || new Set();
            
            if (!subscribers.has(subscriberId)) {
                return { success: false, message: 'Not subscribed' };
            }

            // Send unsubscribe request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:channel:subscribe'
                },
                content: [{
                    tag: 'unsubscribe',
                    attrs: { 
                        channelId: channelId,
                        subscriberId: subscriberId
                    },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                subscribers.delete(subscriberId);
                this.subscribers.set(channelId, subscribers);
                
                // Update subscriber count
                channel.subscriberCount = subscribers.size;
                this.channels.set(channelId, channel);
                
                // Record analytics
                if (this.options.enableAnalytics) {
                    this.recordSubscriberAnalytics(channelId, 'unsubscribe');
                }

                await this.saveChannels();
                this.emit('channel:subscriber:removed', { channelId, subscriberId });
                return { success: true, message: 'Unsubscribed successfully' };
            } else {
                throw new Error('Failed to unsubscribe');
            }
        } catch (error) {
            this.emit('channel:error', error);
            throw error;
        }
    }

    // Channel Discovery
    async searchChannels(query, filters = {}) {
        try {
            let results = Array.from(this.channels.values());

            // Text search
            if (query) {
                const searchTerm = query.toLowerCase();
                results = results.filter(channel => 
                    channel.name.toLowerCase().includes(searchTerm) ||
                    channel.description.toLowerCase().includes(searchTerm) ||
                    channel.category.toLowerCase().includes(searchTerm)
                );
            }

            // Apply filters
            if (filters.category) {
                results = results.filter(channel => channel.category === filters.category);
            }

            if (filters.isPrivate !== undefined) {
                results = results.filter(channel => channel.isPrivate === filters.isPrivate);
            }

            if (filters.isVerified !== undefined) {
                results = results.filter(channel => channel.isVerified === filters.isVerified);
            }

            if (filters.minSubscribers !== undefined) {
                results = results.filter(channel => channel.subscriberCount >= filters.minSubscribers);
            }

            if (filters.maxSubscribers !== undefined) {
                results = results.filter(channel => channel.subscriberCount <= filters.maxSubscribers);
            }

            // Sort results
            if (filters.sortBy) {
                results.sort((a, b) => {
                    switch (filters.sortBy) {
                        case 'name':
                            return a.name.localeCompare(b.name);
                        case 'subscribers':
                            return b.subscriberCount - a.subscriberCount;
                        case 'created':
                            return new Date(b.created) - new Date(a.created);
                        case 'messages':
                            return b.messageCount - a.messageCount;
                        default:
                            return 0;
                    }
                });
            }

            // Pagination
            if (filters.limit) {
                const offset = filters.offset || 0;
                results = results.slice(offset, offset + filters.limit);
            }

            return {
                channels: results,
                total: results.length,
                query: query,
                filters: filters
            };
        } catch (error) {
            this.emit('channel:error', error);
            throw error;
        }
    }

    // Analytics
    initializeChannelAnalytics(channelId) {
        this.channelAnalytics.set(channelId, {
            messagesSent: 0,
            totalViews: 0,
            totalForwards: 0,
            totalReactions: 0,
            subscriberGrowth: [],
            messageEngagement: [],
            peakViewTimes: new Map(),
            demographicData: new Map()
        });
    }

    recordMessageAnalytics(channelId, message) {
        const analytics = this.channelAnalytics.get(channelId);
        if (analytics) {
            analytics.messagesSent++;
            analytics.messageEngagement.push({
                messageId: message.id,
                timestamp: message.timestamp,
                views: 0,
                forwards: 0,
                reactions: 0
            });
            
            this.channelAnalytics.set(channelId, analytics);
        }
    }

    recordSubscriberAnalytics(channelId, action) {
        const analytics = this.channelAnalytics.get(channelId);
        if (analytics) {
            const channel = this.channels.get(channelId);
            analytics.subscriberGrowth.push({
                timestamp: new Date().toISOString(),
                action: action,
                count: channel.subscriberCount
            });
            
            this.channelAnalytics.set(channelId, analytics);
        }
    }

    // Helper methods
    serializeChannel(channel) {
        return [
            { tag: 'name', attrs: {}, content: channel.name },
            { tag: 'description', attrs: {}, content: channel.description },
            { tag: 'category', attrs: {}, content: channel.category },
            { tag: 'private', attrs: {}, content: channel.isPrivate.toString() },
            { tag: 'settings', attrs: {}, content: JSON.stringify(channel.settings) }
        ];
    }

    serializeMessage(message) {
        return [
            { tag: 'content', attrs: {}, content: message.content },
            { tag: 'type', attrs: {}, content: message.type },
            { tag: 'timestamp', attrs: {}, content: message.timestamp },
            ...(message.media ? [{ tag: 'media', attrs: {}, content: JSON.stringify(message.media) }] : [])
        ];
    }

    generateChannelId() {
        return `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Save/Load methods
    async saveChannels() {
        try {
            const channelData = {
                channels: Array.from(this.channels.entries()),
                subscribers: Array.from(this.subscribers.entries()).map(([id, set]) => [id, Array.from(set)]),
                messages: Array.from(this.channelMessages.entries()),
                analytics: Array.from(this.channelAnalytics.entries()),
                settings: Array.from(this.channelSettings.entries()),
                lastSaved: new Date().toISOString()
            };

            const channelFile = path.join(this.options.channelPath, 'channels.json');
            await fs.writeFile(channelFile, JSON.stringify(channelData, null, 2));
            
            this.emit('channel:saved');
        } catch (error) {
            this.emit('channel:error', error);
            throw error;
        }
    }

    async loadChannels() {
        try {
            const channelFile = path.join(this.options.channelPath, 'channels.json');
            
            try {
                const data = await fs.readFile(channelFile, 'utf8');
                const channelData = JSON.parse(data);

                this.channels = new Map(channelData.channels || []);
                this.subscribers = new Map(
                    (channelData.subscribers || []).map(([id, array]) => [id, new Set(array)])
                );
                this.channelMessages = new Map(channelData.messages || []);
                this.channelAnalytics = new Map(channelData.analytics || []);
                this.channelSettings = new Map(channelData.settings || []);

                this.emit('channel:loaded');
            } catch (error) {
                console.warn('Channel file not found, using defaults');
            }
        } catch (error) {
            this.emit('channel:error', error);
        }
    }

    // Event handlers
    handleChannelUpdate(update) {
        try {
            this.emit('channel:server:update', update);
        } catch (error) {
            this.emit('channel:error', error);
        }
    }

    handleChannelMessage(message) {
        try {
            this.emit('channel:server:message', message);
        } catch (error) {
            this.emit('channel:error', error);
        }
    }

    handleSubscriberUpdate(update) {
        try {
            this.emit('channel:server:subscriber:update', update);
        } catch (error) {
            this.emit('channel:error', error);
        }
    }

    // Getters
    getChannel(channelId) {
        return this.channels.get(channelId);
    }

    getChannelMessages(channelId, limit = 50) {
        const messages = this.channelMessages.get(channelId) || [];
        return messages.slice(-limit);
    }

    getChannelSubscribers(channelId) {
        const subscribers = this.subscribers.get(channelId) || new Set();
        return Array.from(subscribers);
    }

    getChannelAnalytics(channelId) {
        return this.channelAnalytics.get(channelId);
    }

    getAllChannels() {
        return Array.from(this.channels.values());
    }

    getOwnedChannels(ownerId) {
        return Array.from(this.channels.values()).filter(channel => channel.owner === ownerId);
    }

    getSubscribedChannels(subscriberId) {
        const subscribedChannels = [];
        
        for (const [channelId, subscribers] of this.subscribers.entries()) {
            if (subscribers.has(subscriberId)) {
                const channel = this.channels.get(channelId);
                if (channel) {
                    subscribedChannels.push(channel);
                }
            }
        }
        
        return subscribedChannels;
    }

    getStatistics() {
        return {
            totalChannels: this.channels.size,
            totalSubscribers: Array.from(this.subscribers.values()).reduce((sum, set) => sum + set.size, 0),
            totalMessages: Array.from(this.channelMessages.values()).reduce((sum, messages) => sum + messages.length, 0),
            averageSubscribersPerChannel: this.channels.size > 0 ? 
                Array.from(this.subscribers.values()).reduce((sum, set) => sum + set.size, 0) / this.channels.size : 0
        };
    }
}

module.exports = WAChannel;