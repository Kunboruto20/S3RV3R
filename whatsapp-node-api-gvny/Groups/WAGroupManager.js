const EventEmitter = require('events');

/**
 * WhatsApp Group Manager
 * Handles all group operations including creation, management, participants, and settings
 */
class WAGroupManager extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            maxGroupSize: options.maxGroupSize || 1024,
            maxGroupNameLength: options.maxGroupNameLength || 25,
            maxGroupDescriptionLength: options.maxGroupDescriptionLength || 512,
            enableGroupInvites: options.enableGroupInvites !== false,
            enableGroupAnnouncements: options.enableGroupAnnouncements !== false,
            defaultGroupSettings: {
                restrictMessages: false,
                restrictInfo: false,
                allowInvites: true,
                ephemeralDuration: 0,
                ...options.defaultGroupSettings
            },
            ...options
        };

        // Group data stores
        this.groups = new Map();
        this.groupMetadata = new Map();
        this.participants = new Map();
        this.inviteLinks = new Map();
        this.groupSettings = new Map();
        this.announcements = new Map();
        
        // Group permissions
        this.permissions = {
            ADMIN: 'admin',
            SUPER_ADMIN: 'superadmin',
            MEMBER: 'member'
        };

        this.initialize();
    }

    async initialize() {
        try {
            await this.loadGroups();
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
        }
    }

    // Group Creation and Management
    async createGroup(groupData) {
        try {
            // Validate group data
            this.validateGroupData(groupData);

            const groupId = this.generateGroupId();
            const group = {
                id: groupId,
                subject: groupData.subject,
                description: groupData.description || '',
                owner: this.socket.user.id,
                participants: [this.socket.user.id, ...groupData.participants],
                creation: Math.floor(Date.now() / 1000),
                subjectTime: Math.floor(Date.now() / 1000),
                subjectOwner: this.socket.user.id,
                descriptionTime: groupData.description ? Math.floor(Date.now() / 1000) : null,
                descriptionOwner: groupData.description ? this.socket.user.id : null,
                restrict: this.options.defaultGroupSettings.restrictMessages,
                announce: this.options.defaultGroupSettings.restrictInfo,
                ephemeralDuration: this.options.defaultGroupSettings.ephemeralDuration
            };

            // Create group request
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'create',
                    attrs: {
                        subject: group.subject,
                        key: groupId
                    },
                    content: groupData.participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }]
            });

            if (response.attrs.type === 'result') {
                // Store group data
                this.groups.set(groupId, group);
                this.groupMetadata.set(groupId, group);
                
                // Initialize participants
                const participantList = new Map();
                participantList.set(this.socket.user.id, {
                    jid: this.socket.user.id,
                    role: this.permissions.SUPER_ADMIN,
                    joinedAt: group.creation
                });
                
                groupData.participants.forEach(jid => {
                    participantList.set(jid, {
                        jid: jid,
                        role: this.permissions.MEMBER,
                        joinedAt: group.creation
                    });
                });
                
                this.participants.set(groupId, participantList);
                
                // Set default group settings
                this.groupSettings.set(groupId, {
                    ...this.options.defaultGroupSettings,
                    groupId: groupId
                });

                this.emit('group.created', group);
                return group;
            } else {
                throw new Error('Failed to create group');
            }
        } catch (error) {
            throw new Error(`Group creation failed: ${error.message}`);
        }
    }

    async updateGroupSubject(groupId, subject) {
        try {
            this.validateGroupSubject(subject);
            
            const group = this.groups.get(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check permissions
            if (!this.isGroupAdmin(groupId, this.socket.user.id)) {
                throw new Error('Insufficient permissions to update group subject');
            }

            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'subject',
                    attrs: {},
                    content: subject
                }]
            });

            if (response.attrs.type === 'result') {
                group.subject = subject;
                group.subjectTime = Math.floor(Date.now() / 1000);
                group.subjectOwner = this.socket.user.id;
                
                this.groups.set(groupId, group);
                this.groupMetadata.set(groupId, group);
                
                this.emit('group.subject.updated', { groupId, subject, updatedBy: this.socket.user.id });
                return group;
            } else {
                throw new Error('Failed to update group subject');
            }
        } catch (error) {
            throw new Error(`Group subject update failed: ${error.message}`);
        }
    }

    async updateGroupDescription(groupId, description) {
        try {
            this.validateGroupDescription(description);
            
            const group = this.groups.get(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check permissions
            if (!this.isGroupAdmin(groupId, this.socket.user.id)) {
                throw new Error('Insufficient permissions to update group description');
            }

            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'description',
                    attrs: {},
                    content: description
                }]
            });

            if (response.attrs.type === 'result') {
                group.description = description;
                group.descriptionTime = Math.floor(Date.now() / 1000);
                group.descriptionOwner = this.socket.user.id;
                
                this.groups.set(groupId, group);
                this.groupMetadata.set(groupId, group);
                
                this.emit('group.description.updated', { groupId, description, updatedBy: this.socket.user.id });
                return group;
            } else {
                throw new Error('Failed to update group description');
            }
        } catch (error) {
            throw new Error(`Group description update failed: ${error.message}`);
        }
    }

    // Participant Management
    async addParticipants(groupId, participants) {
        try {
            const group = this.groups.get(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check permissions
            if (!this.isGroupAdmin(groupId, this.socket.user.id)) {
                throw new Error('Insufficient permissions to add participants');
            }

            // Check group size limit
            const currentParticipants = this.participants.get(groupId);
            if (currentParticipants && (currentParticipants.size + participants.length) > this.options.maxGroupSize) {
                throw new Error('Group size limit exceeded');
            }

            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'add',
                    attrs: {},
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }]
            });

            if (response.attrs.type === 'result') {
                const participantList = this.participants.get(groupId) || new Map();
                const addedParticipants = [];
                
                participants.forEach(jid => {
                    if (!participantList.has(jid)) {
                        const participant = {
                            jid: jid,
                            role: this.permissions.MEMBER,
                            joinedAt: Math.floor(Date.now() / 1000)
                        };
                        participantList.set(jid, participant);
                        addedParticipants.push(participant);
                    }
                });
                
                this.participants.set(groupId, participantList);
                
                this.emit('group.participants.added', { 
                    groupId, 
                    participants: addedParticipants, 
                    addedBy: this.socket.user.id 
                });
                
                return addedParticipants;
            } else {
                throw new Error('Failed to add participants');
            }
        } catch (error) {
            throw new Error(`Add participants failed: ${error.message}`);
        }
    }

    async removeParticipants(groupId, participants) {
        try {
            const group = this.groups.get(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check permissions
            if (!this.isGroupAdmin(groupId, this.socket.user.id)) {
                throw new Error('Insufficient permissions to remove participants');
            }

            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'remove',
                    attrs: {},
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }]
            });

            if (response.attrs.type === 'result') {
                const participantList = this.participants.get(groupId);
                const removedParticipants = [];
                
                if (participantList) {
                    participants.forEach(jid => {
                        if (participantList.has(jid)) {
                            const participant = participantList.get(jid);
                            participantList.delete(jid);
                            removedParticipants.push(participant);
                        }
                    });
                    
                    this.participants.set(groupId, participantList);
                }
                
                this.emit('group.participants.removed', { 
                    groupId, 
                    participants: removedParticipants, 
                    removedBy: this.socket.user.id 
                });
                
                return removedParticipants;
            } else {
                throw new Error('Failed to remove participants');
            }
        } catch (error) {
            throw new Error(`Remove participants failed: ${error.message}`);
        }
    }

    async promoteParticipants(groupId, participants) {
        try {
            const group = this.groups.get(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check permissions (only super admin can promote)
            if (!this.isGroupSuperAdmin(groupId, this.socket.user.id)) {
                throw new Error('Insufficient permissions to promote participants');
            }

            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'promote',
                    attrs: {},
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }]
            });

            if (response.attrs.type === 'result') {
                const participantList = this.participants.get(groupId);
                const promotedParticipants = [];
                
                if (participantList) {
                    participants.forEach(jid => {
                        if (participantList.has(jid)) {
                            const participant = participantList.get(jid);
                            participant.role = this.permissions.ADMIN;
                            promotedParticipants.push(participant);
                        }
                    });
                    
                    this.participants.set(groupId, participantList);
                }
                
                this.emit('group.participants.promoted', { 
                    groupId, 
                    participants: promotedParticipants, 
                    promotedBy: this.socket.user.id 
                });
                
                return promotedParticipants;
            } else {
                throw new Error('Failed to promote participants');
            }
        } catch (error) {
            throw new Error(`Promote participants failed: ${error.message}`);
        }
    }

    async demoteParticipants(groupId, participants) {
        try {
            const group = this.groups.get(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check permissions (only super admin can demote)
            if (!this.isGroupSuperAdmin(groupId, this.socket.user.id)) {
                throw new Error('Insufficient permissions to demote participants');
            }

            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'demote',
                    attrs: {},
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }]
            });

            if (response.attrs.type === 'result') {
                const participantList = this.participants.get(groupId);
                const demotedParticipants = [];
                
                if (participantList) {
                    participants.forEach(jid => {
                        if (participantList.has(jid)) {
                            const participant = participantList.get(jid);
                            participant.role = this.permissions.MEMBER;
                            demotedParticipants.push(participant);
                        }
                    });
                    
                    this.participants.set(groupId, participantList);
                }
                
                this.emit('group.participants.demoted', { 
                    groupId, 
                    participants: demotedParticipants, 
                    demotedBy: this.socket.user.id 
                });
                
                return demotedParticipants;
            } else {
                throw new Error('Failed to demote participants');
            }
        } catch (error) {
            throw new Error(`Demote participants failed: ${error.message}`);
        }
    }

    // Group Settings
    async updateGroupSettings(groupId, settings) {
        try {
            const group = this.groups.get(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check permissions
            if (!this.isGroupAdmin(groupId, this.socket.user.id)) {
                throw new Error('Insufficient permissions to update group settings');
            }

            const currentSettings = this.groupSettings.get(groupId) || {};
            const updatedSettings = { ...currentSettings, ...settings };

            // Update restrict messages setting
            if (settings.restrictMessages !== undefined) {
                await this.updateGroupRestriction(groupId, 'announce', settings.restrictMessages);
                group.announce = settings.restrictMessages;
            }

            // Update restrict info setting
            if (settings.restrictInfo !== undefined) {
                await this.updateGroupRestriction(groupId, 'restrict', settings.restrictInfo);
                group.restrict = settings.restrictInfo;
            }

            // Update ephemeral duration
            if (settings.ephemeralDuration !== undefined) {
                await this.updateEphemeralDuration(groupId, settings.ephemeralDuration);
                group.ephemeralDuration = settings.ephemeralDuration;
            }

            this.groupSettings.set(groupId, updatedSettings);
            this.groups.set(groupId, group);
            this.groupMetadata.set(groupId, group);

            this.emit('group.settings.updated', { groupId, settings: updatedSettings });
            return updatedSettings;
        } catch (error) {
            throw new Error(`Group settings update failed: ${error.message}`);
        }
    }

    async updateGroupRestriction(groupId, type, value) {
        const response = await this.socket.query({
            tag: 'iq',
            attrs: {
                id: this.socket.generateMessageTag(),
                type: 'set',
                xmlns: 'w:g2',
                to: groupId
            },
            content: [{
                tag: type,
                attrs: { value: value.toString() }
            }]
        });

        if (response.attrs.type !== 'result') {
            throw new Error(`Failed to update group ${type} setting`);
        }
    }

    async updateEphemeralDuration(groupId, duration) {
        const response = await this.socket.query({
            tag: 'iq',
            attrs: {
                id: this.socket.generateMessageTag(),
                type: 'set',
                xmlns: 'w:g2',
                to: groupId
            },
            content: [{
                tag: 'ephemeral',
                attrs: { expiration: duration.toString() }
            }]
        });

        if (response.attrs.type !== 'result') {
            throw new Error('Failed to update ephemeral duration');
        }
    }

    // Group Invites
    async generateInviteLink(groupId) {
        try {
            const group = this.groups.get(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check permissions
            if (!this.isGroupAdmin(groupId, this.socket.user.id)) {
                throw new Error('Insufficient permissions to generate invite link');
            }

            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'invite',
                    attrs: {}
                }]
            });

            if (response.attrs.type === 'result' && response.content?.[0]?.attrs?.code) {
                const inviteCode = response.content[0].attrs.code;
                const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                
                this.inviteLinks.set(groupId, {
                    code: inviteCode,
                    link: inviteLink,
                    createdBy: this.socket.user.id,
                    createdAt: new Date().toISOString()
                });

                this.emit('group.invite.generated', { groupId, inviteLink, inviteCode });
                return { inviteLink, inviteCode };
            } else {
                throw new Error('Failed to generate invite link');
            }
        } catch (error) {
            throw new Error(`Invite link generation failed: ${error.message}`);
        }
    }

    async revokeInviteLink(groupId) {
        try {
            const group = this.groups.get(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check permissions
            if (!this.isGroupAdmin(groupId, this.socket.user.id)) {
                throw new Error('Insufficient permissions to revoke invite link');
            }

            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'invite',
                    attrs: {}
                }]
            });

            if (response.attrs.type === 'result') {
                this.inviteLinks.delete(groupId);
                this.emit('group.invite.revoked', { groupId, revokedBy: this.socket.user.id });
                return true;
            } else {
                throw new Error('Failed to revoke invite link');
            }
        } catch (error) {
            throw new Error(`Invite link revocation failed: ${error.message}`);
        }
    }

    // Group Announcements
    async createAnnouncement(groupId, announcement) {
        try {
            if (!this.options.enableGroupAnnouncements) {
                throw new Error('Group announcements are not enabled');
            }

            const group = this.groups.get(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check permissions
            if (!this.isGroupAdmin(groupId, this.socket.user.id)) {
                throw new Error('Insufficient permissions to create announcements');
            }

            const announcementData = {
                id: this.generateAnnouncementId(),
                groupId: groupId,
                title: announcement.title,
                content: announcement.content,
                createdBy: this.socket.user.id,
                createdAt: new Date().toISOString(),
                pinned: announcement.pinned || false,
                expiresAt: announcement.expiresAt
            };

            // Store announcement
            if (!this.announcements.has(groupId)) {
                this.announcements.set(groupId, new Map());
            }
            this.announcements.get(groupId).set(announcementData.id, announcementData);

            // Send announcement message
            const message = {
                extendedTextMessage: {
                    text: `📢 *${announcementData.title}*\n\n${announcementData.content}`,
                    contextInfo: {
                        isForwarded: false,
                        quotedMessage: null
                    }
                }
            };

            await this.socket.sendMessage(groupId, message);

            this.emit('group.announcement.created', announcementData);
            return announcementData;
        } catch (error) {
            throw new Error(`Announcement creation failed: ${error.message}`);
        }
    }

    // Utility Methods
    validateGroupData(groupData) {
        if (!groupData.subject || groupData.subject.trim().length === 0) {
            throw new Error('Group subject is required');
        }
        
        this.validateGroupSubject(groupData.subject);
        
        if (groupData.description) {
            this.validateGroupDescription(groupData.description);
        }
        
        if (!groupData.participants || !Array.isArray(groupData.participants)) {
            throw new Error('Participants array is required');
        }
        
        if (groupData.participants.length === 0) {
            throw new Error('At least one participant is required');
        }
        
        if (groupData.participants.length > this.options.maxGroupSize - 1) { // -1 for the creator
            throw new Error(`Too many participants. Maximum: ${this.options.maxGroupSize - 1}`);
        }
    }

    validateGroupSubject(subject) {
        if (subject.length > this.options.maxGroupNameLength) {
            throw new Error(`Group name too long. Maximum: ${this.options.maxGroupNameLength} characters`);
        }
    }

    validateGroupDescription(description) {
        if (description.length > this.options.maxGroupDescriptionLength) {
            throw new Error(`Group description too long. Maximum: ${this.options.maxGroupDescriptionLength} characters`);
        }
    }

    isGroupAdmin(groupId, jid) {
        const participantList = this.participants.get(groupId);
        if (!participantList) return false;
        
        const participant = participantList.get(jid);
        return participant && (participant.role === this.permissions.ADMIN || participant.role === this.permissions.SUPER_ADMIN);
    }

    isGroupSuperAdmin(groupId, jid) {
        const participantList = this.participants.get(groupId);
        if (!participantList) return false;
        
        const participant = participantList.get(jid);
        return participant && participant.role === this.permissions.SUPER_ADMIN;
    }

    generateGroupId() {
        const timestamp = Math.floor(Date.now() / 1000);
        const random = Math.random().toString(36).substr(2, 9);
        return `${timestamp}-${random}@g.us`;
    }

    generateAnnouncementId() {
        return `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async loadGroups() {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:g2'
                },
                content: [{
                    tag: 'participating',
                    attrs: {}
                }]
            });

            if (response.content) {
                for (const groupNode of response.content) {
                    if (groupNode.tag === 'group') {
                        const group = this.decodeGroup(groupNode);
                        this.groups.set(group.id, group);
                        this.groupMetadata.set(group.id, group);
                        
                        // Load participants
                        await this.loadGroupParticipants(group.id);
                    }
                }
                this.emit('groups.loaded', Array.from(this.groups.values()));
            }
        } catch (error) {
            console.error('Failed to load groups:', error);
        }
    }

    async loadGroupParticipants(groupId) {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'query',
                    attrs: {}
                }]
            });

            if (response.content?.[0]?.content) {
                const participantList = new Map();
                
                for (const participantNode of response.content[0].content) {
                    if (participantNode.tag === 'participant') {
                        const participant = {
                            jid: participantNode.attrs.jid,
                            role: participantNode.attrs.type || this.permissions.MEMBER,
                            joinedAt: parseInt(participantNode.attrs.t) || Math.floor(Date.now() / 1000)
                        };
                        participantList.set(participant.jid, participant);
                    }
                }
                
                this.participants.set(groupId, participantList);
            }
        } catch (error) {
            console.error(`Failed to load participants for group ${groupId}:`, error);
        }
    }

    decodeGroup(node) {
        const group = {
            id: node.attrs.jid,
            subject: node.attrs.subject,
            creation: parseInt(node.attrs.creation),
            owner: node.attrs.creator,
            subjectTime: parseInt(node.attrs.s_t),
            subjectOwner: node.attrs.s_o,
            restrict: node.attrs.restrict === 'true',
            announce: node.attrs.announce === 'true'
        };

        // Parse additional attributes
        if (node.attrs.desc_time) {
            group.descriptionTime = parseInt(node.attrs.desc_time);
        }
        if (node.attrs.desc_owner) {
            group.descriptionOwner = node.attrs.desc_owner;
        }
        if (node.attrs.ephemeral) {
            group.ephemeralDuration = parseInt(node.attrs.ephemeral);
        }

        return group;
    }

    // Getters
    getGroups() {
        return Array.from(this.groups.values());
    }

    getGroup(groupId) {
        return this.groups.get(groupId);
    }

    getGroupMetadata(groupId) {
        return this.groupMetadata.get(groupId);
    }

    getGroupParticipants(groupId) {
        const participantList = this.participants.get(groupId);
        return participantList ? Array.from(participantList.values()) : [];
    }

    getGroupSettings(groupId) {
        return this.groupSettings.get(groupId);
    }

    getGroupInviteLink(groupId) {
        return this.inviteLinks.get(groupId);
    }

    getGroupAnnouncements(groupId) {
        const announcements = this.announcements.get(groupId);
        return announcements ? Array.from(announcements.values()) : [];
    }

    // Statistics
    getGroupStats() {
        const groups = Array.from(this.groups.values());
        const totalParticipants = Array.from(this.participants.values())
            .reduce((total, participantList) => total + participantList.size, 0);

        return {
            totalGroups: groups.length,
            totalParticipants: totalParticipants,
            averageGroupSize: groups.length > 0 ? totalParticipants / groups.length : 0,
            adminGroups: groups.filter(group => this.isGroupAdmin(group.id, this.socket.user.id)).length,
            ownedGroups: groups.filter(group => group.owner === this.socket.user.id).length
        };
    }
}

module.exports = WAGroupManager;