const EventEmitter = require('events');

/**
 * WhatsApp Newsletter Manager
 * Handles newsletter operations including creation, management, and broadcasting
 */
class WANewsletter extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            maxNewsletters: options.maxNewsletters || 50,
            maxSubscribers: options.maxSubscribers || 100000,
            enableAnalytics: options.enableAnalytics !== false,
            autoArchive: options.autoArchive || false,
            ...options
        };

        // Newsletter data
        this.newsletters = new Map();
        this.subscribers = new Map();
        this.newsletterMessages = new Map();
        this.analytics = new Map();

        this.initialize();
    }

    async initialize() {
        try {
            this.setupSocketEventHandlers();
            this.emit('newsletter:ready');
        } catch (error) {
            this.emit('newsletter:error', error);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        this.socket.on('newsletter.update', (update) => {
            this.handleNewsletterUpdate(update);
        });

        this.socket.on('newsletter.subscriber.update', (update) => {
            this.handleSubscriberUpdate(update);
        });
    }

    // Newsletter Management
    async createNewsletter(newsletterData) {
        try {
            if (this.newsletters.size >= this.options.maxNewsletters) {
                throw new Error('Maximum newsletters limit reached');
            }

            const newsletter = {
                id: newsletterData.id || this.generateNewsletterId(),
                name: newsletterData.name,
                description: newsletterData.description || '',
                category: newsletterData.category || 'general',
                picture: newsletterData.picture,
                isPrivate: newsletterData.isPrivate || false,
                isVerified: false,
                subscriberCount: 0,
                messageCount: 0,
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                owner: this.socket.user?.id,
                admins: [this.socket.user?.id],
                settings: {
                    allowReactions: newsletterData.allowReactions !== false,
                    allowComments: newsletterData.allowComments || false,
                    showSubscriberCount: newsletterData.showSubscriberCount !== false,
                    enableNotifications: newsletterData.enableNotifications !== false
                }
            };

            // Send newsletter creation request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:newsletter'
                },
                content: [{
                    tag: 'newsletter',
                    attrs: { action: 'create' },
                    content: this.serializeNewsletter(newsletter)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.newsletters.set(newsletter.id, newsletter);
                this.subscribers.set(newsletter.id, new Set());
                this.newsletterMessages.set(newsletter.id, []);
                
                if (this.options.enableAnalytics) {
                    this.initializeAnalytics(newsletter.id);
                }

                this.emit('newsletter:created', newsletter);
                return newsletter;
            } else {
                throw new Error('Failed to create newsletter');
            }
        } catch (error) {
            this.emit('newsletter:error', error);
            throw error;
        }
    }

    async updateNewsletter(newsletterId, updates) {
        try {
            const newsletter = this.newsletters.get(newsletterId);
            if (!newsletter) {
                throw new Error(`Newsletter ${newsletterId} not found`);
            }

            const updatedNewsletter = {
                ...newsletter,
                ...updates,
                updated: new Date().toISOString()
            };

            this.newsletters.set(newsletterId, updatedNewsletter);
            this.emit('newsletter:updated', updatedNewsletter);
            return updatedNewsletter;
        } catch (error) {
            this.emit('newsletter:error', error);
            throw error;
        }
    }

    async deleteNewsletter(newsletterId) {
        try {
            const newsletter = this.newsletters.get(newsletterId);
            if (!newsletter) {
                throw new Error(`Newsletter ${newsletterId} not found`);
            }

            this.newsletters.delete(newsletterId);
            this.subscribers.delete(newsletterId);
            this.newsletterMessages.delete(newsletterId);
            this.analytics.delete(newsletterId);
            
            this.emit('newsletter:deleted', { newsletterId, newsletter });
            return { success: true, message: 'Newsletter deleted successfully' };
        } catch (error) {
            this.emit('newsletter:error', error);
            throw error;
        }
    }

    // Subscriber Management
    async subscribeToNewsletter(newsletterId, subscriberId) {
        try {
            const newsletter = this.newsletters.get(newsletterId);
            if (!newsletter) {
                throw new Error(`Newsletter ${newsletterId} not found`);
            }

            const subscribers = this.subscribers.get(newsletterId) || new Set();
            
            if (subscribers.has(subscriberId)) {
                return { success: false, message: 'Already subscribed' };
            }

            if (subscribers.size >= this.options.maxSubscribers) {
                throw new Error('Maximum subscribers limit reached');
            }

            subscribers.add(subscriberId);
            this.subscribers.set(newsletterId, subscribers);
            
            // Update subscriber count
            newsletter.subscriberCount = subscribers.size;
            this.newsletters.set(newsletterId, newsletter);
            
            this.emit('newsletter:subscriber:added', { newsletterId, subscriberId });
            return { success: true, message: 'Subscribed successfully' };
        } catch (error) {
            this.emit('newsletter:error', error);
            throw error;
        }
    }

    async unsubscribeFromNewsletter(newsletterId, subscriberId) {
        try {
            const newsletter = this.newsletters.get(newsletterId);
            if (!newsletter) {
                throw new Error(`Newsletter ${newsletterId} not found`);
            }

            const subscribers = this.subscribers.get(newsletterId) || new Set();
            
            if (!subscribers.has(subscriberId)) {
                return { success: false, message: 'Not subscribed' };
            }

            subscribers.delete(subscriberId);
            this.subscribers.set(newsletterId, subscribers);
            
            // Update subscriber count
            newsletter.subscriberCount = subscribers.size;
            this.newsletters.set(newsletterId, newsletter);
            
            this.emit('newsletter:subscriber:removed', { newsletterId, subscriberId });
            return { success: true, message: 'Unsubscribed successfully' };
        } catch (error) {
            this.emit('newsletter:error', error);
            throw error;
        }
    }

    // Message Broadcasting
    async broadcastMessage(newsletterId, messageData) {
        try {
            const newsletter = this.newsletters.get(newsletterId);
            if (!newsletter) {
                throw new Error(`Newsletter ${newsletterId} not found`);
            }

            const message = {
                id: this.generateMessageId(),
                newsletterId: newsletterId,
                content: messageData.content,
                type: messageData.type || 'text',
                media: messageData.media,
                timestamp: new Date().toISOString(),
                views: 0,
                reactions: new Map()
            };

            // Send broadcast message
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:newsletter:message'
                },
                content: [{
                    tag: 'broadcast',
                    attrs: { newsletterId: newsletterId },
                    content: this.serializeMessage(message)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                // Store message
                const messages = this.newsletterMessages.get(newsletterId) || [];
                messages.push(message);
                this.newsletterMessages.set(newsletterId, messages);
                
                // Update newsletter message count
                newsletter.messageCount++;
                this.newsletters.set(newsletterId, newsletter);
                
                // Record analytics
                if (this.options.enableAnalytics) {
                    this.recordMessageAnalytics(newsletterId, message);
                }

                this.emit('newsletter:message:sent', { newsletterId, message });
                return message;
            } else {
                throw new Error('Failed to broadcast message');
            }
        } catch (error) {
            this.emit('newsletter:error', error);
            throw error;
        }
    }

    // Newsletter Discovery
    async searchNewsletters(query, filters = {}) {
        try {
            let results = Array.from(this.newsletters.values());

            // Text search
            if (query) {
                const searchTerm = query.toLowerCase();
                results = results.filter(newsletter => 
                    newsletter.name.toLowerCase().includes(searchTerm) ||
                    newsletter.description.toLowerCase().includes(searchTerm) ||
                    newsletter.category.toLowerCase().includes(searchTerm)
                );
            }

            // Apply filters
            if (filters.category) {
                results = results.filter(newsletter => newsletter.category === filters.category);
            }

            if (filters.isPrivate !== undefined) {
                results = results.filter(newsletter => newsletter.isPrivate === filters.isPrivate);
            }

            if (filters.isVerified !== undefined) {
                results = results.filter(newsletter => newsletter.isVerified === filters.isVerified);
            }

            if (filters.minSubscribers !== undefined) {
                results = results.filter(newsletter => newsletter.subscriberCount >= filters.minSubscribers);
            }

            if (filters.maxSubscribers !== undefined) {
                results = results.filter(newsletter => newsletter.subscriberCount <= filters.maxSubscribers);
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
                newsletters: results,
                total: results.length,
                query: query,
                filters: filters
            };
        } catch (error) {
            this.emit('newsletter:error', error);
            throw error;
        }
    }

    // Analytics
    initializeAnalytics(newsletterId) {
        this.analytics.set(newsletterId, {
            messagesSent: 0,
            totalViews: 0,
            totalReactions: 0,
            subscriberGrowth: [],
            messageEngagement: [],
            topPerformingMessages: []
        });
    }

    recordMessageAnalytics(newsletterId, message) {
        const analytics = this.analytics.get(newsletterId);
        if (analytics) {
            analytics.messagesSent++;
            analytics.messageEngagement.push({
                messageId: message.id,
                timestamp: message.timestamp,
                views: 0,
                reactions: 0
            });
            
            this.analytics.set(newsletterId, analytics);
        }
    }

    recordSubscriberGrowth(newsletterId, action) {
        const analytics = this.analytics.get(newsletterId);
        if (analytics) {
            const newsletter = this.newsletters.get(newsletterId);
            analytics.subscriberGrowth.push({
                timestamp: new Date().toISOString(),
                action: action,
                count: newsletter.subscriberCount
            });
            
            this.analytics.set(newsletterId, analytics);
        }
    }

    // Helper methods
    serializeNewsletter(newsletter) {
        return [
            { tag: 'name', attrs: {}, content: newsletter.name },
            { tag: 'description', attrs: {}, content: newsletter.description },
            { tag: 'category', attrs: {}, content: newsletter.category },
            { tag: 'private', attrs: {}, content: newsletter.isPrivate.toString() },
            { tag: 'settings', attrs: {}, content: JSON.stringify(newsletter.settings) }
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

    generateNewsletterId() {
        return `newsletter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Event handlers
    handleNewsletterUpdate(update) {
        try {
            this.emit('newsletter:server:update', update);
        } catch (error) {
            this.emit('newsletter:error', error);
        }
    }

    handleSubscriberUpdate(update) {
        try {
            this.emit('newsletter:server:subscriber:update', update);
        } catch (error) {
            this.emit('newsletter:error', error);
        }
    }

    // Getters
    getNewsletter(newsletterId) {
        return this.newsletters.get(newsletterId);
    }

    getNewsletterMessages(newsletterId, limit = 50) {
        const messages = this.newsletterMessages.get(newsletterId) || [];
        return messages.slice(-limit);
    }

    getNewsletterSubscribers(newsletterId) {
        const subscribers = this.subscribers.get(newsletterId) || new Set();
        return Array.from(subscribers);
    }

    getNewsletterAnalytics(newsletterId) {
        return this.analytics.get(newsletterId);
    }

    getAllNewsletters() {
        return Array.from(this.newsletters.values());
    }

    getOwnedNewsletters(ownerId) {
        return Array.from(this.newsletters.values()).filter(newsletter => newsletter.owner === ownerId);
    }

    getSubscribedNewsletters(subscriberId) {
        const subscribedNewsletters = [];
        
        for (const [newsletterId, subscribers] of this.subscribers.entries()) {
            if (subscribers.has(subscriberId)) {
                const newsletter = this.newsletters.get(newsletterId);
                if (newsletter) {
                    subscribedNewsletters.push(newsletter);
                }
            }
        }
        
        return subscribedNewsletters;
    }

    getStatistics() {
        return {
            totalNewsletters: this.newsletters.size,
            totalSubscribers: Array.from(this.subscribers.values()).reduce((sum, set) => sum + set.size, 0),
            totalMessages: Array.from(this.newsletterMessages.values()).reduce((sum, messages) => sum + messages.length, 0),
            averageSubscribersPerNewsletter: this.newsletters.size > 0 ? 
                Array.from(this.subscribers.values()).reduce((sum, set) => sum + set.size, 0) / this.newsletters.size : 0
        };
    }
}

module.exports = WANewsletter;