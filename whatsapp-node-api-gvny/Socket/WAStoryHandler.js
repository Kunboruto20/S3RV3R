/**
 * WhatsApp Story Handler
 */

const EventEmitter = require('events');

class WAStoryHandler extends EventEmitter {
    constructor(socket) {
        super();
        this.socket = socket;
        this.stories = new Map();
        this.initialize();
    }

    initialize() {
        console.log('📖 WAStoryHandler initialized');
    }

    async createStory(content, options = {}) {
        try {
            const story = {
                id: `story_${Date.now()}`,
                content,
                timestamp: Date.now(),
                views: 0,
                ...options
            };
            
            this.stories.set(story.id, story);
            this.emit('story.created', story);
            return { success: true, storyId: story.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    getStories() {
        return Array.from(this.stories.values());
    }

    async viewStory(storyId) {
        const story = this.stories.get(storyId);
        if (story) {
            story.views++;
            this.emit('story.viewed', story);
            return { success: true };
        }
        return { success: false, error: 'Story not found' };
    }
}

module.exports = WAStoryHandler;