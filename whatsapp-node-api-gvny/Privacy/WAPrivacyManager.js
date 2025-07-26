const EventEmitter = require('events');

/**
 * WhatsApp Privacy Manager
 * Handles all privacy settings and controls for WhatsApp
 */
class WAPrivacyManager extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enablePrivacyControls: options.enablePrivacyControls !== false,
            enableBlocklist: options.enableBlocklist !== false,
            enableReadReceipts: options.enableReadReceipts !== false,
            enableTypingIndicators: options.enableTypingIndicators !== false,
            enableOnlineStatus: options.enableOnlineStatus !== false,
            enableProfilePhotoPrivacy: options.enableProfilePhotoPrivacy !== false,
            enableStatusPrivacy: options.enableStatusPrivacy !== false,
            enableGroupPrivacy: options.enableGroupPrivacy !== false,
            enableCallPrivacy: options.enableCallPrivacy !== false,
            ...options
        };

        // Privacy data stores
        this.privacySettings = new Map();
        this.blockedContacts = new Set();
        this.restrictedContacts = new Map();
        this.privacyLists = new Map();
        
        // Privacy levels
        this.privacyLevels = {
            EVERYONE: 'everyone',
            CONTACTS: 'contacts',
            CONTACTS_EXCEPT: 'contacts_except',
            NOBODY: 'nobody',
            SELECTED_CONTACTS: 'selected_contacts'
        };

        // Privacy categories
        this.privacyCategories = {
            LAST_SEEN: 'last_seen',
            PROFILE_PHOTO: 'profile_photo',
            ABOUT: 'about',
            STATUS: 'status',
            READ_RECEIPTS: 'read_receipts',
            GROUPS: 'groups',
            LIVE_LOCATION: 'live_location',
            CALLS: 'calls',
            DISAPPEARING_MESSAGES: 'disappearing_messages'
        };

        // Default privacy settings
        this.defaultSettings = {
            [this.privacyCategories.LAST_SEEN]: {
                level: this.privacyLevels.EVERYONE,
                exceptions: []
            },
            [this.privacyCategories.PROFILE_PHOTO]: {
                level: this.privacyLevels.EVERYONE,
                exceptions: []
            },
            [this.privacyCategories.ABOUT]: {
                level: this.privacyLevels.EVERYONE,
                exceptions: []
            },
            [this.privacyCategories.STATUS]: {
                level: this.privacyLevels.CONTACTS,
                exceptions: []
            },
            [this.privacyCategories.READ_RECEIPTS]: {
                level: this.privacyLevels.EVERYONE,
                enabled: true
            },
            [this.privacyCategories.GROUPS]: {
                level: this.privacyLevels.EVERYONE,
                exceptions: []
            },
            [this.privacyCategories.LIVE_LOCATION]: {
                level: this.privacyLevels.NOBODY,
                exceptions: []
            },
            [this.privacyCategories.CALLS]: {
                level: this.privacyLevels.EVERYONE,
                exceptions: []
            },
            [this.privacyCategories.DISAPPEARING_MESSAGES]: {
                defaultTimer: 0,
                enforceTimer: false
            }
        };

        this.initialize();
    }

    async initialize() {
        try {
            await this.loadPrivacySettings();
            await this.loadBlockedContacts();
            this.setupSocketEventHandlers();
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        // Privacy setting updates
        this.socket.on('privacy.update', (update) => {
            this.handlePrivacyUpdate(update);
        });

        // Blocked contact updates
        this.socket.on('blocklist.update', (update) => {
            this.handleBlocklistUpdate(update);
        });
    }

    // Privacy settings management
    async updatePrivacySetting(category, settings) {
        try {
            if (!Object.values(this.privacyCategories).includes(category)) {
                throw new Error(`Invalid privacy category: ${category}`);
            }

            if (settings.level && !Object.values(this.privacyLevels).includes(settings.level)) {
                throw new Error(`Invalid privacy level: ${settings.level}`);
            }

            // Get current settings
            const currentSettings = this.privacySettings.get(category) || this.defaultSettings[category];
            const updatedSettings = { ...currentSettings, ...settings };

            // Send privacy update request
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'privacy'
                },
                content: [{
                    tag: 'privacy',
                    attrs: {},
                    content: [{
                        tag: category,
                        attrs: {},
                        content: this.encodePrivacySetting(updatedSettings)
                    }]
                }]
            });

            if (response.attrs.type === 'result') {
                this.privacySettings.set(category, updatedSettings);
                this.emit('privacy.setting.updated', { category, settings: updatedSettings });
                return updatedSettings;
            } else {
                throw new Error('Failed to update privacy setting');
            }
        } catch (error) {
            throw new Error(`Privacy setting update failed: ${error.message}`);
        }
    }

    // Last seen privacy
    async setLastSeenPrivacy(level, exceptions = []) {
        return await this.updatePrivacySetting(this.privacyCategories.LAST_SEEN, {
            level: level,
            exceptions: exceptions
        });
    }

    // Profile photo privacy
    async setProfilePhotoPrivacy(level, exceptions = []) {
        return await this.updatePrivacySetting(this.privacyCategories.PROFILE_PHOTO, {
            level: level,
            exceptions: exceptions
        });
    }

    // About privacy
    async setAboutPrivacy(level, exceptions = []) {
        return await this.updatePrivacySetting(this.privacyCategories.ABOUT, {
            level: level,
            exceptions: exceptions
        });
    }

    // Status privacy
    async setStatusPrivacy(level, exceptions = []) {
        return await this.updatePrivacySetting(this.privacyCategories.STATUS, {
            level: level,
            exceptions: exceptions
        });
    }

    // Read receipts
    async setReadReceiptsEnabled(enabled) {
        return await this.updatePrivacySetting(this.privacyCategories.READ_RECEIPTS, {
            enabled: enabled
        });
    }

    // Group privacy
    async setGroupPrivacy(level, exceptions = []) {
        return await this.updatePrivacySetting(this.privacyCategories.GROUPS, {
            level: level,
            exceptions: exceptions
        });
    }

    // Live location privacy
    async setLiveLocationPrivacy(level, exceptions = []) {
        return await this.updatePrivacySetting(this.privacyCategories.LIVE_LOCATION, {
            level: level,
            exceptions: exceptions
        });
    }

    // Call privacy
    async setCallPrivacy(level, exceptions = []) {
        return await this.updatePrivacySetting(this.privacyCategories.CALLS, {
            level: level,
            exceptions: exceptions
        });
    }

    // Disappearing messages
    async setDisappearingMessagesDefault(timer, enforceTimer = false) {
        return await this.updatePrivacySetting(this.privacyCategories.DISAPPEARING_MESSAGES, {
            defaultTimer: timer,
            enforceTimer: enforceTimer
        });
    }

    // Block management
    async blockContact(jid, reason = null) {
        try {
            if (this.blockedContacts.has(jid)) {
                return false; // Already blocked
            }

            // Send block request
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
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
            });

            if (response.attrs.type === 'result') {
                this.blockedContacts.add(jid);
                this.emit('contact.blocked', { jid, reason });
                return true;
            } else {
                throw new Error('Failed to block contact');
            }
        } catch (error) {
            throw new Error(`Contact blocking failed: ${error.message}`);
        }
    }

    async unblockContact(jid) {
        try {
            if (!this.blockedContacts.has(jid)) {
                return false; // Not blocked
            }

            // Send unblock request
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
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
            });

            if (response.attrs.type === 'result') {
                this.blockedContacts.delete(jid);
                this.emit('contact.unblocked', { jid });
                return true;
            } else {
                throw new Error('Failed to unblock contact');
            }
        } catch (error) {
            throw new Error(`Contact unblocking failed: ${error.message}`);
        }
    }

    // Restricted contacts (for specific features)
    async restrictContact(jid, restrictions) {
        try {
            const currentRestrictions = this.restrictedContacts.get(jid) || {};
            const updatedRestrictions = { ...currentRestrictions, ...restrictions };

            this.restrictedContacts.set(jid, updatedRestrictions);
            this.emit('contact.restricted', { jid, restrictions: updatedRestrictions });
            return updatedRestrictions;
        } catch (error) {
            throw new Error(`Contact restriction failed: ${error.message}`);
        }
    }

    async unrestrict Contact(jid, restrictionTypes = null) {
        try {
            if (!this.restrictedContacts.has(jid)) {
                return false;
            }

            if (restrictionTypes === null) {
                // Remove all restrictions
                this.restrictedContacts.delete(jid);
                this.emit('contact.unrestricted', { jid, restrictions: null });
                return true;
            } else {
                // Remove specific restrictions
                const currentRestrictions = this.restrictedContacts.get(jid);
                restrictionTypes.forEach(type => {
                    delete currentRestrictions[type];
                });

                if (Object.keys(currentRestrictions).length === 0) {
                    this.restrictedContacts.delete(jid);
                } else {
                    this.restrictedContacts.set(jid, currentRestrictions);
                }

                this.emit('contact.unrestricted', { jid, restrictions: restrictionTypes });
                return true;
            }
        } catch (error) {
            throw new Error(`Contact unrestriction failed: ${error.message}`);
        }
    }

    // Privacy lists (custom contact groups for privacy)
    async createPrivacyList(name, contacts = []) {
        try {
            const privacyList = {
                id: this.generatePrivacyListId(),
                name: name,
                contacts: [...new Set(contacts)], // Remove duplicates
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            this.privacyLists.set(privacyList.id, privacyList);
            this.emit('privacy.list.created', privacyList);
            return privacyList;
        } catch (error) {
            throw new Error(`Privacy list creation failed: ${error.message}`);
        }
    }

    async updatePrivacyList(listId, updates) {
        try {
            const privacyList = this.privacyLists.get(listId);
            if (!privacyList) {
                throw new Error('Privacy list not found');
            }

            const updatedList = {
                ...privacyList,
                ...updates,
                updatedAt: new Date().toISOString()
            };

            // Remove duplicates from contacts if updated
            if (updates.contacts) {
                updatedList.contacts = [...new Set(updates.contacts)];
            }

            this.privacyLists.set(listId, updatedList);
            this.emit('privacy.list.updated', updatedList);
            return updatedList;
        } catch (error) {
            throw new Error(`Privacy list update failed: ${error.message}`);
        }
    }

    async deletePrivacyList(listId) {
        try {
            const privacyList = this.privacyLists.get(listId);
            if (!privacyList) {
                throw new Error('Privacy list not found');
            }

            this.privacyLists.delete(listId);
            this.emit('privacy.list.deleted', { listId, privacyList });
            return true;
        } catch (error) {
            throw new Error(`Privacy list deletion failed: ${error.message}`);
        }
    }

    // Privacy checks
    canViewLastSeen(viewerJid) {
        return this.checkPrivacyAccess(this.privacyCategories.LAST_SEEN, viewerJid);
    }

    canViewProfilePhoto(viewerJid) {
        return this.checkPrivacyAccess(this.privacyCategories.PROFILE_PHOTO, viewerJid);
    }

    canViewAbout(viewerJid) {
        return this.checkPrivacyAccess(this.privacyCategories.ABOUT, viewerJid);
    }

    canViewStatus(viewerJid) {
        return this.checkPrivacyAccess(this.privacyCategories.STATUS, viewerJid);
    }

    canAddToGroup(viewerJid) {
        return this.checkPrivacyAccess(this.privacyCategories.GROUPS, viewerJid);
    }

    canCall(viewerJid) {
        return this.checkPrivacyAccess(this.privacyCategories.CALLS, viewerJid);
    }

    checkPrivacyAccess(category, viewerJid) {
        if (this.blockedContacts.has(viewerJid)) {
            return false;
        }

        const settings = this.privacySettings.get(category) || this.defaultSettings[category];
        
        switch (settings.level) {
            case this.privacyLevels.EVERYONE:
                return !settings.exceptions.includes(viewerJid);
            
            case this.privacyLevels.CONTACTS:
                // Would need to check if viewerJid is in contacts
                return !settings.exceptions.includes(viewerJid);
            
            case this.privacyLevels.CONTACTS_EXCEPT:
                return !settings.exceptions.includes(viewerJid);
            
            case this.privacyLevels.SELECTED_CONTACTS:
                return settings.exceptions.includes(viewerJid);
            
            case this.privacyLevels.NOBODY:
                return false;
            
            default:
                return false;
        }
    }

    // Two-step verification
    async enableTwoStepVerification(pin, email = null) {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: '2sv'
                },
                content: [{
                    tag: 'enable',
                    attrs: {},
                    content: [
                        { tag: 'pin', attrs: {}, content: pin },
                        ...(email ? [{ tag: 'email', attrs: {}, content: email }] : [])
                    ]
                }]
            });

            if (response.attrs.type === 'result') {
                this.emit('two.step.enabled', { email });
                return true;
            } else {
                throw new Error('Failed to enable two-step verification');
            }
        } catch (error) {
            throw new Error(`Two-step verification setup failed: ${error.message}`);
        }
    }

    async disableTwoStepVerification(pin) {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: '2sv'
                },
                content: [{
                    tag: 'disable',
                    attrs: {},
                    content: [
                        { tag: 'pin', attrs: {}, content: pin }
                    ]
                }]
            });

            if (response.attrs.type === 'result') {
                this.emit('two.step.disabled');
                return true;
            } else {
                throw new Error('Failed to disable two-step verification');
            }
        } catch (error) {
            throw new Error(`Two-step verification disable failed: ${error.message}`);
        }
    }

    async changeTwoStepPin(currentPin, newPin) {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: '2sv'
                },
                content: [{
                    tag: 'change_pin',
                    attrs: {},
                    content: [
                        { tag: 'current_pin', attrs: {}, content: currentPin },
                        { tag: 'new_pin', attrs: {}, content: newPin }
                    ]
                }]
            });

            if (response.attrs.type === 'result') {
                this.emit('two.step.pin.changed');
                return true;
            } else {
                throw new Error('Failed to change two-step verification PIN');
            }
        } catch (error) {
            throw new Error(`Two-step verification PIN change failed: ${error.message}`);
        }
    }

    // Event handlers
    handlePrivacyUpdate(update) {
        if (update.category && update.settings) {
            this.privacySettings.set(update.category, update.settings);
            this.emit('privacy.setting.updated', update);
        }
    }

    handleBlocklistUpdate(update) {
        if (update.action === 'block' && update.jid) {
            this.blockedContacts.add(update.jid);
            this.emit('contact.blocked', update);
        } else if (update.action === 'unblock' && update.jid) {
            this.blockedContacts.delete(update.jid);
            this.emit('contact.unblocked', update);
        }
    }

    // Utility methods
    encodePrivacySetting(settings) {
        const content = [];
        
        if (settings.level) {
            content.push({ tag: 'level', attrs: {}, content: settings.level });
        }
        
        if (settings.exceptions && settings.exceptions.length > 0) {
            content.push({
                tag: 'exceptions',
                attrs: {},
                content: settings.exceptions.map(jid => ({
                    tag: 'jid',
                    attrs: {},
                    content: jid
                }))
            });
        }
        
        if (settings.enabled !== undefined) {
            content.push({ tag: 'enabled', attrs: {}, content: settings.enabled.toString() });
        }
        
        if (settings.defaultTimer !== undefined) {
            content.push({ tag: 'default_timer', attrs: {}, content: settings.defaultTimer.toString() });
        }
        
        if (settings.enforceTimer !== undefined) {
            content.push({ tag: 'enforce_timer', attrs: {}, content: settings.enforceTimer.toString() });
        }
        
        return content;
    }

    async loadPrivacySettings() {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'privacy'
                },
                content: [{
                    tag: 'privacy',
                    attrs: {}
                }]
            });

            if (response.content) {
                for (const settingNode of response.content) {
                    if (settingNode.tag && Object.values(this.privacyCategories).includes(settingNode.tag)) {
                        const settings = this.decodePrivacySetting(settingNode);
                        this.privacySettings.set(settingNode.tag, settings);
                    }
                }
                this.emit('privacy.settings.loaded', Object.fromEntries(this.privacySettings));
            }
        } catch (error) {
            console.error('Failed to load privacy settings:', error);
        }
    }

    async loadBlockedContacts() {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'blocklist'
                },
                content: [{
                    tag: 'blocklist',
                    attrs: {}
                }]
            });

            if (response.content) {
                for (const itemNode of response.content) {
                    if (itemNode.tag === 'item' && itemNode.attrs.jid) {
                        this.blockedContacts.add(itemNode.attrs.jid);
                    }
                }
                this.emit('blocklist.loaded', Array.from(this.blockedContacts));
            }
        } catch (error) {
            console.error('Failed to load blocked contacts:', error);
        }
    }

    decodePrivacySetting(node) {
        const settings = {};
        
        if (node.content) {
            for (const child of node.content) {
                switch (child.tag) {
                    case 'level':
                        settings.level = child.content;
                        break;
                    case 'exceptions':
                        settings.exceptions = child.content ? 
                            child.content.map(jidNode => jidNode.content) : [];
                        break;
                    case 'enabled':
                        settings.enabled = child.content === 'true';
                        break;
                    case 'default_timer':
                        settings.defaultTimer = parseInt(child.content);
                        break;
                    case 'enforce_timer':
                        settings.enforceTimer = child.content === 'true';
                        break;
                }
            }
        }
        
        return settings;
    }

    generatePrivacyListId() {
        return `privlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Getters
    getPrivacySetting(category) {
        return this.privacySettings.get(category) || this.defaultSettings[category];
    }

    getAllPrivacySettings() {
        const settings = {};
        for (const category of Object.values(this.privacyCategories)) {
            settings[category] = this.getPrivacySetting(category);
        }
        return settings;
    }

    getBlockedContacts() {
        return Array.from(this.blockedContacts);
    }

    getRestrictedContacts() {
        return Object.fromEntries(this.restrictedContacts);
    }

    getPrivacyLists() {
        return Array.from(this.privacyLists.values());
    }

    getPrivacyList(listId) {
        return this.privacyLists.get(listId);
    }

    isContactBlocked(jid) {
        return this.blockedContacts.has(jid);
    }

    isContactRestricted(jid, restrictionType = null) {
        const restrictions = this.restrictedContacts.get(jid);
        if (!restrictions) return false;
        
        if (restrictionType) {
            return restrictions.hasOwnProperty(restrictionType);
        }
        
        return Object.keys(restrictions).length > 0;
    }

    // Statistics
    getPrivacyStats() {
        return {
            blockedContacts: this.blockedContacts.size,
            restrictedContacts: this.restrictedContacts.size,
            privacyLists: this.privacyLists.size,
            privacySettings: this.privacySettings.size
        };
    }

    // Cleanup
    cleanup() {
        this.privacySettings.clear();
        this.blockedContacts.clear();
        this.restrictedContacts.clear();
        this.privacyLists.clear();
        this.removeAllListeners();
    }
}

module.exports = WAPrivacyManager;