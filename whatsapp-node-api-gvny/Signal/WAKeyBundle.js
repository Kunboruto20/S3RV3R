/**
 * WAKeyBundle
 * WhatsApp Signal Protocol Key Bundle
 */

class WAKeyBundle {
    constructor(registrationId, deviceId, preKeyId, preKeyPublic, signedPreKeyId, signedPreKeyPublic, signedPreKeySignature, identityKey) {
        this.registrationId = registrationId;
        this.deviceId = deviceId;
        this.preKeyId = preKeyId;
        this.preKeyPublic = preKeyPublic;
        this.signedPreKeyId = signedPreKeyId;
        this.signedPreKeyPublic = signedPreKeyPublic;
        this.signedPreKeySignature = signedPreKeySignature;
        this.identityKey = identityKey;
    }

    getRegistrationId() {
        return this.registrationId;
    }

    getDeviceId() {
        return this.deviceId;
    }

    getPreKeyId() {
        return this.preKeyId;
    }

    getPreKeyPublic() {
        return this.preKeyPublic;
    }

    getSignedPreKeyId() {
        return this.signedPreKeyId;
    }

    getSignedPreKeyPublic() {
        return this.signedPreKeyPublic;
    }

    getSignedPreKeySignature() {
        return this.signedPreKeySignature;
    }

    getIdentityKey() {
        return this.identityKey;
    }

    serialize() {
        return {
            registrationId: this.registrationId,
            deviceId: this.deviceId,
            preKeyId: this.preKeyId,
            preKeyPublic: this.preKeyPublic,
            signedPreKeyId: this.signedPreKeyId,
            signedPreKeyPublic: this.signedPreKeyPublic,
            signedPreKeySignature: this.signedPreKeySignature,
            identityKey: this.identityKey
        };
    }

    static deserialize(data) {
        return new WAKeyBundle(
            data.registrationId,
            data.deviceId,
            data.preKeyId,
            data.preKeyPublic,
            data.signedPreKeyId,
            data.signedPreKeyPublic,
            data.signedPreKeySignature,
            data.identityKey
        );
    }
}

module.exports = WAKeyBundle;
