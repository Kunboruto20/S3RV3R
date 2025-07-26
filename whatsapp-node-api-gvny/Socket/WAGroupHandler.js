const crypto = require('crypto');

class WAGroupHandler {
    constructor(socket) {
        this.socket = socket;
        this.groupCache = new Map();
        this.participantCache = new Map();
        this.inviteCache = new Map();
        
        // Group actions
        this.groupActions = {
            ADD: 'add',
            REMOVE: 'remove',
            PROMOTE: 'promote',
            DEMOTE: 'demote',
            LEAVE: 'leave',
            CREATE: 'create',
            UPDATE: 'update'
        };
        
        // Group participant roles
        this.participantRoles = {
            ADMIN: 'admin',
            MEMBER: 'member',
            SUPER_ADMIN: 'superadmin'
        };
        
        // Group settings
        this.groupSettings = {
            ANNOUNCEMENT: 'announcement',
            NOT_ANNOUNCEMENT: 'not_announcement',
            LOCKED: 'locked',
            UNLOCKED: 'unlocked'
        };
    }
    
    async createGroup(subject, participants = [], options = {}) {
        try {
            const groupId = this.generateGroupId();
            const timestamp = Math.floor(Date.now() / 1000);
            
            // Validate participants
            const validParticipants = this.validateParticipants(participants);
            
            if (validParticipants.length === 0) {
                throw new Error('At least one participant is required');
            }
            
            // Create group node
            const createNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: '@g.us'
                },
                content: [{
                    tag: 'create',
                    attrs: {
                        subject: subject,
                        key: groupId,
                        creation: timestamp.toString()
                    },
                    content: validParticipants.map(participant => ({
                        tag: 'participant',
                        attrs: {
                            jid: participant
                        }
                    }))
                }]
            };
            
            // Send create group request
            const response = await this.socket.query(createNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to create group');
            }
            
            // Parse group info from response
            const groupInfo = this.parseGroupInfo(response);
            
            // Cache group info
            this.groupCache.set(groupInfo.id, groupInfo);
            
            // Emit group creation event
            this.socket.emit('groups.upsert', [groupInfo]);
            
