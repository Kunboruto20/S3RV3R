class WAGroupDefaults {
    static getDefaults() {
        return {
            // Group creation settings
            creation: {
                enableGroupCreation: true,
                maxParticipants: 1024,
                minParticipants: 2,
                maxNameLength: 25,
                maxDescriptionLength: 512,
                enableProfilePicture: true,
                maxProfilePictureSize: 2 * 1024 * 1024, // 2MB
                enableAnnouncements: true,
                defaultAnnouncementMode: false,
                enableRestrictedMode: true,
                defaultRestrictedMode: false
            },
            
            // Group management settings
            management: {
                enableParticipantManagement: true,
                enableAdminPromotion: true,
                enableAdminDemotion: true,
                maxAdmins: 50,
                enableParticipantRemoval: true,
                enableParticipantAddition: true,
                enableBulkOperations: true,
                maxBulkOperationSize: 20,
                operationTimeout: 30000,
                enableOperationRetry: true,
                maxOperationRetries: 3
            },
            
            // Group permissions
            permissions: {
                // Who can send messages
                sendMessages: {
                    adminsOnly: false,
                    allowedRoles: ['admin', 'participant'],
                    enableMessageApproval: false,
                    approvalTimeout: 300000 // 5 minutes
                },
                
                // Who can edit group info
                editGroupInfo: {
                    adminsOnly: true,
                    allowedRoles: ['admin'],
                    enableEditHistory: true,
                    maxEditHistory: 50
                },
                
                // Who can add participants
                addParticipants: {
                    adminsOnly: false,
                    allowedRoles: ['admin', 'participant'],
                    requireApproval: false,
                    approvalTimeout: 600000, // 10 minutes
                    maxPendingInvites: 100
                },
                
                // Who can remove participants
                removeParticipants: {
                    adminsOnly: true,
                    allowedRoles: ['admin'],
                    enableSelfRemoval: true,
                    requireConfirmation: true
                }
            },
            
            // Group invites
            invites: {
                enableInviteLinks: true,
                linkExpirationTime: 2592000000, // 30 days
                enableLinkRevocation: true,
                maxActiveLinks: 5,
                enableLinkTracking: true,
                requireApproval: false,
                approvalTimeout: 86400000, // 24 hours
                maxPendingApprovals: 50,
                enableInviteHistory: true,
                maxInviteHistory: 100
            },
            
            // Group media settings
            media: {
                enableMediaSharing: true,
                maxMediaSize: 64 * 1024 * 1024, // 64MB
                allowedMediaTypes: ['image', 'video', 'audio', 'document', 'sticker'],
                enableMediaApproval: false,
                mediaApprovalTimeout: 300000, // 5 minutes
                enableMediaHistory: true,
                maxMediaHistory: 1000,
                enableMediaDownload: true,
                enableMediaForwarding: true
            },
            
            // Group messaging
            messaging: {
                enableGroupMessaging: true,
                maxMessageLength: 4096,
                enableMessageReactions: true,
                enableMessageReplies: true,
                enableMessageForwarding: true,
                enableMessageDeletion: true,
                enableMessageEditing: false,
                enableMessageStarring: true,
                enableMentions: true,
                maxMentions: 5,
                enableBroadcastMessages: true
            },
            
            // Group notifications
            notifications: {
                enableGroupNotifications: true,
                notifyOnJoin: true,
                notifyOnLeave: true,
                notifyOnAdminChange: true,
                notifyOnGroupInfoChange: true,
                notifyOnParticipantAdd: true,
                notifyOnParticipantRemove: true,
                notifyOnMessageReceived: true,
                enableCustomNotifications: true,
                notificationSound: 'default',
                enableQuietHours: false,
                quietHoursStart: '22:00',
                quietHoursEnd: '08:00'
            },
            
            // Group privacy settings
            privacy: {
                whoCanAddMe: 'everyone', // 'everyone', 'contacts', 'nobody'
                whoCanSeeMyGroups: 'contacts', // 'everyone', 'contacts', 'nobody'
                enableGroupInviteApproval: false,
                enableParticipantApproval: false,
                hideParticipantsList: false,
                hideGroupFromSearch: false,
                enableEndToEndEncryption: true,
                enableDisappearingMessages: false,
                disappearingMessageDuration: 604800 // 7 days
            },
            
            // Group archiving and backup
            archiving: {
                enableAutoArchive: false,
                autoArchiveAfterDays: 30,
                enableManualArchive: true,
                enableGroupBackup: true,
                backupInterval: 86400000, // 24 hours
                maxBackups: 7,
                backupCompression: true,
                backupEncryption: true,
                includeMedia: false,
                includeMessages: true
            },
            
            // Group analytics
            analytics: {
                enableGroupAnalytics: false,
                trackParticipantActivity: true,
                trackMessageStats: true,
                trackMediaStats: true,
                trackJoinLeaveStats: true,
                retentionPeriod: 2592000000, // 30 days
                enableExport: false,
                exportFormat: 'json',
                enableAnonymization: true
            },
            
            // Group moderation
            moderation: {
                enableAutoModeration: false,
                enableSpamDetection: false,
                spamThreshold: 5,
                enableProfanityFilter: false,
                profanityAction: 'warn', // 'warn', 'delete', 'mute', 'remove'
                enableFloodProtection: false,
                floodThreshold: 10,
                floodTimeWindow: 60000, // 1 minute
                enableLinkDetection: false,
                linkAction: 'allow', // 'allow', 'warn', 'delete'
                enableMentionLimit: false,
                maxMentionsPerMessage: 5
            },
            
            // Group roles and hierarchy
            roles: {
                enableCustomRoles: false,
                availableRoles: ['owner', 'admin', 'moderator', 'participant'],
                roleHierarchy: {
                    owner: 4,
                    admin: 3,
                    moderator: 2,
                    participant: 1
                },
                rolePermissions: {
                    owner: ['all'],
                    admin: ['manage_participants', 'edit_group', 'delete_messages'],
                    moderator: ['delete_messages', 'mute_participants'],
                    participant: ['send_messages', 'react_messages']
                },
                enableRoleAssignment: true,
                maxRoleChangesPerDay: 10
            },
            
            // Group scheduling
            scheduling: {
                enableScheduledMessages: false,
                maxScheduledMessages: 50,
                maxScheduleTime: 2592000000, // 30 days
                enableRecurringMessages: false,
                enableGroupEvents: false,
                maxEvents: 20,
                eventReminderTime: 3600000, // 1 hour
                enableEventNotifications: true
            },
            
            // Group integration
            integration: {
                enableBots: false,
                maxBots: 5,
                enableWebhooks: false,
                maxWebhooks: 10,
                webhookTimeout: 30000,
                enableAPIAccess: false,
                apiRateLimit: 100, // requests per minute
                enableThirdPartyIntegrations: false,
                allowedDomains: []
            },
            
            // Group search and discovery
            discovery: {
                enableGroupSearch: true,
                enablePublicGroups: false,
                enableGroupDirectory: false,
                enableGroupCategories: false,
                availableCategories: ['general', 'business', 'education', 'entertainment'],
                enableGroupTags: false,
                maxTags: 5,
                enableGroupRating: false,
                enableGroupReviews: false
            },
            
            // Group limits and quotas
            limits: {
                maxGroupsPerUser: 256,
                maxOwnedGroups: 50,
                maxAdminGroups: 100,
                maxMessagesPerDay: 1000,
                maxMediaPerDay: 100,
                maxInvitesPerDay: 50,
                maxParticipantChangesPerDay: 20,
                groupCreationCooldown: 3600000, // 1 hour
                participantAddCooldown: 60000 // 1 minute
            },
            
            // Group performance
            performance: {
                enableLazyLoading: true,
                messageLoadBatchSize: 50,
                participantLoadBatchSize: 100,
                enableCaching: true,
                cacheTimeout: 300000, // 5 minutes
                enableCompression: true,
                compressionLevel: 6,
                enableOptimization: true,
                maxMemoryUsage: 100 * 1024 * 1024 // 100MB
            },
            
            // Group security
            security: {
                enableEncryption: true,
                encryptionAlgorithm: 'aes-256-gcm',
                enableIntegrityChecks: true,
                enableAccessControl: true,
                enableAuditLog: true,
                auditLogRetention: 2592000000, // 30 days
                enableSuspiciousActivityDetection: false,
                enableBruteForceProtection: true,
                maxFailedAttempts: 5,
                lockoutDuration: 900000 // 15 minutes
            },
            
            // Group compliance
            compliance: {
                enableDataRetention: true,
                dataRetentionPeriod: 2592000000, // 30 days
                enableDataExport: false,
                enableDataDeletion: true,
                enableGDPRCompliance: false,
                enableCCPACompliance: false,
                enableConsentManagement: false,
                enablePrivacySettings: true
            },
            
            // Group customization
            customization: {
                enableCustomThemes: false,
                availableThemes: ['default', 'dark', 'light'],
                enableCustomEmojis: false,
                maxCustomEmojis: 50,
                enableCustomStickers: false,
                maxCustomStickers: 100,
                enableCustomSounds: false,
                enableGroupBranding: false,
                enableWallpapers: false
            }
        };
    }
    
    static getBusinessDefaults() {
        const defaults = this.getDefaults();
        
        return {
            ...defaults,
            creation: {
                ...defaults.creation,
                maxParticipants: 256,
                enableAnnouncements: true,
                defaultAnnouncementMode: true
            },
            permissions: {
                ...defaults.permissions,
                sendMessages: {
                    ...defaults.permissions.sendMessages,
                    adminsOnly: true
                },
                addParticipants: {
                    ...defaults.permissions.addParticipants,
                    adminsOnly: true,
                    requireApproval: true
                }
            },
            analytics: {
                ...defaults.analytics,
                enableGroupAnalytics: true,
                trackParticipantActivity: true,
                trackMessageStats: true
            },
            moderation: {
                ...defaults.moderation,
                enableAutoModeration: true,
                enableSpamDetection: true,
                enableProfanityFilter: true
            }
        };
    }
    
    static getEducationDefaults() {
        const defaults = this.getDefaults();
        
        return {
            ...defaults,
            creation: {
                ...defaults.creation,
                maxParticipants: 500,
                enableAnnouncements: true,
                defaultAnnouncementMode: false
            },
            permissions: {
                ...defaults.permissions,
                sendMessages: {
                    ...defaults.permissions.sendMessages,
                    enableMessageApproval: true
                }
            },
            scheduling: {
                ...defaults.scheduling,
                enableScheduledMessages: true,
                enableGroupEvents: true,
                enableEventNotifications: true
            },
            moderation: {
                ...defaults.moderation,
                enableAutoModeration: true,
                enableLinkDetection: true,
                linkAction: 'warn'
            }
        };
    }
    
    static getMinimalDefaults() {
        return {
            creation: {
                enableGroupCreation: true,
                maxParticipants: 256,
                maxNameLength: 25
            },
            management: {
                enableParticipantManagement: true,
                enableAdminPromotion: true
            },
            messaging: {
                enableGroupMessaging: true,
                maxMessageLength: 4096
            },
            privacy: {
                whoCanAddMe: 'everyone',
                enableEndToEndEncryption: true
            }
        };
    }
    
    static validateDefaults(options) {
        const errors = [];
        
        if (options.creation?.maxParticipants > 1024) {
            errors.push('Max participants cannot exceed 1024');
        }
        
        if (options.creation?.maxNameLength > 25) {
            errors.push('Max group name length cannot exceed 25 characters');
        }
        
        if (options.creation?.maxDescriptionLength > 512) {
            errors.push('Max group description length cannot exceed 512 characters');
        }
        
        if (options.messaging?.maxMessageLength > 4096) {
            errors.push('Max message length cannot exceed 4096 characters');
        }
        
        if (options.media?.maxMediaSize > 100 * 1024 * 1024) {
            errors.push('Max media size cannot exceed 100MB');
        }
        
        if (options.limits?.maxGroupsPerUser > 512) {
            errors.push('Max groups per user cannot exceed 512');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = WAGroupDefaults;