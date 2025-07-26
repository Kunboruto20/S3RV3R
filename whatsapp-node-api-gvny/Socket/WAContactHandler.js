const crypto = require('crypto');

class WAContactHandler {
    constructor(socket) {
        this.socket = socket;
        this.contactCache = new Map();
        this.profilePictureCache = new Map();
        this.statusCache = new Map();
        this.businessProfileCache = new Map();
        
        // Contact actions
        this.contactActions = {
            BLOCK: 'block',
            UNBLOCK: 'unblock',
            UPDATE: 'update',
            DELETE: 'delete'
        };
    }
    
    async getContact(jid) {
        try {
            // Check cache first
            if (this.contactCache.has(jid)) {
                return this.contactCache.get(jid);
            }
            
            const queryNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:profile',
                    to: jid
                },
                content: [{
                    tag: 'profile'
                }]
            };
            
            const response = await this.socket.query(queryNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to get contact');
            }
            
            const contact = this.parseContactInfo(response, jid);
            
            // Cache contact
            this.contactCache.set(jid, contact);
            
            return contact;
            
        } catch (error) {
            throw new Error(`Failed to get contact: ${error.message}`);
        }
    }
    
    async getProfilePicture(jid, type = 'image') {
        try {
            // Check cache first
            const cacheKey = `${jid}_${type}`;
            if (this.profilePictureCache.has(cacheKey)) {
                return this.profilePictureCache.get(cacheKey);
            }
            
            const pictureNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:profile:picture',
                    to: jid
                },
                content: [{
                    tag: 'picture',
                    attrs: {
                        type: type
                    }
                }]
            };
            
            const response = await this.socket.query(pictureNode);
            
            if (response.attrs?.type === 'error') {
                return null;
            }
            
            const pictureInfo = this.parseProfilePicture(response);
            
            // Cache picture info
            if (pictureInfo) {
                this.profilePictureCache.set(cacheKey, pictureInfo);
            }
            
            return pictureInfo;
            
        } catch (error) {
            this.socket.options.logger.error('Error getting profile picture:', error);
            return null;
        }
    }
    
    async updateProfilePicture(imageBuffer) {
        try {
            // Upload image first
            const uploadedImage = await this.socket.mediaHandler.uploadMedia(imageBuffer, 'image');
            
            const updateNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:profile:picture'
                },
                content: [{
                    tag: 'picture',
                    attrs: {
                        type: 'image'
                    },
                    content: uploadedImage.jpegThumbnail
                }]
            };
            
            const response = await this.socket.query(updateNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to update profile picture');
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to update profile picture: ${error.message}`);
        }
    }
    
    async getStatus(jid) {
        try {
            // Check cache first
            if (this.statusCache.has(jid)) {
                return this.statusCache.get(jid);
            }
            
            const statusNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'status',
                    to: jid
                },
                content: [{
                    tag: 'status'
                }]
            };
            
            const response = await this.socket.query(statusNode);
            
            if (response.attrs?.type === 'error') {
                return null;
            }
            
            const status = this.parseStatus(response);
            
            // Cache status
            if (status) {
                this.statusCache.set(jid, status);
            }
            
            return status;
            
        } catch (error) {
            this.socket.options.logger.error('Error getting status:', error);
            return null;
        }
    }
    
    async updateStatus(status) {
        try {
            const updateNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'status'
                },
                content: [{
                    tag: 'status',
                    content: status
                }]
            };
            
            const response = await this.socket.query(updateNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to update status');
            }
            
            // Update cache
            if (this.socket.user?.id) {
                this.statusCache.set(this.socket.user.id, { status, timestamp: Date.now() });
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to update status: ${error.message}`);
        }
    }
    
    async blockContact(jid) {
        try {
            const blockNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'blocklist'
                },
                content: [{
                    tag: 'item',
                    attrs: {
                        action: 'block',
                        jid: jid
                    }
                }]
            };
            
            const response = await this.socket.query(blockNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to block contact');
            }
            
            // Update blocklist
            this.socket.blocklist.add(jid);
            
            // Emit blocklist update
            this.socket.emit('blocklist.update', {
                blocklist: Array.from(this.socket.blocklist),
                type: 'add',
                jids: [jid]
            });
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to block contact: ${error.message}`);
        }
    }
    
    async unblockContact(jid) {
        try {
            const unblockNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'blocklist'
                },
                content: [{
                    tag: 'item',
                    attrs: {
                        action: 'unblock',
                        jid: jid
                    }
                }]
            };
            
            const response = await this.socket.query(unblockNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to unblock contact');
            }
            
            // Update blocklist
            this.socket.blocklist.delete(jid);
            
            // Emit blocklist update
            this.socket.emit('blocklist.update', {
                blocklist: Array.from(this.socket.blocklist),
                type: 'remove',
                jids: [jid]
            });
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to unblock contact: ${error.message}`);
        }
    }
    
    async getBusinessProfile(jid) {
        try {
            // Check cache first
            if (this.businessProfileCache.has(jid)) {
                return this.businessProfileCache.get(jid);
            }
            
            const businessNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:biz',
                    to: jid
                },
                content: [{
                    tag: 'business_profile'
                }]
            };
            
            const response = await this.socket.query(businessNode);
            
            if (response.attrs?.type === 'error') {
                return null;
            }
            
            const businessProfile = this.parseBusinessProfile(response);
            
            // Cache business profile
            if (businessProfile) {
                this.businessProfileCache.set(jid, businessProfile);
            }
            
            return businessProfile;
            
        } catch (error) {
            this.socket.options.logger.error('Error getting business profile:', error);
            return null;
        }
    }
    
    async getAllContacts() {
        try {
            const contactsNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:contacts'
                },
                content: [{
                    tag: 'contacts'
                }]
            };
            
            const response = await this.socket.query(contactsNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to get contacts');
            }
            
            const contacts = this.parseContactsList(response);
            
            // Cache all contacts
            for (const contact of contacts) {
                this.contactCache.set(contact.id, contact);
            }
            
            return contacts;
            
        } catch (error) {
            throw new Error(`Failed to get all contacts: ${error.message}`);
        }
    }
    
    async searchContacts(query) {
        try {
            const searchNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:contacts'
                },
                content: [{
                    tag: 'search',
                    attrs: {
                        query: query
                    }
                }]
            };
            
            const response = await this.socket.query(searchNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to search contacts');
            }
            
            return this.parseContactsList(response);
            
        } catch (error) {
            throw new Error(`Failed to search contacts: ${error.message}`);
        }
    }
    
    parseContactInfo(node, jid) {
        try {
            const attrs = node.attrs || {};
            const contact = {
                id: jid,
                name: '',
                notify: '',
                verifiedName: '',
                status: '',
                profilePictureUrl: null,
                isBlocked: this.socket.blocklist.has(jid),
                isBusiness: false,
                lastSeen: null
            };
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag) {
                        switch (child.tag) {
                            case 'name':
                                contact.name = child.content || '';
                                break;
                            case 'notify':
                                contact.notify = child.content || '';
                                break;
                            case 'verified_name':
                                contact.verifiedName = child.content || '';
                                break;
                            case 'status':
                                contact.status = child.content || '';
                                break;
                            case 'picture':
                                contact.profilePictureUrl = child.attrs?.url || null;
                                break;
                            case 'business':
                                contact.isBusiness = child.attrs?.verified === 'true';
                                break;
                        }
                    }
                }
            }
            
            return contact;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing contact info:', error);
            return {
                id: jid,
                name: '',
                notify: '',
                verifiedName: '',
                status: '',
                profilePictureUrl: null,
                isBlocked: false,
                isBusiness: false,
                lastSeen: null
            };
        }
    }
    
    parseProfilePicture(node) {
        try {
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'picture') {
                        return {
                            id: child.attrs?.id || '',
                            url: child.attrs?.url || '',
                            type: child.attrs?.type || 'image',
                            directPath: child.attrs?.direct_path || ''
                        };
                    }
                }
            }
            
            return null;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing profile picture:', error);
            return null;
        }
    }
    
    parseStatus(node) {
        try {
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'status') {
                        return {
                            status: child.content || '',
                            timestamp: parseInt(child.attrs?.t) * 1000 || Date.now()
                        };
                    }
                }
            }
            
            return null;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing status:', error);
            return null;
        }
    }
    
    parseBusinessProfile(node) {
        try {
            const businessProfile = {
                tag: '',
                description: '',
                category: '',
                email: '',
                website: '',
                address: '',
                verified: false
            };
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'business_profile') {
                        if (child.content && Array.isArray(child.content)) {
                            for (const profileChild of child.content) {
                                if (typeof profileChild === 'object' && profileChild.tag) {
                                    switch (profileChild.tag) {
                                        case 'tag':
                                            businessProfile.tag = profileChild.content || '';
                                            break;
                                        case 'description':
                                            businessProfile.description = profileChild.content || '';
                                            break;
                                        case 'category':
                                            businessProfile.category = profileChild.content || '';
                                            break;
                                        case 'email':
                                            businessProfile.email = profileChild.content || '';
                                            break;
                                        case 'website':
                                            businessProfile.website = profileChild.content || '';
                                            break;
                                        case 'address':
                                            businessProfile.address = profileChild.content || '';
                                            break;
                                        case 'verified':
                                            businessProfile.verified = profileChild.attrs?.value === 'true';
                                            break;
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
            }
            
            return businessProfile;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing business profile:', error);
            return null;
        }
    }
    
    parseContactsList(node) {
        try {
            const contacts = [];
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'contacts') {
                        if (child.content && Array.isArray(child.content)) {
                            for (const contactChild of child.content) {
                                if (typeof contactChild === 'object' && contactChild.tag === 'contact') {
                                    const contact = this.parseContactInfo(contactChild, contactChild.attrs?.jid || '');
                                    if (contact.id) {
                                        contacts.push(contact);
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
            }
            
            return contacts;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing contacts list:', error);
            return [];
        }
    }
    
    handleContactUpdate(node) {
        try {
            const attrs = node.attrs || {};
            const jid = attrs.from || attrs.jid;
            
            if (!jid) return;
            
            // Update contact in cache
            let contact = this.contactCache.get(jid);
            if (!contact) {
                contact = {
                    id: jid,
                    name: '',
                    notify: '',
                    verifiedName: '',
                    status: '',
                    profilePictureUrl: null,
                    isBlocked: false,
                    isBusiness: false,
                    lastSeen: null
                };
            }
            
            // Parse updates
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag) {
                        switch (child.tag) {
                            case 'name':
                                contact.name = child.content || '';
                                break;
                            case 'notify':
                                contact.notify = child.content || '';
                                break;
                            case 'status':
                                contact.status = child.content || '';
                                break;
                            case 'picture':
                                contact.profilePictureUrl = child.attrs?.url || null;
                                break;
                        }
                    }
                }
            }
            
            // Update cache
            this.contactCache.set(jid, contact);
            
            // Emit contact update
            this.socket.emit('contacts.update', [contact]);
            
        } catch (error) {
            this.socket.options.logger.error('Error handling contact update:', error);
        }
    }
    
    generateId() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }
    
    isBusinessJid(jid) {
        return jid && jid.includes('@business');
    }
    
    formatJid(number) {
        // Remove any non-digit characters except +
        const cleaned = number.replace(/[^\d+]/g, '');
        
        // Add country code if missing
        if (!cleaned.startsWith('+')) {
            // This is a simplified approach - in reality you'd need proper country code detection
            return `${cleaned}@s.whatsapp.net`;
        }
        
        return `${cleaned.substring(1)}@s.whatsapp.net`;
    }
    
    clearCache() {
        this.contactCache.clear();
        this.profilePictureCache.clear();
        this.statusCache.clear();
        this.businessProfileCache.clear();
    }
    
    getCachedContact(jid) {
        return this.contactCache.get(jid);
    }
    
    getCachedContacts() {
        return Array.from(this.contactCache.values());
    }
}

module.exports = WAContactHandler;