            return groupInfo;
            
        } catch (error) {
            throw new Error(`Failed to create group: ${error.message}`);
        }
    }
    
    async addParticipants(groupId, participants) {
        try {
            const validParticipants = this.validateParticipants(participants);
            
            if (validParticipants.length === 0) {
                throw new Error('No valid participants provided');
            }
            
            const addNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'add',
                    content: validParticipants.map(participant => ({
                        tag: 'participant',
                        attrs: {
                            jid: participant
                        }
                    }))
                }]
            };
            
            const response = await this.socket.query(addNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to add participants');
            }
            
            // Parse add response
            const addResults = this.parseParticipantAction(response);
            
            // Update group cache
            await this.updateGroupParticipants(groupId, validParticipants, 'add');
            
            // Emit participants update event
            this.socket.emit('group-participants.update', {
                id: groupId,
                participants: validParticipants,
                action: this.groupActions.ADD,
                results: addResults
            });
            
            return addResults;
            
        } catch (error) {
            throw new Error(`Failed to add participants: ${error.message}`);
        }
    }
    
    async removeParticipants(groupId, participants) {
        try {
            const validParticipants = this.validateParticipants(participants);
            
            if (validParticipants.length === 0) {
                throw new Error('No valid participants provided');
            }
            
            const removeNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'remove',
                    content: validParticipants.map(participant => ({
                        tag: 'participant',
                        attrs: {
                            jid: participant
                        }
                    }))
                }]
            };
            
            const response = await this.socket.query(removeNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to remove participants');
            }
            
            // Parse remove response
            const removeResults = this.parseParticipantAction(response);
            
            // Update group cache
            await this.updateGroupParticipants(groupId, validParticipants, 'remove');
            
            // Emit participants update event
            this.socket.emit('group-participants.update', {
                id: groupId,
                participants: validParticipants,
                action: this.groupActions.REMOVE,
                results: removeResults
            });
            
            return removeResults;
            
        } catch (error) {
            throw new Error(`Failed to remove participants: ${error.message}`);
        }
    }
    
    async promoteParticipants(groupId, participants) {
        try {
            const validParticipants = this.validateParticipants(participants);
            
            if (validParticipants.length === 0) {
                throw new Error('No valid participants provided');
            }
            
            const promoteNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'promote',
                    content: validParticipants.map(participant => ({
                        tag: 'participant',
                        attrs: {
                            jid: participant
                        }
                    }))
                }]
            };
            
            const response = await this.socket.query(promoteNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to promote participants');
            }
            
            // Parse promote response
            const promoteResults = this.parseParticipantAction(response);
            
            // Update participant roles in cache
            await this.updateParticipantRoles(groupId, validParticipants, this.participantRoles.ADMIN);
            
            // Emit participants update event
            this.socket.emit('group-participants.update', {
                id: groupId,
                participants: validParticipants,
                action: this.groupActions.PROMOTE,
                results: promoteResults
            });
            
            return promoteResults;
            
        } catch (error) {
            throw new Error(`Failed to promote participants: ${error.message}`);
        }
    }
    
    async demoteParticipants(groupId, participants) {
        try {
            const validParticipants = this.validateParticipants(participants);
            
            if (validParticipants.length === 0) {
                throw new Error('No valid participants provided');
            }
            
            const demoteNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'demote',
                    content: validParticipants.map(participant => ({
                        tag: 'participant',
                        attrs: {
                            jid: participant
                        }
                    }))
                }]
            };
            
            const response = await this.socket.query(demoteNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to demote participants');
            }
            
            // Parse demote response
            const demoteResults = this.parseParticipantAction(response);
            
            // Update participant roles in cache
            await this.updateParticipantRoles(groupId, validParticipants, this.participantRoles.MEMBER);
            
            // Emit participants update event
            this.socket.emit('group-participants.update', {
                id: groupId,
                participants: validParticipants,
                action: this.groupActions.DEMOTE,
                results: demoteResults
            });
            
            return demoteResults;
            
        } catch (error) {
            throw new Error(`Failed to demote participants: ${error.message}`);
        }
    }
    
    async updateGroupSubject(groupId, subject) {
        try {
            const updateNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'subject',
                    content: subject
                }]
            };
            
            const response = await this.socket.query(updateNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to update group subject');
            }
            
            // Update group cache
            if (this.groupCache.has(groupId)) {
                const groupInfo = this.groupCache.get(groupId);
                groupInfo.subject = subject;
                groupInfo.subjectTime = Math.floor(Date.now() / 1000);
                groupInfo.subjectOwner = this.socket.user?.id;
            }
            
            // Emit group update event
            this.socket.emit('groups.update', [{
                id: groupId,
                subject: subject,
                subjectTime: Math.floor(Date.now() / 1000),
                subjectOwner: this.socket.user?.id
            }]);
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to update group subject: ${error.message}`);
        }
    }
    
    async updateGroupDescription(groupId, description) {
        try {
            const updateNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'description',
                    attrs: {
                        id: this.generateId()
                    },
                    content: description
                }]
            };
            
            const response = await this.socket.query(updateNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to update group description');
            }
            
            // Update group cache
            if (this.groupCache.has(groupId)) {
                const groupInfo = this.groupCache.get(groupId);
                groupInfo.desc = description;
                groupInfo.descTime = Math.floor(Date.now() / 1000);
                groupInfo.descOwner = this.socket.user?.id;
            }
            
            // Emit group update event
            this.socket.emit('groups.update', [{
                id: groupId,
                desc: description,
                descTime: Math.floor(Date.now() / 1000),
                descOwner: this.socket.user?.id
            }]);
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to update group description: ${error.message}`);
        }
    }
    
    async leaveGroup(groupId) {
        try {
            const leaveNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'leave'
                }]
            };
            
            const response = await this.socket.query(leaveNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to leave group');
            }
            
            // Remove from cache
            this.groupCache.delete(groupId);
            this.participantCache.delete(groupId);
            
            // Emit group update event
            this.socket.emit('group-participants.update', {
                id: groupId,
                participants: [this.socket.user?.id],
                action: this.groupActions.LEAVE
            });
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to leave group: ${error.message}`);
        }
    }
    
    async getGroupMetadata(groupId) {
        try {
            // Check cache first
            if (this.groupCache.has(groupId)) {
                return this.groupCache.get(groupId);
            }
            
            const queryNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'query',
                    attrs: {
                        request: 'interactive'
                    }
                }]
            };
            
            const response = await this.socket.query(queryNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to get group metadata');
            }
            
            // Parse group metadata
            const groupInfo = this.parseGroupInfo(response);
            
            // Cache group info
            this.groupCache.set(groupId, groupInfo);
            
            return groupInfo;
            
        } catch (error) {
            throw new Error(`Failed to get group metadata: ${error.message}`);
        }
    }
    
    async getGroupInviteCode(groupId) {
        try {
            // Check cache first
            if (this.inviteCache.has(groupId)) {
                return this.inviteCache.get(groupId);
            }
            
            const inviteNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'invite'
                }]
            };
            
            const response = await this.socket.query(inviteNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to get group invite code');
            }
            
            // Parse invite code
            const inviteCode = this.parseInviteCode(response);
            
            // Cache invite code
            this.inviteCache.set(groupId, inviteCode);
            
            return inviteCode;
            
        } catch (error) {
            throw new Error(`Failed to get group invite code: ${error.message}`);
        }
    }
    
    async revokeGroupInviteCode(groupId) {
        try {
            const revokeNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: [{
                    tag: 'invite',
                    attrs: {
                        action: 'revoke'
                    }
                }]
            };
            
            const response = await this.socket.query(revokeNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to revoke group invite code');
            }
            
            // Parse new invite code
            const newInviteCode = this.parseInviteCode(response);
            
            // Update cache
            this.inviteCache.set(groupId, newInviteCode);
            
            return newInviteCode;
            
        } catch (error) {
            throw new Error(`Failed to revoke group invite code: ${error.message}`);
        }
    }
    
    async acceptGroupInvite(inviteCode) {
        try {
            const acceptNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: '@g.us'
                },
                content: [{
                    tag: 'invite',
                    attrs: {
                        code: inviteCode
                    }
                }]
            };
            
            const response = await this.socket.query(acceptNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to accept group invite');
            }
            
            // Parse group info from response
            const groupInfo = this.parseGroupInfo(response);
            
            // Cache group info
            this.groupCache.set(groupInfo.id, groupInfo);
            
            // Emit group join event
            this.socket.emit('groups.upsert', [groupInfo]);
            
            return groupInfo;
            
        } catch (error) {
            throw new Error(`Failed to accept group invite: ${error.message}`);
        }
    }
    
    async updateGroupSettings(groupId, settings) {
        try {
            const settingsNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'w:g2',
                    to: groupId
                },
                content: []
            };
            
            // Add settings to node
            if (settings.announcement !== undefined) {
                settingsNode.content.push({
                    tag: 'announcement',
                    attrs: {
                        value: settings.announcement ? 'true' : 'false'
                    }
                });
            }
            
            if (settings.locked !== undefined) {
                settingsNode.content.push({
                    tag: 'locked',
                    attrs: {
                        value: settings.locked ? 'true' : 'false'
                    }
                });
            }
            
            if (settings.ephemeral !== undefined) {
                settingsNode.content.push({
                    tag: 'ephemeral',
                    attrs: {
                        expiration: settings.ephemeral.toString()
                    }
                });
            }
            
            const response = await this.socket.query(settingsNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to update group settings');
            }
            
            // Update group cache
            if (this.groupCache.has(groupId)) {
                const groupInfo = this.groupCache.get(groupId);
                Object.assign(groupInfo, settings);
            }
            
            // Emit group update event
            this.socket.emit('groups.update', [{
                id: groupId,
                ...settings
            }]);
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to update group settings: ${error.message}`);
        }
    }
    
    parseGroupInfo(node) {
        try {
            const attrs = node.attrs || {};
            const groupInfo = {
                id: attrs.from || attrs.id,
                subject: '',
                subjectTime: 0,
                subjectOwner: '',
                desc: '',
                descTime: 0,
                descOwner: '',
                creation: parseInt(attrs.creation) || 0,
                owner: attrs.creator || attrs.owner,
                participants: [],
                size: 0,
                announce: false,
                restrict: false,
                ephemeralDuration: 0
            };
            
            // Parse content
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag) {
                        switch (child.tag) {
                            case 'subject':
                                groupInfo.subject = child.content || '';
                                groupInfo.subjectTime = parseInt(child.attrs?.t) || 0;
                                groupInfo.subjectOwner = child.attrs?.author || '';
                                break;
                            case 'description':
                                groupInfo.desc = child.content || '';
                                groupInfo.descTime = parseInt(child.attrs?.t) || 0;
                                groupInfo.descOwner = child.attrs?.author || '';
                                break;
                            case 'participant':
                                const participant = {
                                    id: child.attrs?.jid || '',
                                    admin: child.attrs?.type === 'admin' || child.attrs?.type === 'superadmin' ? child.attrs.type : null
                                };
                                groupInfo.participants.push(participant);
                                break;
                            case 'announcement':
                                groupInfo.announce = child.attrs?.value === 'true';
                                break;
                            case 'locked':
                                groupInfo.restrict = child.attrs?.value === 'true';
                                break;
                            case 'ephemeral':
                                groupInfo.ephemeralDuration = parseInt(child.attrs?.expiration) || 0;
                                break;
                        }
                    }
                }
            }
            
            groupInfo.size = groupInfo.participants.length;
            
            // Cache participants
            this.participantCache.set(groupInfo.id, groupInfo.participants);
            
            return groupInfo;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing group info:', error);
            return null;
        }
    }
    
    parseParticipantAction(node) {
        try {
            const results = [];
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'participant') {
                        results.push({
                            jid: child.attrs?.jid || '',
                            status: child.attrs?.error || 'success',
                            code: child.attrs?.code || '200'
                        });
                    }
                }
            }
            
            return results;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing participant action:', error);
            return [];
        }
    }
    
    parseInviteCode(node) {
        try {
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'invite') {
                        return child.attrs?.code || child.content;
                    }
                }
            }
            
            return node.attrs?.code || node.content;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing invite code:', error);
            return null;
        }
    }
    
    validateParticipants(participants) {
        if (!Array.isArray(participants)) {
            participants = [participants];
        }
        
        return participants
            .filter(p => typeof p === 'string' && p.includes('@'))
            .map(p => p.includes('@s.whatsapp.net') ? p : `${p}@s.whatsapp.net`);
    }
    
    async updateGroupParticipants(groupId, participants, action) {
        try {
            if (!this.groupCache.has(groupId)) return;
            
            const groupInfo = this.groupCache.get(groupId);
            
            if (action === 'add') {
                for (const participant of participants) {
                    if (!groupInfo.participants.find(p => p.id === participant)) {
                        groupInfo.participants.push({
                            id: participant,
                            admin: null
                        });
                    }
                }
            } else if (action === 'remove') {
                groupInfo.participants = groupInfo.participants.filter(p => 
                    !participants.includes(p.id)
                );
            }
            
            groupInfo.size = groupInfo.participants.length;
            
            // Update participant cache
            this.participantCache.set(groupId, groupInfo.participants);
            
        } catch (error) {
            this.socket.options.logger.error('Error updating group participants:', error);
        }
    }
    
    async updateParticipantRoles(groupId, participants, role) {
        try {
            if (!this.groupCache.has(groupId)) return;
            
            const groupInfo = this.groupCache.get(groupId);
            
            for (const participantId of participants) {
                const participant = groupInfo.participants.find(p => p.id === participantId);
                if (participant) {
                    participant.admin = role === this.participantRoles.MEMBER ? null : role;
                }
            }
            
            // Update participant cache
            this.participantCache.set(groupId, groupInfo.participants);
            
        } catch (error) {
            this.socket.options.logger.error('Error updating participant roles:', error);
        }
    }
    
    generateGroupId() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        return `${timestamp}-${random}@g.us`;
    }
    
    generateId() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }
    
    isGroupJid(jid) {
        return jid && jid.includes('@g.us');
    }
    
    getGroupParticipants(groupId) {
        return this.participantCache.get(groupId) || [];
    }
    
    isGroupAdmin(groupId, participantId) {
        const participants = this.getGroupParticipants(groupId);
        const participant = participants.find(p => p.id === participantId);
        return participant && participant.admin !== null;
    }
    
    isGroupOwner(groupId, participantId) {
        if (!this.groupCache.has(groupId)) return false;
        const groupInfo = this.groupCache.get(groupId);
        return groupInfo.owner === participantId;
    }
    
    clearCache() {
        this.groupCache.clear();
        this.participantCache.clear();
        this.inviteCache.clear();
    }
}

module.exports = WAGroupHandler;