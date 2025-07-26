const { Buffer } = require('buffer');

class WABinary {
    constructor() {
        // WhatsApp binary protocol constants
        this.TAGS = {
            LIST_EMPTY: 0,
            STREAM_END: 2,
            DICTIONARY_0: 236,
            DICTIONARY_1: 237,
            DICTIONARY_2: 238,
            DICTIONARY_3: 239,
            LIST_8: 248,
            LIST_16: 249,
            JID_PAIR: 250,
            HEX_8: 251,
            BINARY_8: 252,
            BINARY_20: 253,
            BINARY_32: 254,
            NIBBLE_8: 255
        };
        
        // WhatsApp dictionaries for compression
        this.SINGLE_BYTE_TOKENS = [
            null, null, null, "200", "400", "404", "500", "501", "502", "action", "add",
            "after", "archive", "author", "available", "battery", "before", "body",
            "broadcast", "chat", "clear", "code", "composing", "contacts", "count",
            "create", "debug", "delete", "demote", "duplicate", "encoding", "error",
            "false", "filehash", "from", "g.us", "group", "groups_v2", "height", "id",
            "image", "in", "index", "invis", "item", "jid", "kind", "last", "leave",
            "live", "log", "media", "message", "mimetype", "missing", "modify", "name",
            "notification", "notify", "out", "owner", "participant", "paused", "picture",
            "played", "presence", "preview", "promote", "query", "quoted", "read",
            "receipt", "received", "recipient", "recording", "relay", "remove", "response",
            "resume", "retry", "s.whatsapp.net", "seconds", "set", "size", "status",
            "subject", "subscribe", "t", "text", "to", "true", "type", "unarchive",
            "unavailable", "url", "user", "value", "web", "width", "mute", "read_only",
            "admin", "creator", "default", "frequent", "history", "on_demand", "pending",
            "priority", "push_name", "restrict", "typing", "unpin", "archive", "pin",
            "announcement", "locked", "security", "multicast", "not_spam", "ephemeral",
            "vcard", "frequent", "privacy", "blacklist", "whitelist", "verify",
            "location", "document", "elapsed", "msg_secret", "duration", "abt",
            "off", "new", "relay", "chunked_encoding"
        ];
        
        this.DOUBLE_BYTE_TOKENS = [
            [null], // 0
            ["stream:error", "urn:ietf:params:xml:ns:xmpp-streams"], // 1
            ["stream", "urn:ietf:params:xml:ns:xmpp-streams"], // 2
            // Add more dictionaries as needed
        ];
        
        this.textDecoder = new TextDecoder('utf-8');
        this.textEncoder = new TextEncoder();
    }
    
    // Main encoding function
    encodeNode(node) {
        if (!node) {
            return Buffer.from([this.TAGS.LIST_EMPTY]);
        }
        
        const buffer = [];
        this.writeNode(node, buffer);
        return Buffer.concat(buffer);
    }
    
    // Main decoding function
    decodeNode(buffer) {
        if (!buffer || buffer.length === 0) {
            return null;
        }
        
        const reader = new BinaryReader(buffer);
        return this.readNode(reader);
    }
    
    // Write node to buffer
    writeNode(node, buffer) {
        if (node === null || node === undefined) {
            buffer.push(Buffer.from([this.TAGS.LIST_EMPTY]));
            return;
        }
        
        const { tag, attrs, content } = node;
        
        // Calculate list size
        let listSize = 1; // tag
        if (attrs && Object.keys(attrs).length > 0) {
            listSize += Object.keys(attrs).length * 2; // key-value pairs
        }
        if (content !== null && content !== undefined) {
            if (Array.isArray(content)) {
                listSize += content.length;
            } else {
                listSize += 1;
            }
        }
        
        // Write list header
        this.writeListSize(listSize, buffer);
        
        // Write tag
        this.writeString(tag, buffer);
        
        // Write attributes
        if (attrs) {
            for (const [key, value] of Object.entries(attrs)) {
                this.writeString(key, buffer);
                this.writeString(value, buffer);
            }
        }
        
        // Write content
        if (content !== null && content !== undefined) {
            if (Array.isArray(content)) {
                for (const child of content) {
                    this.writeNode(child, buffer);
                }
            } else if (typeof content === 'string') {
                this.writeString(content, buffer);
            } else if (Buffer.isBuffer(content)) {
                this.writeBinary(content, buffer);
            } else {
                this.writeNode(content, buffer);
            }
        }
    }
    
