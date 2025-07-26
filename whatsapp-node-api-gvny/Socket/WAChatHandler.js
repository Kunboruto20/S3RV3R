const crypto = require('crypto');

class WAChatHandler {
    constructor(socket) {
        this.socket = socket;
        this.chatCache = new Map();
        this.messageCache = new Map();
        this.chatSettings = new Map();
        
        // Chat types
        this.chatTypes = {
            PRIVATE: 'private',
            GROUP: 'group',
            BROADCAST: 'broadcast',
            STATUS: 'status'
        };
        
        // Chat actions
        this.chatActions = {
            ARCHIVE: 'archive',
            UNARCHIVE: 'unarchive',
            PIN: 'pin',
            UNPIN: 'unpin',
            MUTE: 'mute',
            UNMUTE: 'unmute',
            DELETE: 'delete',
            CLEAR: 'clear',
            MARK_READ: 'read',
            MARK_UNREAD: 'unread'
        };
    }
    
    async getChats(limit = 50, offset = 0) {
        try {
            const chatsNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:chat'
                },
                content: [{
                    tag: 'chats',
                    attrs: {
                        limit: limit.toString(),
                        offset: offset.toString()
                    }
                }]
            };
            
            const response = await this.socket.query(chatsNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to get chats');
            }
            
            const chats = this.parseChatsResponse(response);
            
            // Cache chats
            for (const chat of chats) {
                this.chatCache.set(chat.id, chat);
                this.socket.chats.set(chat.id, chat);
            }
            
