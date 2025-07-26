const EventEmitter = require('events');

/**
 * WhatsApp Community Manager
 * Handles WhatsApp Communities functionality including creation, management, and group coordination
 */
class WACommunity extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            maxCommunities: options.maxCommunities || 50,
            maxGroupsPerCommunity: options.maxGroupsPerCommunity || 50,
            maxMembersPerCommunity: options.maxMembersPerCommunity || 5000,
            enableAnalytics: options.enableAnalytics !== false,
            ...options
        };

        // Community data
        this.communities = new Map();
        this.communityGroups = new Map();
        this.communityMembers = new Map();
        this.communitySettings = new Map();
        this.communityAnalytics = new Map();

        this.initialize();
    }

    async initialize() {
        try {
            this.setupSocketEventHandlers();
            this.emit('community:ready');
        } catch (error) {
            this.emit('community:error', error);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        this.socket.on('community.update', (update) => {
            this.handleCommunityUpdate(update);
        });

        this.socket.on('community.member.update', (update) => {
            this.handleMemberUpdate(update);
        });
    }

    // Community Management
    async createCommunity(communityData) {
        try {
            if (this.communities.size >= this.options.maxCommunities) {
                throw new Error('Maximum communities limit reached');
            }

            const community = {
                id: communityData.id || this.generateCommunityId(),
                name: communityData.name,
                description: communityData.description || '',
                profilePicture: communityData.profilePicture,
                isPrivate: communityData.isPrivate || false,
                memberCount: 1,
                groupCount: 0,
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                owner: this.socket.user?.id,
                admins: [this.socket.user?.id],
                settings: {
                    allowMemberInvites: communityData.allowMemberInvites !== false,
                    requireApproval: communityData.requireApproval || false,
                    allowGroupCreation: communityData.allowGroupCreation !== false,
                    enableAnnouncements: communityData.enableAnnouncements !== false
                }
            };

            // Send community creation request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:community'
                },
                content: [{
                    tag: 'community',
                    attrs: { action: 'create' },
                    content: this.serializeCommunity(community)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.communities.set(community.id, community);
                this.communityGroups.set(community.id, new Set());
                this.communityMembers.set(community.id, new Set([this.socket.user?.id]));
                this.communitySettings.set(community.id, community.settings);
                
                if (this.options.enableAnalytics) {
                    this.initializeCommunityAnalytics(community.id);
                }

                this.emit('community:created', community);
                return community;
            } else {
                throw new Error('Failed to create community');
            }
        } catch (error) {
            this.emit('community:error', error);
            throw error;
        }
    }

    async updateCommunity(communityId, updates) {
        try {
            const community = this.communities.get(communityId);
            if (!community) {
                throw new Error(`Community ${communityId} not found`);
            }

            const updatedCommunity = {
                ...community,
                ...updates,
                updated: new Date().toISOString()
            };

            this.communities.set(communityId, updatedCommunity);
            this.emit('community:updated', updatedCommunity);
            return updatedCommunity;
        } catch (error) {
            this.emit('community:error', error);
            throw error;
        }
    }

    async deleteCommunity(communityId) {
        try {
            const community = this.communities.get(communityId);
            if (!community) {
                throw new Error(`Community ${communityId} not found`);
            }

            this.communities.delete(communityId);
            this.communityGroups.delete(communityId);
            this.communityMembers.delete(communityId);
            this.communitySettings.delete(communityId);
            this.communityAnalytics.delete(communityId);
            
            this.emit('community:deleted', { communityId, community });
            return { success: true, message: 'Community deleted successfully' };
        } catch (error) {
            this.emit('community:error', error);
            throw error;
        }
    }

    // Member Management
    async addMember(communityId, memberId, role = 'member') {
        try {
            const community = this.communities.get(communityId);
            if (!community) {
                throw new Error(`Community ${communityId} not found`);
            }

            const members = this.communityMembers.get(communityId) || new Set();
            
            if (members.has(memberId)) {
                return { success: false, message: 'Member already exists' };
            }

            if (members.size >= this.options.maxMembersPerCommunity) {
                throw new Error('Maximum members limit reached');
            }

            members.add(memberId);
            this.communityMembers.set(communityId, members);
            
            // Update member count
            community.memberCount = members.size;
            this.communities.set(communityId, community);
            
            this.emit('community:member:added', { communityId, memberId, role });
            return { success: true, message: 'Member added successfully' };
        } catch (error) {
            this.emit('community:error', error);
            throw error;
        }
    }

    async removeMember(communityId, memberId) {
        try {
            const community = this.communities.get(communityId);
            if (!community) {
                throw new Error(`Community ${communityId} not found`);
            }

            const members = this.communityMembers.get(communityId) || new Set();
            
            if (!members.has(memberId)) {
                return { success: false, message: 'Member not found' };
            }

            members.delete(memberId);
            this.communityMembers.set(communityId, members);
            
            // Update member count
            community.memberCount = members.size;
            this.communities.set(communityId, community);
            
            this.emit('community:member:removed', { communityId, memberId });
            return { success: true, message: 'Member removed successfully' };
        } catch (error) {
            this.emit('community:error', error);
            throw error;
        }
    }

    // Group Management within Community
    async addGroupToCommunity(communityId, groupId) {
        try {
            const community = this.communities.get(communityId);
            if (!community) {
                throw new Error(`Community ${communityId} not found`);
            }

            const groups = this.communityGroups.get(communityId) || new Set();
            
            if (groups.has(groupId)) {
                return { success: false, message: 'Group already in community' };
            }

            if (groups.size >= this.options.maxGroupsPerCommunity) {
                throw new Error('Maximum groups per community limit reached');
            }

            groups.add(groupId);
            this.communityGroups.set(communityId, groups);
            
            // Update group count
            community.groupCount = groups.size;
            this.communities.set(communityId, community);
            
            this.emit('community:group:added', { communityId, groupId });
            return { success: true, message: 'Group added to community successfully' };
        } catch (error) {
            this.emit('community:error', error);
            throw error;
        }
    }

    async removeGroupFromCommunity(communityId, groupId) {
        try {
            const community = this.communities.get(communityId);
            if (!community) {
                throw new Error(`Community ${communityId} not found`);
            }

            const groups = this.communityGroups.get(communityId) || new Set();
            
            if (!groups.has(groupId)) {
                return { success: false, message: 'Group not in community' };
            }

            groups.delete(groupId);
            this.communityGroups.set(communityId, groups);
            
            // Update group count
            community.groupCount = groups.size;
            this.communities.set(communityId, community);
            
            this.emit('community:group:removed', { communityId, groupId });
            return { success: true, message: 'Group removed from community successfully' };
        } catch (error) {
            this.emit('community:error', error);
            throw error;
        }
    }

    // Community Search and Discovery
    searchCommunities(query, filters = {}) {
        try {
            let results = Array.from(this.communities.values());

            // Text search
            if (query) {
                const searchTerm = query.toLowerCase();
                results = results.filter(community => 
                    community.name.toLowerCase().includes(searchTerm) ||
                    community.description.toLowerCase().includes(searchTerm)
                );
            }

            // Apply filters
            if (filters.isPrivate !== undefined) {
                results = results.filter(community => community.isPrivate === filters.isPrivate);
            }

            if (filters.minMembers !== undefined) {
                results = results.filter(community => community.memberCount >= filters.minMembers);
            }

            if (filters.maxMembers !== undefined) {
                results = results.filter(community => community.memberCount <= filters.maxMembers);
            }

            if (filters.minGroups !== undefined) {
                results = results.filter(community => community.groupCount >= filters.minGroups);
            }

            // Sort results
            if (filters.sortBy) {
                results.sort((a, b) => {
                    switch (filters.sortBy) {
                        case 'name':
                            return a.name.localeCompare(b.name);
                        case 'members':
                            return b.memberCount - a.memberCount;
                        case 'groups':
                            return b.groupCount - a.groupCount;
                        case 'created':
                            return new Date(b.created) - new Date(a.created);
                        default:
                            return 0;
                    }
                });
            }

            return {
                communities: results,
                total: results.length,
                query: query,
                filters: filters
            };
        } catch (error) {
            this.emit('community:error', error);
            throw error;
        }
    }

    // Analytics
    initializeCommunityAnalytics(communityId) {
        this.communityAnalytics.set(communityId, {
            memberGrowth: [],
            groupActivity: new Map(),
            messageVolume: [],
            engagementMetrics: {
                activeMembers: 0,
                messagesSent: 0,
                averageResponseTime: 0
            }
        });
    }

    recordMemberActivity(communityId, memberId, activity) {
        const analytics = this.communityAnalytics.get(communityId);
        if (analytics) {
            analytics.memberGrowth.push({
                timestamp: new Date().toISOString(),
                memberId: memberId,
                activity: activity
            });
            
            this.communityAnalytics.set(communityId, analytics);
        }
    }

    // Community Announcements
    async sendAnnouncement(communityId, announcement) {
        try {
            const community = this.communities.get(communityId);
            if (!community) {
                throw new Error(`Community ${communityId} not found`);
            }

            if (!community.settings.enableAnnouncements) {
                throw new Error('Announcements are disabled for this community');
            }

            const announcementData = {
                id: this.generateAnnouncementId(),
                communityId: communityId,
                content: announcement.content,
                type: announcement.type || 'text',
                timestamp: new Date().toISOString(),
                author: this.socket.user?.id
            };

            // Send announcement to all members
            const members = this.communityMembers.get(communityId) || new Set();
            const recipients = Array.from(members);

            this.emit('community:announcement:sent', { 
                communityId, 
                announcement: announcementData, 
                recipients 
            });
            
            return announcementData;
        } catch (error) {
            this.emit('community:error', error);
            throw error;
        }
    }

    // Helper methods
    serializeCommunity(community) {
        return [
            { tag: 'name', attrs: {}, content: community.name },
            { tag: 'description', attrs: {}, content: community.description },
            { tag: 'private', attrs: {}, content: community.isPrivate.toString() },
            { tag: 'settings', attrs: {}, content: JSON.stringify(community.settings) }
        ];
    }

    generateCommunityId() {
        return `community_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateAnnouncementId() {
        return `announcement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Event handlers
    handleCommunityUpdate(update) {
        try {
            this.emit('community:server:update', update);
        } catch (error) {
            this.emit('community:error', error);
        }
    }

    handleMemberUpdate(update) {
        try {
            this.emit('community:server:member:update', update);
        } catch (error) {
            this.emit('community:error', error);
        }
    }

    // Getters
    getCommunity(communityId) {
        return this.communities.get(communityId);
    }

    getCommunityMembers(communityId) {
        const members = this.communityMembers.get(communityId) || new Set();
        return Array.from(members);
    }

    getCommunityGroups(communityId) {
        const groups = this.communityGroups.get(communityId) || new Set();
        return Array.from(groups);
    }

    getCommunityAnalytics(communityId) {
        return this.communityAnalytics.get(communityId);
    }

    getAllCommunities() {
        return Array.from(this.communities.values());
    }

    getOwnedCommunities(ownerId) {
        return Array.from(this.communities.values()).filter(community => community.owner === ownerId);
    }

    getMemberCommunities(memberId) {
        const memberCommunities = [];
        
        for (const [communityId, members] of this.communityMembers.entries()) {
            if (members.has(memberId)) {
                const community = this.communities.get(communityId);
                if (community) {
                    memberCommunities.push(community);
                }
            }
        }
        
        return memberCommunities;
    }

    getStatistics() {
        return {
            totalCommunities: this.communities.size,
            totalMembers: Array.from(this.communityMembers.values()).reduce((sum, set) => sum + set.size, 0),
            totalGroups: Array.from(this.communityGroups.values()).reduce((sum, set) => sum + set.size, 0),
            averageMembersPerCommunity: this.communities.size > 0 ? 
                Array.from(this.communityMembers.values()).reduce((sum, set) => sum + set.size, 0) / this.communities.size : 0,
            averageGroupsPerCommunity: this.communities.size > 0 ? 
                Array.from(this.communityGroups.values()).reduce((sum, set) => sum + set.size, 0) / this.communities.size : 0
        };
    }
}

module.exports = WACommunity;