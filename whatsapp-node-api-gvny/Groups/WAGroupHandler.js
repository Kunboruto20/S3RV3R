const EventEmitter = require('events');

/**
 * WhatsApp Group Handler
 * Handles group-related events and operations
 */
class WAGroupHandler extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableGroupHandling: options.enableGroupHandling !== false,
            autoAcceptInvites: options.autoAcceptInvites || false,
            ...options
        };

        this.groupCache = new Map();
        
        this.initialize();
    }

    initialize() {
        this.setupEventHandlers();
        this.emit('ready');
    }

    setupEventHandlers() {
        this.socket.on('groups.update', (groups) => {
            groups.forEach(group => this.handleGroupUpdate(group));
        });

        this.socket.on('group-participants.update', (update) => {
            this.handleParticipantUpdate(update);
        });
    }

    async handleGroupUpdate(group) {
        try {
            this.groupCache.set(group.id, group);
            this.emit('group:updated', group);
        } catch (error) {
            this.emit('group:error', { group, error });
        }
    }

    async handleParticipantUpdate(update) {
        try {
            const group = this.groupCache.get(update.id);
            if (group) {
                // Update participants in cache
                if (update.participants) {
                    group.participants = update.participants;
                }
                this.groupCache.set(update.id, group);
            }
            
            this.emit('group:participants:updated', update);
        } catch (error) {
            this.emit('group:error', { update, error });
        }
    }

    async getGroupMetadata(groupId) {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'query',
                    attrs: {},
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            const metadata = this.parseGroupMetadata(result);
            
            this.groupCache.set(groupId, metadata);
            this.emit('group:metadata:fetched', metadata);
            
            return metadata;
        } catch (error) {
            this.emit('group:error', { groupId, error });
            throw error;
        }
    }

    parseGroupMetadata(result) {
        // Parse group metadata from WhatsApp response
        return {
            id: result.attrs?.from,
            subject: result.content?.find(c => c.tag === 'subject')?.content,
            creation: result.content?.find(c => c.tag === 'creation')?.attrs?.t,
            participants: result.content?.filter(c => c.tag === 'participant') || []
        };
    }

    getGroupFromCache(groupId) {
        return this.groupCache.get(groupId);
    }

    getAllGroupsFromCache() {
        return Array.from(this.groupCache.values());
    }

    clearCache() {
        this.groupCache.clear();
        this.emit('group:cache:cleared');
    }
}

module.exports = WAGroupHandler;