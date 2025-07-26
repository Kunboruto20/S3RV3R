# WhatsApp Node API GVNY

<div align="center">

![WhatsApp Node API](https://img.shields.io/badge/WhatsApp-Node.js-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![Version](https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-16+-green?style=for-the-badge&logo=node.js)
![License](https://img.shields.io/badge/license-MIT-yellow?style=for-the-badge)

**A comprehensive, production-ready WhatsApp Web API library for Node.js**

*Complete with QR code authentication, messaging, business features, and more*

</div>

---

## 🚀 Features

### 🔐 **Authentication & Security**
- ✅ **QR Code Authentication** - Full QR code generation and validation
- ✅ **Pairing Code Support** - Alternative authentication method
- ✅ **Session Management** - Secure session handling and persistence
- ✅ **End-to-End Encryption** - Advanced cryptographic utilities
- ✅ **Multi-Device Support** - Handle multiple WhatsApp sessions

### 💬 **Messaging**
- ✅ **Text Messages** - Send and receive text messages
- ✅ **Media Messages** - Images, videos, audio, documents
- ✅ **Message Reactions** - React to messages with emojis
- ✅ **Message Editing** - Edit sent messages
- ✅ **Message Forwarding** - Forward messages between chats
- ✅ **Read Receipts** - Track message delivery and read status

### 👥 **Groups & Communities**
- ✅ **Group Management** - Create, update, and manage groups
- ✅ **Participant Control** - Add, remove, promote, demote members
- ✅ **Group Settings** - Configure group permissions and settings
- ✅ **Community Features** - Handle WhatsApp Communities
- ✅ **Group Invites** - Generate and manage group invite links

### 📞 **Calls**
- ✅ **Voice Calls** - Handle voice call events
- ✅ **Video Calls** - Manage video call functionality
- ✅ **Group Calls** - Support for group calling
- ✅ **Call History** - Track and manage call records

### 🏪 **Business Features**
- ✅ **WhatsApp Business** - Full business account support
- ✅ **Product Catalogs** - Manage business catalogs and products
- ✅ **Order Management** - Handle customer orders
- ✅ **Payment Integration** - Process payments and transactions
- ✅ **Business Profiles** - Manage business information

### 📱 **Stories & Status**
- ✅ **Story Management** - Create, view, and manage stories
- ✅ **Status Updates** - Handle status/story updates
- ✅ **Story Reactions** - React to stories
- ✅ **Privacy Controls** - Manage story visibility

### 🔧 **Advanced Features**
- ✅ **Middleware Support** - Custom message processing
- ✅ **Plugin System** - Extensible architecture
- ✅ **WebHook Integration** - External service integration
- ✅ **Event Management** - Comprehensive event handling
- ✅ **Database Integration** - Data persistence and storage
- ✅ **Configuration Management** - Flexible configuration system

---

## 📦 Installation

```bash
npm install whatsapp-node-api-gvny
```

### Dependencies

The library requires Node.js 16+ and includes the following core dependencies:

```json
{
  "ws": "^8.14.2",
  "qrcode": "^1.5.3",
  "protobufjs": "^7.2.5",
  "sharp": "^0.32.6",
  "curve25519-js": "^0.0.4"
}
```

---

## 🚀 Quick Start

### Basic Usage

```javascript
const { WhatsAppAPI } = require('whatsapp-node-api-gvny');

// Initialize the WhatsApp API
const whatsapp = new WhatsAppAPI({
    enableLogging: true,
    logLevel: 'info',
    enableAuth: true,
    enableStore: true
});

// Connect to WhatsApp
async function start() {
    try {
        await whatsapp.connect();
        console.log('✅ Connected to WhatsApp!');
        
        // Send a message
        await whatsapp.sendMessage('1234567890@s.whatsapp.net', {
            text: 'Hello from WhatsApp Node API!'
        });
        
    } catch (error) {
        console.error('❌ Connection failed:', error);
    }
}

start();
```

### QR Code Authentication

```javascript
const { WAAuth, WAAuthValidator } = require('whatsapp-node-api-gvny');

async function authenticateWithQR() {
    const auth = new WAAuth();
    const validator = new WAAuthValidator();
    
    // Generate QR code data
    const qrData = await auth.generateQR();
    console.log('📱 QR Code generated:', qrData.ref);
    
    // Create QR string for display
    const qrString = `${qrData.ref},${qrData.publicKey},${qrData.identityKey},${Date.now()}`;
    
    // Validate QR code
    const validation = validator.validateQRCode(qrString);
    if (validation.valid) {
        console.log('✅ QR Code is valid and ready for scanning');
        // Display QR code to user for scanning
    }
}
```

### Pairing Code Authentication

```javascript
async function authenticateWithPairingCode() {
    const auth = new WAAuth();
    const validator = new WAAuthValidator();
    
    // Generate pairing code
    const pairingData = await auth.generatePairingCode();
    console.log('🔐 Pairing Code:', pairingData.code);
    console.log('⏰ Expires:', new Date(pairingData.expires));
    
    // Validate pairing code
    const validation = validator.validatePairingCode(pairingData.code);
    if (validation.valid) {
        console.log('✅ Pairing code is valid');
    }
}
```

---

## 📚 API Documentation

### Core Classes

#### `WhatsAppAPI`
Main class for WhatsApp operations.

```javascript
const whatsapp = new WhatsAppAPI(options);
```

**Options:**
- `enableLogging` (boolean): Enable logging (default: true)
- `logLevel` (string): Log level ('info', 'debug', 'error')
- `enableAuth` (boolean): Enable authentication (default: true)
- `enableStore` (boolean): Enable data storage (default: true)
- `enableEvents` (boolean): Enable event management (default: true)

**Methods:**
- `connect(authOptions)`: Connect to WhatsApp
- `disconnect()`: Disconnect from WhatsApp
- `sendMessage(jid, message, options)`: Send a message
- `getMessages(jid, options)`: Get messages from a chat
- `getChats(options)`: Get all chats
- `getContacts(options)`: Get all contacts

#### `WAHelper`
Utility functions for WhatsApp operations.

```javascript
const { WAHelper } = require('whatsapp-node-api-gvny');
const helper = new WAHelper();

// Phone number utilities
const cleaned = helper.cleanPhoneNumber('+1 (234) 567-8900');
const jid = helper.createUserJid('1234567890');
const isValid = helper.isValidPhoneNumber('+1234567890');

// JID utilities
const isUserJid = helper.isUserJid('1234567890@s.whatsapp.net');
const isGroupJid = helper.isGroupJid('123456789@g.us');

// Message utilities
const messageId = helper.generateMessageId();
const timestamp = helper.getTimestamp();
```

#### `WAAuthValidator`
Authentication validation and token management.

```javascript
const { WAAuthValidator } = require('whatsapp-node-api-gvny');
const validator = new WAAuthValidator();

// QR code validation
const qrResult = validator.validateQRCode(qrString);

// Pairing code validation
const pairingResult = validator.validatePairingCode('ABCD1234');

// Session token management
const token = validator.generateSessionToken('userId', 'sessionId');
const tokenValidation = validator.validateSessionToken(token);
```

#### `WAEncryption`
Cryptographic utilities and security functions.

```javascript
const { WAEncryption } = require('whatsapp-node-api-gvny');
const encryption = new WAEncryption();

// Generate secure random data
const randomBytes = encryption.generateSecureRandom(32);
const uuid = encryption.generateSecureUUID();

// Hashing and HMAC
const hashResult = encryption.hashWithSalt('data');
const hmac = encryption.generateHMAC('data', 'key');

// Digital signatures
const signature = encryption.sign('data', privateKey);
const isValid = encryption.verify('data', signature, publicKey);
```

---

## 🔧 Advanced Usage

### Event Handling

```javascript
const { WAEventManager } = require('whatsapp-node-api-gvny');

// Mock socket for demonstration
const mockSocket = {
    on: (event, handler) => { /* implementation */ },
    emit: (event, data) => { /* implementation */ }
};

const eventManager = new WAEventManager(mockSocket);

// Listen for message events
eventManager.on('message.received', (message) => {
    console.log('📨 New message:', message);
});

// Listen for connection events
eventManager.on('connection.update', (update) => {
    console.log('🔄 Connection update:', update);
});
```

### Group Management

```javascript
const { WAGroupManager } = require('whatsapp-node-api-gvny');

const groupManager = new WAGroupManager(socket);

// Create a group
const group = await groupManager.createGroup({
    subject: 'My Group',
    description: 'A test group',
    participants: ['1234567890@s.whatsapp.net', '0987654321@s.whatsapp.net']
});

// Add participants
await groupManager.addParticipants(group.id, ['1111111111@s.whatsapp.net']);

// Update group settings
await groupManager.updateGroupSettings(group.id, {
    restrictMessages: true,
    allowInvites: false
});
```

### Business Features

```javascript
const { WABusinessManager } = require('whatsapp-node-api-gvny');

const businessManager = new WABusinessManager(socket);

// Create business profile
const profile = await businessManager.createBusinessProfile({
    name: 'My Business',
    category: 'retail',
    description: 'We sell amazing products',
    email: 'contact@mybusiness.com',
    website: 'https://mybusiness.com'
});

// Add product to catalog
const product = await businessManager.addProduct({
    name: 'Amazing Product',
    description: 'This product is amazing',
    price: 99.99,
    currency: 'USD',
    images: ['https://example.com/image.jpg']
});
```

### Media Processing

```javascript
const { WAMediaProcessor } = require('whatsapp-node-api-gvny');

const mediaProcessor = new WAMediaProcessor();

// Process an image
const imageBuffer = await fs.readFile('image.jpg');
const processedImage = await mediaProcessor.processImage(imageBuffer, {
    maxWidth: 1600,
    maxHeight: 1600
});

// Generate thumbnail
const thumbnail = await mediaProcessor.generateImageThumbnail(imageBuffer);

// Optimize for WhatsApp
const optimized = await mediaProcessor.optimizeForWhatsApp('video.mp4', 'video');
```

---

## 🧪 Testing

The library includes comprehensive testing utilities:

```bash
# Run all tests
npm test

# Run QR code specific tests
npm run test:qr

# Run the demo
npm run demo
```

### Test Files
- `test_library.js` - Comprehensive library tests
- `simple_qr_test.js` - QR code functionality tests
- `simple_demo.js` - Interactive demo

---

## 📁 Project Structure

```
whatsapp-node-api-gvny/
├── index.js                 # Main entry point
├── package.json             # Package configuration
├── README.md               # This file
│
├── Auth/                   # Authentication modules
│   ├── WAAuth.js          # Core authentication
│   ├── WASessionManager.js # Session management
│   └── WAAuthValidator.js  # Validation utilities
│
├── Utils/                  # Utility modules
│   ├── WAHelper.js        # Helper functions
│   ├── WAValidator.js     # Validation utilities
│   ├── WALogger.js        # Logging utilities
│   └── WAMediaProcessor.js # Media processing
│
├── Crypto/                 # Cryptography modules
│   ├── WACrypto.js        # Core crypto functions
│   └── WAEncryption.js    # Advanced encryption
│
├── Messages/               # Message handling
│   ├── WAMessages.js      # Message management
│   └── WAMessageHandler.js # Message processing
│
├── Groups/                 # Group management
│   ├── WAGroupManager.js  # Group operations
│   └── WAGroupHandler.js  # Group event handling
│
├── Business/               # Business features
│   ├── WABusiness.js      # Business API
│   └── WABusinessManager.js # Business management
│
├── Calls/                  # Call management
│   ├── WACallManager.js   # Call operations
│   └── WACallHandler.js   # Call event handling
│
├── Stories/                # Story/Status features
│   └── WAStoryManager.js  # Story management
│
├── Privacy/                # Privacy controls
│   └── WAPrivacyManager.js # Privacy settings
│
├── Events/                 # Event management
│   └── WAEventManager.js  # Event handling
│
├── Store/                  # Data storage
│   └── WAStore.js         # Data persistence
│
├── Config/                 # Configuration
│   └── WAConfigManager.js # Config management
│
├── Database/               # Database operations
│   └── WADatabaseManager.js # Database management
│
├── Middleware/             # Middleware system
│   └── WAMiddlewareManager.js # Middleware handling
│
├── Plugins/                # Plugin system
│   └── WAPluginManager.js # Plugin management
│
├── WebHooks/               # WebHook integration
│   └── WAWebHookManager.js # WebHook handling
│
└── [Additional modules...]  # 72 total files across 38 directories
```

---

## 🔒 Security

This library implements several security measures:

- **End-to-End Encryption**: All messages are encrypted using WhatsApp's protocol
- **Secure Authentication**: QR codes and pairing codes use cryptographic validation
- **Session Security**: Sessions are encrypted and securely stored
- **Input Validation**: All inputs are validated to prevent injection attacks
- **Rate Limiting**: Built-in rate limiting to prevent abuse

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-username/whatsapp-node-api-gvny.git

# Install dependencies
cd whatsapp-node-api-gvny
npm install

# Run tests
npm test

# Run the demo
npm run demo
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- WhatsApp for providing the Web API
- The Node.js community for excellent libraries
- Contributors and users of this library

---

## 📞 Support

- 📧 **Email**: support@whatsapp-node-api.com
- 🐛 **Issues**: [GitHub Issues](https://github.com/your-username/whatsapp-node-api-gvny/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/your-username/whatsapp-node-api-gvny/discussions)
- 📚 **Documentation**: [Wiki](https://github.com/your-username/whatsapp-node-api-gvny/wiki)

---

## 🔄 Changelog

### v1.0.0 (Latest)
- ✅ Initial release
- ✅ Complete QR code authentication
- ✅ Full messaging support
- ✅ Business features
- ✅ Group management
- ✅ Story/Status support
- ✅ Advanced encryption
- ✅ 72 modules across 38 categories
- ✅ Comprehensive testing suite

---

<div align="center">

**Made with ❤️ for the Node.js community**

⭐ **Star this repository if you find it useful!** ⭐

</div>