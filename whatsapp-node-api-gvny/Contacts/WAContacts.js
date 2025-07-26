const EventEmitter = require('events');

/**
 * WhatsApp Contacts Manager
 * Handles contact operations including management, synchronization, and organization
 */
class WAContacts extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableAutoSync: options.enableAutoSync !== false,
            maxContacts: options.maxContacts || 10000,
            enableContactGroups: options.enableContactGroups !== false,
            enableContactLabels: options.enableContactLabels !== false,
            ...options
        };

        // Contact data
        this.contacts = new Map();
        this.contactGroups = new Map();
        this.contactLabels = new Map();
        this.blockedContacts = new Set();
        this.favoriteContacts = new Set();

        this.initialize();
    }

    async initialize() {
        try {
            this.setupSocketEventHandlers();
            await this.syncContacts();
            this.emit('contacts:ready');
        } catch (error) {
            this.emit('contacts:error', error);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        this.socket.on('contacts.update', (contacts) => {
            this.handleContactsUpdate(contacts);
        });

        this.socket.on('contact.presence.update', (presence) => {
            this.handlePresenceUpdate(presence);
        });
    }

    // Contact Management
    async addContact(contactData) {
        try {
            if (this.contacts.size >= this.options.maxContacts) {
                throw new Error('Maximum contacts limit reached');
            }

            const contact = {
                jid: contactData.jid,
                name: contactData.name || '',
                notify: contactData.notify || '',
                verifiedName: contactData.verifiedName || '',
                imgUrl: contactData.imgUrl || '',
                status: contactData.status || '',
                isBusiness: contactData.isBusiness || false,
                isEnterprise: contactData.isEnterprise || false,
                labels: contactData.labels || [],
                groups: contactData.groups || [],
                lastSeen: contactData.lastSeen || null,
                isOnline: false,
                added: new Date().toISOString()
            };

            this.contacts.set(contact.jid, contact);
            this.emit('contact:added', contact);
            return contact;
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    async updateContact(jid, updates) {
        try {
            const contact = this.contacts.get(jid);
            if (!contact) {
                throw new Error(`Contact ${jid} not found`);
            }

            const updatedContact = {
                ...contact,
                ...updates,
                updated: new Date().toISOString()
            };

            this.contacts.set(jid, updatedContact);
            this.emit('contact:updated', updatedContact);
            return updatedContact;
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    async deleteContact(jid) {
        try {
            const contact = this.contacts.get(jid);
            if (!contact) {
                throw new Error(`Contact ${jid} not found`);
            }

            this.contacts.delete(jid);
            this.favoriteContacts.delete(jid);
            
            // Remove from groups
            for (const group of this.contactGroups.values()) {
                group.members.delete(jid);
            }

            this.emit('contact:deleted', { jid, contact });
            return { success: true, message: 'Contact deleted successfully' };
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    // Contact Synchronization
    async syncContacts() {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:sync'
                },
                content: [{
                    tag: 'contacts',
                    attrs: {},
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                const contacts = this.parseContactsFromResult(result);
                
                contacts.forEach(contact => {
                    this.contacts.set(contact.jid, contact);
                });

                this.emit('contacts:synced', contacts);
                return contacts;
            } else {
                throw new Error('Failed to sync contacts');
            }
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    // Contact Search and Filtering
    searchContacts(query, filters = {}) {
        try {
            let results = Array.from(this.contacts.values());

            // Text search
            if (query) {
                const searchTerm = query.toLowerCase();
                results = results.filter(contact => 
                    contact.name.toLowerCase().includes(searchTerm) ||
                    contact.notify.toLowerCase().includes(searchTerm) ||
                    contact.jid.toLowerCase().includes(searchTerm)
                );
            }

            // Apply filters
            if (filters.isBusiness !== undefined) {
                results = results.filter(contact => contact.isBusiness === filters.isBusiness);
            }

            if (filters.isEnterprise !== undefined) {
                results = results.filter(contact => contact.isEnterprise === filters.isEnterprise);
            }

            if (filters.isOnline !== undefined) {
                results = results.filter(contact => contact.isOnline === filters.isOnline);
            }

            if (filters.hasStatus !== undefined) {
                results = results.filter(contact => 
                    filters.hasStatus ? contact.status.length > 0 : contact.status.length === 0
                );
            }

            if (filters.labels && filters.labels.length > 0) {
                results = results.filter(contact => 
                    filters.labels.some(label => contact.labels.includes(label))
                );
            }

            // Sort results
            if (filters.sortBy) {
                results.sort((a, b) => {
                    switch (filters.sortBy) {
                        case 'name':
                            return a.name.localeCompare(b.name);
                        case 'lastSeen':
                            return new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0);
                        case 'added':
                            return new Date(b.added) - new Date(a.added);
                        default:
                            return 0;
                    }
                });
            }

            return {
                contacts: results,
                total: results.length,
                query: query,
                filters: filters
            };
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    // Contact Groups Management
    async createContactGroup(groupData) {
        try {
            const group = {
                id: groupData.id || this.generateGroupId(),
                name: groupData.name,
                description: groupData.description || '',
                members: new Set(groupData.members || []),
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            };

            this.contactGroups.set(group.id, group);
            this.emit('contact:group:created', group);
            return group;
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    async addContactToGroup(groupId, jid) {
        try {
            const group = this.contactGroups.get(groupId);
            if (!group) {
                throw new Error(`Contact group ${groupId} not found`);
            }

            const contact = this.contacts.get(jid);
            if (!contact) {
                throw new Error(`Contact ${jid} not found`);
            }

            group.members.add(jid);
            group.updated = new Date().toISOString();
            
            // Update contact's groups
            if (!contact.groups.includes(groupId)) {
                contact.groups.push(groupId);
                this.contacts.set(jid, contact);
            }

            this.emit('contact:group:member:added', { groupId, jid });
            return { success: true, message: 'Contact added to group successfully' };
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    async removeContactFromGroup(groupId, jid) {
        try {
            const group = this.contactGroups.get(groupId);
            if (!group) {
                throw new Error(`Contact group ${groupId} not found`);
            }

            group.members.delete(jid);
            group.updated = new Date().toISOString();
            
            // Update contact's groups
            const contact = this.contacts.get(jid);
            if (contact) {
                contact.groups = contact.groups.filter(id => id !== groupId);
                this.contacts.set(jid, contact);
            }

            this.emit('contact:group:member:removed', { groupId, jid });
            return { success: true, message: 'Contact removed from group successfully' };
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    // Contact Labels Management
    async createContactLabel(labelData) {
        try {
            const label = {
                id: labelData.id || this.generateLabelId(),
                name: labelData.name,
                color: labelData.color || '#FF6B35',
                description: labelData.description || '',
                created: new Date().toISOString()
            };

            this.contactLabels.set(label.id, label);
            this.emit('contact:label:created', label);
            return label;
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    async addLabelToContact(jid, labelId) {
        try {
            const contact = this.contacts.get(jid);
            if (!contact) {
                throw new Error(`Contact ${jid} not found`);
            }

            const label = this.contactLabels.get(labelId);
            if (!label) {
                throw new Error(`Label ${labelId} not found`);
            }

            if (!contact.labels.includes(labelId)) {
                contact.labels.push(labelId);
                this.contacts.set(jid, contact);
                
                this.emit('contact:label:added', { jid, labelId });
            }

            return { success: true, message: 'Label added to contact successfully' };
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    async removeLabelFromContact(jid, labelId) {
        try {
            const contact = this.contacts.get(jid);
            if (!contact) {
                throw new Error(`Contact ${jid} not found`);
            }

            contact.labels = contact.labels.filter(id => id !== labelId);
            this.contacts.set(jid, contact);
            
            this.emit('contact:label:removed', { jid, labelId });
            return { success: true, message: 'Label removed from contact successfully' };
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    // Favorites Management
    async addToFavorites(jid) {
        try {
            const contact = this.contacts.get(jid);
            if (!contact) {
                throw new Error(`Contact ${jid} not found`);
            }

            this.favoriteContacts.add(jid);
            this.emit('contact:favorite:added', { jid });
            return { success: true, message: 'Contact added to favorites' };
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    async removeFromFavorites(jid) {
        try {
            this.favoriteContacts.delete(jid);
            this.emit('contact:favorite:removed', { jid });
            return { success: true, message: 'Contact removed from favorites' };
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    // Contact Status and Presence
    async getContactStatus(jid) {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    to: jid,
                    xmlns: 'status'
                },
                content: null
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                const status = result.content?.[0]?.content || '';
                
                // Update contact status
                const contact = this.contacts.get(jid);
                if (contact) {
                    contact.status = status;
                    this.contacts.set(jid, contact);
                }

                return status;
            } else {
                throw new Error('Failed to get contact status');
            }
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    async requestPresenceUpdate(jid) {
        try {
            const query = {
                tag: 'presence',
                attrs: {
                    type: 'subscribe',
                    to: jid
                },
                content: null
            };

            await this.socket.sendNode(query);
            this.emit('contact:presence:requested', { jid });
            return { success: true, message: 'Presence update requested' };
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    // Contact Profile Management
    async getContactProfilePicture(jid) {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    to: jid,
                    xmlns: 'w:profile:picture'
                },
                content: [{
                    tag: 'picture',
                    attrs: { type: 'image' },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                const pictureUrl = result.content?.[0]?.attrs?.url;
                
                // Update contact profile picture
                const contact = this.contacts.get(jid);
                if (contact && pictureUrl) {
                    contact.imgUrl = pictureUrl;
                    this.contacts.set(jid, contact);
                }

                return pictureUrl;
            } else {
                throw new Error('Failed to get contact profile picture');
            }
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    // Contact Export/Import
    exportContacts(format = 'json') {
        try {
            const contactsData = Array.from(this.contacts.values());
            
            switch (format) {
                case 'json':
                    return JSON.stringify(contactsData, null, 2);
                case 'csv':
                    return this.convertContactsToCSV(contactsData);
                case 'vcard':
                    return this.convertContactsToVCard(contactsData);
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    importContacts(data, format = 'json') {
        try {
            let contacts;
            
            switch (format) {
                case 'json':
                    contacts = JSON.parse(data);
                    break;
                case 'csv':
                    contacts = this.parseContactsFromCSV(data);
                    break;
                case 'vcard':
                    contacts = this.parseContactsFromVCard(data);
                    break;
                default:
                    throw new Error(`Unsupported import format: ${format}`);
            }

            let imported = 0;
            contacts.forEach(contactData => {
                try {
                    this.addContact(contactData);
                    imported++;
                } catch (error) {
                    console.warn(`Failed to import contact ${contactData.jid}:`, error.message);
                }
            });

            this.emit('contacts:imported', { imported, total: contacts.length });
            return { imported, total: contacts.length };
        } catch (error) {
            this.emit('contacts:error', error);
            throw error;
        }
    }

    // Helper methods
    parseContactsFromResult(result) {
        const contacts = [];
        const contactNodes = result.content?.filter(c => c.tag === 'contact') || [];
        
        contactNodes.forEach(node => {
            const contact = {
                jid: node.attrs?.jid,
                name: node.attrs?.name || '',
                notify: node.attrs?.notify || '',
                verifiedName: node.attrs?.verified_name || '',
                imgUrl: node.attrs?.img_url || '',
                status: node.attrs?.status || '',
                isBusiness: node.attrs?.is_business === 'true',
                isEnterprise: node.attrs?.is_enterprise === 'true',
                labels: [],
                groups: [],
                lastSeen: node.attrs?.last_seen ? new Date(parseInt(node.attrs.last_seen) * 1000).toISOString() : null,
                isOnline: node.attrs?.presence === 'available',
                added: new Date().toISOString()
            };
            
            if (contact.jid) {
                contacts.push(contact);
            }
        });

        return contacts;
    }

    convertContactsToCSV(contacts) {
        const headers = ['JID', 'Name', 'Notify', 'Status', 'Is Business', 'Is Enterprise', 'Last Seen'];
        const rows = [headers.join(',')];

        contacts.forEach(contact => {
            const row = [
                contact.jid,
                `"${contact.name}"`,
                `"${contact.notify}"`,
                `"${contact.status}"`,
                contact.isBusiness,
                contact.isEnterprise,
                contact.lastSeen || ''
            ];
            rows.push(row.join(','));
        });

        return rows.join('\n');
    }

    convertContactsToVCard(contacts) {
        let vcard = '';
        
        contacts.forEach(contact => {
            vcard += 'BEGIN:VCARD\n';
            vcard += 'VERSION:3.0\n';
            vcard += `FN:${contact.name}\n`;
            vcard += `TEL:${contact.jid}\n`;
            if (contact.status) {
                vcard += `NOTE:${contact.status}\n`;
            }
            vcard += 'END:VCARD\n\n';
        });

        return vcard;
    }

    parseContactsFromCSV(csvData) {
        const lines = csvData.split('\n');
        const headers = lines[0].split(',');
        const contacts = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length >= headers.length) {
                contacts.push({
                    jid: values[0],
                    name: values[1].replace(/"/g, ''),
                    notify: values[2].replace(/"/g, ''),
                    status: values[3].replace(/"/g, ''),
                    isBusiness: values[4] === 'true',
                    isEnterprise: values[5] === 'true'
                });
            }
        }

        return contacts;
    }

    parseContactsFromVCard(vcardData) {
        const contacts = [];
        const vcards = vcardData.split('BEGIN:VCARD');

        vcards.forEach(vcard => {
            if (vcard.includes('FN:')) {
                const nameMatch = vcard.match(/FN:(.+)/);
                const telMatch = vcard.match(/TEL:(.+)/);
                const noteMatch = vcard.match(/NOTE:(.+)/);

                if (nameMatch && telMatch) {
                    contacts.push({
                        jid: telMatch[1].trim(),
                        name: nameMatch[1].trim(),
                        status: noteMatch ? noteMatch[1].trim() : ''
                    });
                }
            }
        });

        return contacts;
    }

    generateGroupId() {
        return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateLabelId() {
        return `label_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Event handlers
    handleContactsUpdate(contacts) {
        try {
            contacts.forEach(contact => {
                this.contacts.set(contact.jid, contact);
            });

            this.emit('contacts:server:update', contacts);
        } catch (error) {
            this.emit('contacts:error', error);
        }
    }

    handlePresenceUpdate(presence) {
        try {
            const contact = this.contacts.get(presence.jid);
            if (contact) {
                contact.isOnline = presence.presence === 'available';
                contact.lastSeen = presence.lastSeen;
                this.contacts.set(presence.jid, contact);
                
                this.emit('contact:presence:updated', presence);
            }
        } catch (error) {
            this.emit('contacts:error', error);
        }
    }

    // Getters
    getContact(jid) {
        return this.contacts.get(jid);
    }

    getAllContacts() {
        return Array.from(this.contacts.values());
    }

    getContactsByGroup(groupId) {
        const group = this.contactGroups.get(groupId);
        if (!group) return [];

        return Array.from(group.members).map(jid => this.contacts.get(jid)).filter(Boolean);
    }

    getContactsByLabel(labelId) {
        return Array.from(this.contacts.values()).filter(contact => 
            contact.labels.includes(labelId)
        );
    }

    getFavoriteContacts() {
        return Array.from(this.favoriteContacts).map(jid => this.contacts.get(jid)).filter(Boolean);
    }

    getOnlineContacts() {
        return Array.from(this.contacts.values()).filter(contact => contact.isOnline);
    }

    getBusinessContacts() {
        return Array.from(this.contacts.values()).filter(contact => contact.isBusiness);
    }

    getContactGroups() {
        return Array.from(this.contactGroups.values());
    }

    getContactLabels() {
        return Array.from(this.contactLabels.values());
    }

    getStatistics() {
        const contacts = Array.from(this.contacts.values());
        
        return {
            totalContacts: contacts.length,
            businessContacts: contacts.filter(c => c.isBusiness).length,
            enterpriseContacts: contacts.filter(c => c.isEnterprise).length,
            onlineContacts: contacts.filter(c => c.isOnline).length,
            favoriteContacts: this.favoriteContacts.size,
            contactGroups: this.contactGroups.size,
            contactLabels: this.contactLabels.size,
            contactsWithStatus: contacts.filter(c => c.status.length > 0).length
        };
    }
}

module.exports = WAContacts;