    // Read node from buffer
    readNode(reader) {
        const listSize = this.readListSize(reader);
        
        if (listSize === 0) {
            return null;
        }
        
        const tag = this.readString(reader);
        const node = { tag, attrs: {}, content: null };
        
        let attributeCount = 0;
        let contentStart = 1; // After tag
        
        // Read attributes (key-value pairs)
        for (let i = 1; i < listSize; i += 2) {
            const nextByte = reader.peek();
            if (this.isStringTag(nextByte)) {
                const key = this.readString(reader);
                const value = this.readString(reader);
                node.attrs[key] = value;
                attributeCount += 2;
                i++; // Skip one more since we read two items
            } else {
                break;
            }
        }
        
        contentStart += attributeCount;
        
        // Read content
        const contentCount = listSize - contentStart;
        if (contentCount === 1) {
            const nextByte = reader.peek();
            if (this.isStringTag(nextByte)) {
                node.content = this.readString(reader);
            } else if (this.isBinaryTag(nextByte)) {
                node.content = this.readBinary(reader);
            } else {
                node.content = this.readNode(reader);
            }
        } else if (contentCount > 1) {
            node.content = [];
            for (let i = 0; i < contentCount; i++) {
                const child = this.readNode(reader);
                if (child !== null) {
                    node.content.push(child);
                }
            }
        }
        
        return node;
    }
    
    // Write list size
    writeListSize(size, buffer) {
        if (size === 0) {
            buffer.push(Buffer.from([this.TAGS.LIST_EMPTY]));
        } else if (size < 256) {
            buffer.push(Buffer.from([this.TAGS.LIST_8, size]));
        } else {
            buffer.push(Buffer.from([this.TAGS.LIST_16, size >> 8, size & 0xFF]));
        }
    }
    
    // Read list size
    readListSize(reader) {
        const tag = reader.readByte();
        
        switch (tag) {
            case this.TAGS.LIST_EMPTY:
                return 0;
            case this.TAGS.LIST_8:
                return reader.readByte();
            case this.TAGS.LIST_16:
                return (reader.readByte() << 8) | reader.readByte();
            default:
                throw new Error(`Invalid list size tag: ${tag}`);
        }
    }
    
    // Write string
    writeString(str, buffer) {
        if (!str || str.length === 0) {
            buffer.push(Buffer.from([this.TAGS.LIST_EMPTY]));
            return;
        }
        
        // Try to find in single byte dictionary
        const singleByteIndex = this.SINGLE_BYTE_TOKENS.indexOf(str);
        if (singleByteIndex >= 0 && singleByteIndex < 236) {
            buffer.push(Buffer.from([singleByteIndex]));
            return;
        }
        
        // Try to find in double byte dictionaries
        for (let dictIndex = 0; dictIndex < this.DOUBLE_BYTE_TOKENS.length; dictIndex++) {
            const dict = this.DOUBLE_BYTE_TOKENS[dictIndex];
            const tokenIndex = dict.indexOf(str);
            if (tokenIndex >= 0) {
                buffer.push(Buffer.from([this.TAGS.DICTIONARY_0 + dictIndex, tokenIndex]));
                return;
            }
        }
        
        // Write as raw string
        const strBytes = this.textEncoder.encode(str);
        if (strBytes.length < 256) {
            buffer.push(Buffer.from([this.TAGS.BINARY_8, strBytes.length]));
        } else if (strBytes.length < 1048576) { // 20-bit
            buffer.push(Buffer.from([
                this.TAGS.BINARY_20,
                (strBytes.length >> 16) & 0x0F,
                (strBytes.length >> 8) & 0xFF,
                strBytes.length & 0xFF
            ]));
        } else {
            buffer.push(Buffer.from([
                this.TAGS.BINARY_32,
                (strBytes.length >> 24) & 0xFF,
                (strBytes.length >> 16) & 0xFF,
                (strBytes.length >> 8) & 0xFF,
                strBytes.length & 0xFF
            ]));
        }
        buffer.push(Buffer.from(strBytes));
    }
    
