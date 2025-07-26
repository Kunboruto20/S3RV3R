const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * WhatsApp Story/Status Manager
 * Handles all story operations including creation, viewing, management, and privacy
 */
class WAStoryManager extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableStories: options.enableStories !== false,
            storyExpiration: options.storyExpiration || 86400000, // 24 hours
            maxStorySize: options.maxStorySize || 50 * 1024 * 1024, // 50MB
            enableStoryViews: options.enableStoryViews !== false,
            enableStoryReplies: options.enableStoryReplies !== false,
            autoDeleteExpired: options.autoDeleteExpired !== false,
            maxStoriesPerUser: options.maxStoriesPerUser || 30,
            enableStoryPrivacy: options.enableStoryPrivacy !== false,
            ...options
        };

        // Story data stores
        this.stories = new Map();
        this.myStories = new Map();
        this.storyViews = new Map();
        this.storyReplies = new Map();
        this.storyPrivacySettings = new Map();
        this.viewedStories = new Set();
        
        // Story types
        this.storyTypes = {
            IMAGE: 'image',
            VIDEO: 'video',
            TEXT: 'text'
        };

        // Privacy levels
        this.privacyLevels = {
            ALL_CONTACTS: 'all_contacts',
            MY_CONTACTS: 'my_contacts',
            CONTACTS_EXCEPT: 'contacts_except',
            ONLY_SHARE_WITH: 'only_share_with',
            CLOSE_FRIENDS: 'close_friends'
        };

        this.initialize();
    }

    async initialize() {
        try {
            await this.loadStories();
            await this.loadStoryPrivacySettings();
            this.setupSocketEventHandlers();
            this.startStoryCleanup();
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        // Story updates
        this.socket.on('stories.update', (stories) => {
            stories.forEach(story => {
                this.handleStoryUpdate(story);
            });
        });

        // Story views
        this.socket.on('story.view', (view) => {
            this.handleStoryView(view);
        });

        // Story replies
        this.socket.on('story.reply', (reply) => {
            this.handleStoryReply(reply);
        });
    }

    // Story creation
    async createStory(storyData) {
        try {
            // Validate story data
            this.validateStoryData(storyData);

            const story = {
                id: this.generateStoryId(),
                type: storyData.type,
                content: storyData.content,
                caption: storyData.caption || '',
                backgroundColor: storyData.backgroundColor,
                textColor: storyData.textColor,
                font: storyData.font,
                mediaUrl: storyData.mediaUrl,
                mediaKey: storyData.mediaKey,
                mediaMimeType: storyData.mediaMimeType,
                mediaSize: storyData.mediaSize,
                thumbnail: storyData.thumbnail,
                duration: storyData.duration,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + this.options.storyExpiration).toISOString(),
                privacyLevel: storyData.privacyLevel || this.privacyLevels.ALL_CONTACTS,
                allowedViewers: storyData.allowedViewers || [],
                blockedViewers: storyData.blockedViewers || [],
                views: 0,
                replies: 0,
                isActive: true
            };

            // Apply privacy settings
            await this.applyStoryPrivacy(story);

            // Send story to WhatsApp
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'status',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'status',
                    attrs: { type: 'set' },
                    content: this.encodeStory(story)
                }]
            });

            if (response.attrs.type === 'result') {
                // Store story
                this.myStories.set(story.id, story);
                this.stories.set(story.id, story);
                
                this.emit('story.created', story);
                return story;
            } else {
                throw new Error('Failed to create story');
            }
        } catch (error) {
            throw new Error(`Story creation failed: ${error.message}`);
        }
    }

    // Text story creation
    async createTextStory(textData) {
        const storyData = {
            type: this.storyTypes.TEXT,
            content: textData.text,
            backgroundColor: textData.backgroundColor || '#000000',
            textColor: textData.textColor || '#FFFFFF',
            font: textData.font || 'default',
            privacyLevel: textData.privacyLevel,
            allowedViewers: textData.allowedViewers,
            blockedViewers: textData.blockedViewers
        };

        return await this.createStory(storyData);
    }

    // Image story creation
    async createImageStory(imageData) {
        try {
            // Upload image if needed
            let mediaUrl = imageData.mediaUrl;
            let mediaKey = imageData.mediaKey;
            
            if (imageData.imageBuffer) {
                const uploadResult = await this.uploadStoryMedia(imageData.imageBuffer, 'image');
                mediaUrl = uploadResult.url;
                mediaKey = uploadResult.mediaKey;
            }

            const storyData = {
                type: this.storyTypes.IMAGE,
                mediaUrl: mediaUrl,
                mediaKey: mediaKey,
                mediaMimeType: imageData.mimeType || 'image/jpeg',
                mediaSize: imageData.size,
                thumbnail: imageData.thumbnail,
                caption: imageData.caption,
                privacyLevel: imageData.privacyLevel,
                allowedViewers: imageData.allowedViewers,
                blockedViewers: imageData.blockedViewers
            };

            return await this.createStory(storyData);
        } catch (error) {
            throw new Error(`Image story creation failed: ${error.message}`);
        }
    }

    // Video story creation
    async createVideoStory(videoData) {
        try {
            // Upload video if needed
            let mediaUrl = videoData.mediaUrl;
            let mediaKey = videoData.mediaKey;
            
            if (videoData.videoBuffer) {
                const uploadResult = await this.uploadStoryMedia(videoData.videoBuffer, 'video');
                mediaUrl = uploadResult.url;
                mediaKey = uploadResult.mediaKey;
            }

            const storyData = {
                type: this.storyTypes.VIDEO,
                mediaUrl: mediaUrl,
                mediaKey: mediaKey,
                mediaMimeType: videoData.mimeType || 'video/mp4',
                mediaSize: videoData.size,
                duration: videoData.duration,
                thumbnail: videoData.thumbnail,
                caption: videoData.caption,
                privacyLevel: videoData.privacyLevel,
                allowedViewers: videoData.allowedViewers,
                blockedViewers: videoData.blockedViewers
            };

            return await this.createStory(storyData);
        } catch (error) {
            throw new Error(`Video story creation failed: ${error.message}`);
        }
    }

    // Story viewing
    async viewStory(storyId, viewerJid = null) {
        try {
            const story = this.stories.get(storyId);
            if (!story) {
                throw new Error('Story not found');
            }

            if (this.isStoryExpired(story)) {
                throw new Error('Story has expired');
            }

            // Check if viewer has permission to view
            if (!this.canViewStory(story, viewerJid)) {
                throw new Error('No permission to view this story');
            }

            // Record view
            const view = {
                id: this.generateViewId(),
                storyId: storyId,
                viewerJid: viewerJid || this.socket.user.id,
                viewedAt: new Date().toISOString()
            };

            // Store view
            if (!this.storyViews.has(storyId)) {
                this.storyViews.set(storyId, []);
            }
            this.storyViews.get(storyId).push(view);

            // Update story view count
            story.views++;
            this.stories.set(storyId, story);

            // Mark as viewed
            this.viewedStories.add(storyId);

            // Send view receipt if it's not our story
            if (story.creatorJid !== this.socket.user.id) {
                await this.sendStoryViewReceipt(storyId, story.creatorJid);
            }

            this.emit('story.viewed', { story, view });
            return story;
        } catch (error) {
            throw new Error(`Story viewing failed: ${error.message}`);
        }
    }

    // Story reply
    async replyToStory(storyId, replyData) {
        try {
            const story = this.stories.get(storyId);
            if (!story) {
                throw new Error('Story not found');
            }

            if (this.isStoryExpired(story)) {
                throw new Error('Story has expired');
            }

            if (!this.options.enableStoryReplies) {
                throw new Error('Story replies are disabled');
            }

            const reply = {
                id: this.generateReplyId(),
                storyId: storyId,
                replyText: replyData.text,
                replyMedia: replyData.media,
                replierJid: this.socket.user.id,
                repliedAt: new Date().toISOString()
            };

            // Send reply message
            const message = {
                extendedTextMessage: {
                    text: replyData.text,
                    contextInfo: {
                        stanzaId: storyId,
                        participant: story.creatorJid,
                        quotedMessage: {
                            conversation: story.caption || 'Story'
                        }
                    }
                }
            };

            await this.socket.sendMessage(story.creatorJid, message);

            // Store reply
            if (!this.storyReplies.has(storyId)) {
                this.storyReplies.set(storyId, []);
            }
            this.storyReplies.get(storyId).push(reply);

            // Update story reply count
            story.replies++;
            this.stories.set(storyId, story);

            this.emit('story.reply.sent', { story, reply });
            return reply;
        } catch (error) {
            throw new Error(`Story reply failed: ${error.message}`);
        }
    }

    // Story deletion
    async deleteStory(storyId) {
        try {
            const story = this.myStories.get(storyId);
            if (!story) {
                throw new Error('Story not found or not owned by you');
            }

            // Send delete request
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'status',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'status',
                    attrs: { type: 'delete', id: storyId }
                }]
            });

            if (response.attrs.type === 'result') {
                // Remove from stores
                this.myStories.delete(storyId);
                this.stories.delete(storyId);
                this.storyViews.delete(storyId);
                this.storyReplies.delete(storyId);

                this.emit('story.deleted', { storyId, story });
                return true;
            } else {
                throw new Error('Failed to delete story');
            }
        } catch (error) {
            throw new Error(`Story deletion failed: ${error.message}`);
        }
    }

    // Story privacy management
    async updateStoryPrivacy(storyId, privacySettings) {
        try {
            const story = this.myStories.get(storyId);
            if (!story) {
                throw new Error('Story not found or not owned by you');
            }

            // Update privacy settings
            story.privacyLevel = privacySettings.privacyLevel || story.privacyLevel;
            story.allowedViewers = privacySettings.allowedViewers || story.allowedViewers;
            story.blockedViewers = privacySettings.blockedViewers || story.blockedViewers;

            // Apply privacy settings
            await this.applyStoryPrivacy(story);

            this.myStories.set(storyId, story);
            this.stories.set(storyId, story);

            this.emit('story.privacy.updated', { storyId, privacySettings });
            return story;
        } catch (error) {
            throw new Error(`Story privacy update failed: ${error.message}`);
        }
    }

    // Global story privacy settings
    async updateGlobalStoryPrivacy(settings) {
        try {
            this.storyPrivacySettings.set('global', {
                defaultPrivacyLevel: settings.defaultPrivacyLevel || this.privacyLevels.ALL_CONTACTS,
                allowedViewers: settings.allowedViewers || [],
                blockedViewers: settings.blockedViewers || [],
                hideStoryFrom: settings.hideStoryFrom || [],
                allowReplies: settings.allowReplies !== false,
                updatedAt: new Date().toISOString()
            });

            this.emit('story.global.privacy.updated', settings);
            return true;
        } catch (error) {
            throw new Error(`Global story privacy update failed: ${error.message}`);
        }
    }

    // Story media upload
    async uploadStoryMedia(mediaBuffer, mediaType) {
        try {
            // This would integrate with the media manager
            // For now, return mock data
            return {
                url: `https://mmg.whatsapp.net/story/${Date.now()}`,
                mediaKey: crypto.randomBytes(32),
                fileEncSha256: crypto.createHash('sha256').update(mediaBuffer).digest(),
                fileSha256: crypto.createHash('sha256').update(mediaBuffer).digest(),
                fileLength: mediaBuffer.length
            };
        } catch (error) {
            throw new Error(`Media upload failed: ${error.message}`);
        }
    }

    // Story event handlers
    handleStoryUpdate(storyUpdate) {
        const story = this.stories.get(storyUpdate.id);
        if (story) {
            Object.assign(story, storyUpdate);
            this.stories.set(story.id, story);
            this.emit('story.updated', story);
        } else {
            // New story from contact
            this.stories.set(storyUpdate.id, storyUpdate);
            this.emit('story.received', storyUpdate);
        }
    }

    handleStoryView(view) {
        const storyId = view.storyId;
        const story = this.myStories.get(storyId);
        
        if (story) {
            if (!this.storyViews.has(storyId)) {
                this.storyViews.set(storyId, []);
            }
            this.storyViews.get(storyId).push(view);
            
            story.views++;
            this.myStories.set(storyId, story);
            
            this.emit('story.view.received', { story, view });
        }
    }

    handleStoryReply(reply) {
        const storyId = reply.storyId;
        const story = this.myStories.get(storyId);
        
        if (story) {
            if (!this.storyReplies.has(storyId)) {
                this.storyReplies.set(storyId, []);
            }
            this.storyReplies.get(storyId).push(reply);
            
            story.replies++;
            this.myStories.set(storyId, story);
            
            this.emit('story.reply.received', { story, reply });
        }
    }

    // Utility methods
    validateStoryData(storyData) {
        if (!storyData.type || !Object.values(this.storyTypes).includes(storyData.type)) {
            throw new Error('Invalid story type');
        }

        if (storyData.type === this.storyTypes.TEXT && !storyData.content) {
            throw new Error('Text content is required for text stories');
        }

        if ((storyData.type === this.storyTypes.IMAGE || storyData.type === this.storyTypes.VIDEO) && 
            !storyData.mediaUrl && !storyData.imageBuffer && !storyData.videoBuffer) {
            throw new Error('Media is required for image/video stories');
        }

        if (storyData.mediaSize && storyData.mediaSize > this.options.maxStorySize) {
            throw new Error(`Media size exceeds limit: ${this.options.maxStorySize} bytes`);
        }
    }

    async applyStoryPrivacy(story) {
        const globalSettings = this.storyPrivacySettings.get('global');
        
        switch (story.privacyLevel) {
            case this.privacyLevels.ALL_CONTACTS:
                // Visible to all contacts
                break;
            case this.privacyLevels.MY_CONTACTS:
                // Visible to contacts only
                break;
            case this.privacyLevels.CONTACTS_EXCEPT:
                // Visible to all contacts except specified
                break;
            case this.privacyLevels.ONLY_SHARE_WITH:
                // Visible only to specified contacts
                break;
            case this.privacyLevels.CLOSE_FRIENDS:
                // Visible to close friends only
                break;
        }
    }

    canViewStory(story, viewerJid) {
        if (!viewerJid) return false;
        
        // Story owner can always view
        if (story.creatorJid === viewerJid) {
            return true;
        }

        // Check privacy settings
        switch (story.privacyLevel) {
            case this.privacyLevels.ALL_CONTACTS:
                return !story.blockedViewers.includes(viewerJid);
            case this.privacyLevels.ONLY_SHARE_WITH:
                return story.allowedViewers.includes(viewerJid);
            case this.privacyLevels.CONTACTS_EXCEPT:
                return !story.blockedViewers.includes(viewerJid);
            default:
                return true;
        }
    }

    isStoryExpired(story) {
        return new Date() > new Date(story.expiresAt);
    }

    async sendStoryViewReceipt(storyId, creatorJid) {
        try {
            await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'status',
                    to: creatorJid
                },
                content: [{
                    tag: 'status',
                    attrs: { type: 'view', id: storyId }
                }]
            });
        } catch (error) {
            console.warn('Failed to send story view receipt:', error);
        }
    }

    // Story cleanup
    startStoryCleanup() {
        if (this.options.autoDeleteExpired) {
            setInterval(() => {
                this.cleanupExpiredStories();
            }, 3600000); // Check every hour
        }
    }

    cleanupExpiredStories() {
        const now = new Date();
        
        for (const [storyId, story] of this.stories.entries()) {
            if (new Date(story.expiresAt) < now) {
                this.stories.delete(storyId);
                this.storyViews.delete(storyId);
                this.storyReplies.delete(storyId);
                
                // Also remove from myStories if it's ours
                if (this.myStories.has(storyId)) {
                    this.myStories.delete(storyId);
                }
                
                this.emit('story.expired', { storyId, story });
            }
        }
    }

    // Story encoding for protocol
    encodeStory(story) {
        const content = [];
        
        content.push({ tag: 'id', attrs: {}, content: story.id });
        content.push({ tag: 'type', attrs: {}, content: story.type });
        
        if (story.content) {
            content.push({ tag: 'content', attrs: {}, content: story.content });
        }
        
        if (story.caption) {
            content.push({ tag: 'caption', attrs: {}, content: story.caption });
        }
        
        if (story.mediaUrl) {
            content.push({ tag: 'media_url', attrs: {}, content: story.mediaUrl });
        }
        
        if (story.mediaKey) {
            content.push({ tag: 'media_key', attrs: {}, content: story.mediaKey.toString('base64') });
        }
        
        content.push({ tag: 'created_at', attrs: {}, content: story.createdAt });
        content.push({ tag: 'expires_at', attrs: {}, content: story.expiresAt });
        content.push({ tag: 'privacy_level', attrs: {}, content: story.privacyLevel });
        
        return content;
    }

    async loadStories() {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'status'
                },
                content: [{
                    tag: 'status',
                    attrs: { type: 'get' }
                }]
            });

            if (response.content) {
                for (const storyNode of response.content) {
                    if (storyNode.tag === 'story') {
                        const story = this.decodeStory(storyNode);
                        this.stories.set(story.id, story);
                        
                        if (story.creatorJid === this.socket.user.id) {
                            this.myStories.set(story.id, story);
                        }
                    }
                }
                this.emit('stories.loaded', Array.from(this.stories.values()));
            }
        } catch (error) {
            console.error('Failed to load stories:', error);
        }
    }

    async loadStoryPrivacySettings() {
        // Load privacy settings from storage
        // This would be implemented with actual storage
    }

    decodeStory(node) {
        const story = {};
        if (node.content) {
            for (const child of node.content) {
                if (child.tag && child.content) {
                    story[child.tag] = child.content;
                }
            }
        }
        return story;
    }

    // ID generators
    generateStoryId() {
        return `story_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    generateViewId() {
        return `view_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    generateReplyId() {
        return `reply_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    // Getters
    getMyStories() {
        return Array.from(this.myStories.values()).filter(story => !this.isStoryExpired(story));
    }

    getContactStories(contactJid) {
        return Array.from(this.stories.values())
            .filter(story => story.creatorJid === contactJid && !this.isStoryExpired(story));
    }

    getAllStories() {
        return Array.from(this.stories.values()).filter(story => !this.isStoryExpired(story));
    }

    getStoryViews(storyId) {
        return this.storyViews.get(storyId) || [];
    }

    getStoryReplies(storyId) {
        return this.storyReplies.get(storyId) || [];
    }

    isStoryViewed(storyId) {
        return this.viewedStories.has(storyId);
    }

    // Statistics
    getStoryStats() {
        const myStories = this.getMyStories();
        const totalViews = myStories.reduce((sum, story) => sum + story.views, 0);
        const totalReplies = myStories.reduce((sum, story) => sum + story.replies, 0);

        return {
            myStoriesCount: myStories.length,
            totalViews: totalViews,
            totalReplies: totalReplies,
            averageViews: myStories.length > 0 ? totalViews / myStories.length : 0,
            contactStoriesCount: this.stories.size - myStories.length,
            viewedStoriesCount: this.viewedStories.size
        };
    }

    // Cleanup
    cleanup() {
        this.stories.clear();
        this.myStories.clear();
        this.storyViews.clear();
        this.storyReplies.clear();
        this.storyPrivacySettings.clear();
        this.viewedStories.clear();
        this.removeAllListeners();
    }
}

module.exports = WAStoryManager;