            return chats;
            
        } catch (error) {
            throw new Error(`Failed to get chats: ${error.message}`);
        }
    }
    
    async getChat(jid) {
        try {
            // Check cache first
            if (this.chatCache.has(jid)) {
                return this.chatCache.get(jid);
            }
            
            const chatNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:chat',
                    to: jid
                },
                content: [{
                    tag: 'chat'
                }]
            };
            
            const response = await this.socket.query(chatNode);
            
            if (response.attrs?.type === 'error') {
                return null;
            }
            
            const chat = this.parseChatInfo(response, jid);
            
            // Cache chat
            if (chat) {
                this.chatCache.set(jid, chat);
                this.socket.chats.set(jid, chat);
            }
            
            return chat;
            
        } catch (error) {
            this.socket.options.logger.error('Error getting chat:', error);
            return null;
        }
    }
    
    async getMessages(jid, limit = 50, before = null) {
        try {
            const messagesNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:sync:history',
                    to: jid
                },
                content: [{
                    tag: 'history',
                    attrs: {
                        count: limit.toString(),
                        before: before || undefined
                    }
                }]
            };
            
            const response = await this.socket.query(messagesNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to get messages');
            }
            
            const messages = this.parseMessagesResponse(response);
            
            // Cache messages
            for (const message of messages) {
                this.messageCache.set(message.key.id, message);
                this.socket.messages.set(message.key.id, message);
            }
            
            return messages;
            
        } catch (error) {
            throw new Error(`Failed to get messages: ${error.message}`);
        }
    }
    
    async markAsRead(jid, messageIds = []) {
        try {
            const readNode = {
                tag: 'receipt',
                attrs: {
                    to: jid,
                    type: 'read',
                    t: Math.floor(Date.now() / 1000).toString()
                }
            };
            
            if (messageIds.length > 0) {
                readNode.content = messageIds.map(id => ({
                    tag: 'item',
                    attrs: { id }
                }));
            }
            
            await this.socket.sendNode(readNode);
            
            // Update chat unread count
            const chat = this.chatCache.get(jid);
            if (chat) {
                chat.unreadCount = 0;
                this.socket.emit('chats.update', [chat]);
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to mark as read: ${error.message}`);
        }
    }
    
    async markAsUnread(jid) {
        try {
            const unreadNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:chat',
                    to: jid
                },
                content: [{
                    tag: 'mark',
                    attrs: {
                        type: 'unread'
                    }
                }]
            };
            
            const response = await this.socket.query(unreadNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to mark as unread');
            }
            
            // Update chat
            const chat = this.chatCache.get(jid);
            if (chat) {
                chat.unreadCount = 1; // Set to 1 as default
                this.socket.emit('chats.update', [chat]);
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to mark as unread: ${error.message}`);
        }
    }
    
    async archiveChat(jid) {
        try {
            const archiveNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:chat',
                    to: jid
                },
                content: [{
                    tag: 'archive',
                    attrs: {
                        value: 'true'
                    }
                }]
            };
            
            const response = await this.socket.query(archiveNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to archive chat');
            }
            
            // Update chat
            const chat = this.chatCache.get(jid);
            if (chat) {
                chat.archived = true;
                this.socket.emit('chats.update', [chat]);
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to archive chat: ${error.message}`);
        }
    }
    
    async unarchiveChat(jid) {
        try {
            const unarchiveNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:chat',
                    to: jid
                },
                content: [{
                    tag: 'archive',
                    attrs: {
                        value: 'false'
                    }
                }]
            };
            
            const response = await this.socket.query(unarchiveNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to unarchive chat');
            }
            
            // Update chat
            const chat = this.chatCache.get(jid);
            if (chat) {
                chat.archived = false;
                this.socket.emit('chats.update', [chat]);
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to unarchive chat: ${error.message}`);
        }
    }
    
    async pinChat(jid) {
        try {
            const pinNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:chat',
                    to: jid
                },
                content: [{
                    tag: 'pin',
                    attrs: {
                        value: 'true'
                    }
                }]
            };
            
            const response = await this.socket.query(pinNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to pin chat');
            }
            
            // Update chat
            const chat = this.chatCache.get(jid);
            if (chat) {
                chat.pinned = true;
                this.socket.emit('chats.update', [chat]);
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to pin chat: ${error.message}`);
        }
    }
    
    async unpinChat(jid) {
        try {
            const unpinNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:chat',
                    to: jid
                },
                content: [{
                    tag: 'pin',
                    attrs: {
                        value: 'false'
                    }
                }]
            };
            
            const response = await this.socket.query(unpinNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to unpin chat');
            }
            
            // Update chat
            const chat = this.chatCache.get(jid);
            if (chat) {
                chat.pinned = false;
                this.socket.emit('chats.update', [chat]);
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to unpin chat: ${error.message}`);
        }
    }
    
    async muteChat(jid, duration = 0) {
        try {
            const muteNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:chat',
                    to: jid
                },
                content: [{
                    tag: 'mute',
                    attrs: {
                        duration: duration.toString()
                    }
                }]
            };
            
            const response = await this.socket.query(muteNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to mute chat');
            }
            
            // Update chat
            const chat = this.chatCache.get(jid);
            if (chat) {
                chat.muted = duration === 0 ? -1 : Date.now() + (duration * 1000);
                this.socket.emit('chats.update', [chat]);
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to mute chat: ${error.message}`);
        }
    }
    
    async unmuteChat(jid) {
        try {
            const unmuteNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:chat',
                    to: jid
                },
                content: [{
                    tag: 'mute',
                    attrs: {
                        duration: '0'
                    }
                }]
            };
            
            const response = await this.socket.query(unmuteNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to unmute chat');
            }
            
            // Update chat
            const chat = this.chatCache.get(jid);
            if (chat) {
                chat.muted = null;
                this.socket.emit('chats.update', [chat]);
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to unmute chat: ${error.message}`);
        }
    }
    
    async deleteChat(jid) {
        try {
            const deleteNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:chat',
                    to: jid
                },
                content: [{
                    tag: 'delete'
                }]
            };
            
            const response = await this.socket.query(deleteNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to delete chat');
            }
            
            // Remove from cache
            this.chatCache.delete(jid);
            this.socket.chats.delete(jid);
            
            // Emit delete event
            this.socket.emit('chats.delete', [jid]);
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to delete chat: ${error.message}`);
        }
    }
    
    async clearChat(jid, keepStarred = false) {
        try {
            const clearNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:chat',
                    to: jid
                },
                content: [{
                    tag: 'clear',
                    attrs: {
                        keepStarred: keepStarred ? 'true' : 'false'
                    }
                }]
            };
            
            const response = await this.socket.query(clearNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to clear chat');
            }
            
            // Update chat
            const chat = this.chatCache.get(jid);
            if (chat) {
                chat.lastMessageTime = 0;
                chat.unreadCount = 0;
                this.socket.emit('chats.update', [chat]);
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to clear chat: ${error.message}`);
        }
    }
    
    async searchMessages(query, jid = null, limit = 50) {
        try {
            const searchNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:search'
                },
                content: [{
                    tag: 'search',
                    attrs: {
                        query: query,
                        jid: jid || undefined,
                        limit: limit.toString()
                    }
                }]
            };
            
            const response = await this.socket.query(searchNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to search messages');
            }
            
            return this.parseSearchResponse(response);
            
        } catch (error) {
            throw new Error(`Failed to search messages: ${error.message}`);
        }
    }
    
    handleChatState(node) {
        try {
            const attrs = node.attrs || {};
            const from = attrs.from;
            const participant = attrs.participant;
            
            if (!from) return;
            
            // Update chat with typing indicator
            const chat = this.chatCache.get(from);
            if (chat) {
                // Handle typing state in presence handler
                this.socket.presence.handleChatState(node);
            }
            
        } catch (error) {
            this.socket.options.logger.error('Error handling chat state:', error);
        }
    }
    
    parseChatsResponse(node) {
        try {
            const chats = [];
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'chats') {
                        if (child.content && Array.isArray(child.content)) {
                            for (const chatChild of child.content) {
                                if (typeof chatChild === 'object' && chatChild.tag === 'chat') {
                                    const chat = this.parseChatInfo(chatChild);
                                    if (chat) {
                                        chats.push(chat);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            return chats;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing chats response:', error);
            return [];
        }
    }
    
    parseChatInfo(node, jid = null) {
        try {
            const attrs = node.attrs || {};
            const chatId = jid || attrs.jid || attrs.from;
            
            if (!chatId) return null;
            
            const chat = {
                id: chatId,
                name: attrs.name || '',
                unreadCount: parseInt(attrs.count) || 0,
                lastMessageTime: parseInt(attrs.t) * 1000 || 0,
                pinned: attrs.pin === '1' || attrs.pinned === 'true',
                archived: attrs.archive === 'true',
                muted: attrs.mute ? (attrs.mute === '-1' ? -1 : parseInt(attrs.mute) * 1000) : null,
                type: this.determineChatType(chatId),
                ephemeralExpiration: parseInt(attrs.ephemeral) || 0,
                ephemeralSettingTimestamp: parseInt(attrs.ephemeralSettingTimestamp) || 0
            };
            
            // Parse additional chat data
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag) {
                        switch (child.tag) {
                            case 'subject':
                                chat.subject = child.content || '';
                                break;
                            case 'description':
                                chat.description = child.content || '';
                                break;
                            case 'picture':
                                chat.pictureUrl = child.attrs?.url || null;
                                break;
                        }
                    }
                }
            }
            
            return chat;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing chat info:', error);
            return null;
        }
    }
    
    parseMessagesResponse(node) {
        try {
            const messages = [];
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'history') {
                        if (child.content && Array.isArray(child.content)) {
                            for (const messageChild of child.content) {
                                if (typeof messageChild === 'object' && messageChild.tag === 'message') {
                                    const message = this.socket.messageHandler.parseMessageNode(messageChild);
                                    if (message) {
                                        messages.push(message);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            return messages;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing messages response:', error);
            return [];
        }
    }
    
    parseSearchResponse(node) {
        try {
            const results = [];
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'search') {
                        if (child.content && Array.isArray(child.content)) {
                            for (const resultChild of child.content) {
                                if (typeof resultChild === 'object' && resultChild.tag === 'result') {
                                    const result = {
                                        jid: resultChild.attrs?.jid || '',
                                        messageId: resultChild.attrs?.id || '',
                                        timestamp: parseInt(resultChild.attrs?.t) * 1000 || 0,
                                        snippet: resultChild.content || ''
                                    };
                                    results.push(result);
                                }
                            }
                        }
                    }
                }
            }
            
            return results;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing search response:', error);
            return [];
        }
    }
    
    determineChatType(jid) {
        if (jid.includes('@g.us')) {
            return this.chatTypes.GROUP;
        } else if (jid.includes('@broadcast')) {
            return this.chatTypes.BROADCAST;
        } else if (jid.includes('@status')) {
            return this.chatTypes.STATUS;
        } else {
            return this.chatTypes.PRIVATE;
        }
    }
    
    generateId() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }
    
    getCachedChat(jid) {
        return this.chatCache.get(jid);
    }
    
    getCachedChats() {
        return Array.from(this.chatCache.values());
    }
    
    getCachedMessages(jid) {
        const messages = [];
        for (const [messageId, message] of this.messageCache) {
            if (message.key.remoteJid === jid) {
                messages.push(message);
            }
        }
        return messages.sort((a, b) => b.messageTimestamp - a.messageTimestamp);
    }
    
    updateChatLastMessage(jid, messageTimestamp) {
        const chat = this.chatCache.get(jid);
        if (chat && messageTimestamp > chat.lastMessageTime) {
            chat.lastMessageTime = messageTimestamp;
            this.socket.emit('chats.update', [chat]);
        }
    }
    
    incrementUnreadCount(jid) {
        const chat = this.chatCache.get(jid);
        if (chat) {
            chat.unreadCount++;
            this.socket.emit('chats.update', [chat]);
        }
    }
    
    clearCache() {
        this.chatCache.clear();
        this.messageCache.clear();
        this.chatSettings.clear();
    }
    
    getChatStats() {
        const stats = {
            totalChats: this.chatCache.size,
            privateChats: 0,
            groupChats: 0,
            archivedChats: 0,
            pinnedChats: 0,
            mutedChats: 0,
            unreadChats: 0,
            totalMessages: this.messageCache.size
        };
        
        for (const chat of this.chatCache.values()) {
            if (chat.type === this.chatTypes.PRIVATE) stats.privateChats++;
            if (chat.type === this.chatTypes.GROUP) stats.groupChats++;
            if (chat.archived) stats.archivedChats++;
            if (chat.pinned) stats.pinnedChats++;
            if (chat.muted) stats.mutedChats++;
            if (chat.unreadCount > 0) stats.unreadChats++;
        }
        
        return stats;
    }
}

module.exports = WAChatHandler;