    // Read string
    readString(reader) {
        const tag = reader.readByte();
        
        if (tag === this.TAGS.LIST_EMPTY) {
            return '';
        }
        
        // Single byte token
        if (tag < 236) {
            return this.SINGLE_BYTE_TOKENS[tag] || '';
        }
        
        // Double byte token
        if (tag >= this.TAGS.DICTIONARY_0 && tag <= this.TAGS.DICTIONARY_3) {
            const dictIndex = tag - this.TAGS.DICTIONARY_0;
            const tokenIndex = reader.readByte();
            const dict = this.DOUBLE_BYTE_TOKENS[dictIndex];
            return dict && dict[tokenIndex] ? dict[tokenIndex] : '';
        }
        
        // Raw string
        let length = 0;
        switch (tag) {
            case this.TAGS.BINARY_8:
                length = reader.readByte();
                break;
            case this.TAGS.BINARY_20:
                length = (reader.readByte() << 16) | (reader.readByte() << 8) | reader.readByte();
                break;
            case this.TAGS.BINARY_32:
                length = (reader.readByte() << 24) | (reader.readByte() << 16) | 
                        (reader.readByte() << 8) | reader.readByte();
                break;
            default:
                throw new Error(`Invalid string tag: ${tag}`);
        }
        
        const bytes = reader.readBytes(length);
        return this.textDecoder.decode(bytes);
    }
    
    // Write binary data
    writeBinary(data, buffer) {
        if (!data || data.length === 0) {
            buffer.push(Buffer.from([this.TAGS.LIST_EMPTY]));
            return;
        }
        
        if (data.length < 256) {
            buffer.push(Buffer.from([this.TAGS.BINARY_8, data.length]));
        } else if (data.length < 1048576) { // 20-bit
            buffer.push(Buffer.from([
                this.TAGS.BINARY_20,
                (data.length >> 16) & 0x0F,
                (data.length >> 8) & 0xFF,
                data.length & 0xFF
            ]));
        } else {
            buffer.push(Buffer.from([
                this.TAGS.BINARY_32,
                (data.length >> 24) & 0xFF,
                (data.length >> 16) & 0xFF,
                (data.length >> 8) & 0xFF,
                data.length & 0xFF
            ]));
        }
        buffer.push(data);
    }
    
    // Read binary data
    readBinary(reader) {
        const tag = reader.readByte();
        
        if (tag === this.TAGS.LIST_EMPTY) {
            return Buffer.alloc(0);
        }
        
        let length = 0;
        switch (tag) {
            case this.TAGS.BINARY_8:
                length = reader.readByte();
                break;
            case this.TAGS.BINARY_20:
                length = (reader.readByte() << 16) | (reader.readByte() << 8) | reader.readByte();
                break;
            case this.TAGS.BINARY_32:
                length = (reader.readByte() << 24) | (reader.readByte() << 16) | 
                        (reader.readByte() << 8) | reader.readByte();
                break;
            default:
                throw new Error(`Invalid binary tag: ${tag}`);
        }
        
        return reader.readBytes(length);
    }
    
    // Helper methods
    isStringTag(tag) {
        return tag < 236 || 
               (tag >= this.TAGS.DICTIONARY_0 && tag <= this.TAGS.DICTIONARY_3) ||
               tag === this.TAGS.BINARY_8 || 
               tag === this.TAGS.BINARY_20 || 
               tag === this.TAGS.BINARY_32;
    }
    
    isBinaryTag(tag) {
        return tag === this.TAGS.BINARY_8 || 
               tag === this.TAGS.BINARY_20 || 
               tag === this.TAGS.BINARY_32;
    }
    
    // JID utilities
    writeJid(jid, buffer) {
        if (!jid) {
            buffer.push(Buffer.from([this.TAGS.LIST_EMPTY]));
            return;
        }
        
        const parts = jid.split('@');
        if (parts.length === 2) {
            buffer.push(Buffer.from([this.TAGS.JID_PAIR]));
            this.writeString(parts[0], buffer);
            this.writeString(parts[1], buffer);
        } else {
            this.writeString(jid, buffer);
        }
    }
    
    readJid(reader) {
        const tag = reader.peek();
        
        if (tag === this.TAGS.JID_PAIR) {
            reader.readByte(); // consume JID_PAIR tag
            const user = this.readString(reader);
            const server = this.readString(reader);
            return `${user}@${server}`;
        } else {
            return this.readString(reader);
        }
    }
    
    // Hex utilities
    writeHex(hex, buffer) {
        if (!hex || hex.length === 0) {
            buffer.push(Buffer.from([this.TAGS.LIST_EMPTY]));
            return;
        }
        
        const bytes = Buffer.from(hex, 'hex');
        if (bytes.length < 256) {
            buffer.push(Buffer.from([this.TAGS.HEX_8, bytes.length]));
        } else {
            // Fall back to binary
            this.writeBinary(bytes, buffer);
            return;
        }
        buffer.push(bytes);
    }
    
    readHex(reader) {
        const tag = reader.readByte();
        
        if (tag === this.TAGS.LIST_EMPTY) {
            return '';
        }
        
        if (tag === this.TAGS.HEX_8) {
            const length = reader.readByte();
            const bytes = reader.readBytes(length);
            return bytes.toString('hex');
        }
        
        throw new Error(`Invalid hex tag: ${tag}`);
    }
    
    // Nibble utilities (4-bit encoding)
    writeNibble(value, buffer) {
        if (value < 0 || value > 255) {
            throw new Error('Nibble value must be between 0 and 255');
        }
        
        buffer.push(Buffer.from([this.TAGS.NIBBLE_8, value]));
    }
    
    readNibble(reader) {
        const tag = reader.readByte();
        
        if (tag !== this.TAGS.NIBBLE_8) {
            throw new Error(`Invalid nibble tag: ${tag}`);
        }
        
        return reader.readByte();
    }
    
    // Utility methods
    nodeToString(node, indent = 0) {
        if (!node) return 'null';
        
        const spaces = '  '.repeat(indent);
        let result = `${spaces}<${node.tag}`;
        
        // Add attributes
        if (node.attrs && Object.keys(node.attrs).length > 0) {
            for (const [key, value] of Object.entries(node.attrs)) {
                result += ` ${key}="${value}"`;
            }
        }
        
        if (!node.content || (Array.isArray(node.content) && node.content.length === 0)) {
            result += ' />';
        } else {
            result += '>';
            
            if (typeof node.content === 'string') {
                result += node.content;
            } else if (Buffer.isBuffer(node.content)) {
                result += `[Binary: ${node.content.length} bytes]`;
            } else if (Array.isArray(node.content)) {
                result += '\n';
                for (const child of node.content) {
                    result += this.nodeToString(child, indent + 1) + '\n';
                }
                result += spaces;
            }
            
            result += `</${node.tag}>`;
        }
        
        return result;
    }
    
    validateNode(node) {
        if (!node) return false;
        if (typeof node.tag !== 'string') return false;
        if (node.attrs && typeof node.attrs !== 'object') return false;
        
        if (node.content !== null && node.content !== undefined) {
            if (Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (!this.validateNode(child)) return false;
                }
            } else if (typeof node.content !== 'string' && !Buffer.isBuffer(node.content)) {
                return this.validateNode(node.content);
            }
        }
        
        return true;
    }
}

// Binary reader helper class
class BinaryReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }
    
    readByte() {
        if (this.offset >= this.buffer.length) {
            throw new Error('Buffer overflow');
        }
        return this.buffer[this.offset++];
    }
    
    readBytes(length) {
        if (this.offset + length > this.buffer.length) {
            throw new Error('Buffer overflow');
        }
        const result = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return result;
    }
    
    peek() {
        if (this.offset >= this.buffer.length) {
            throw new Error('Buffer overflow');
        }
        return this.buffer[this.offset];
    }
    
    hasMore() {
        return this.offset < this.buffer.length;
    }
    
    remaining() {
        return this.buffer.length - this.offset;
    }
}

module.exports = WABinary;