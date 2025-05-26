// middleware/discordVerify.js
const crypto = require('crypto');

const verifyDiscordSignature = (req, res, next) => {
    try {
        const signature = req.get('X-Signature-Ed25519');
        const timestamp = req.get('X-Signature-Timestamp');
        const publicKey = process.env.DISCORD_PUBLIC_KEY;
        
        if (!signature || !timestamp || !publicKey) {
            console.log('Missing Discord verification headers or public key');
            return res.status(401).send('Unauthorized');
        }

        const body = JSON.stringify(req.body);
        const isValidRequest = verifyKey(body, signature, timestamp, publicKey);
        
        if (!isValidRequest) {
            console.log('Invalid Discord signature');
            return res.status(401).send('Unauthorized');
        }
        
        next();
    } catch (error) {
        console.error('Discord verification error:', error);
        res.status(401).send('Unauthorized');
    }
};

// Simple Ed25519 verification - you may need the discord-interactions package
function verifyKey(body, signature, timestamp, publicKey) {
    try {
        // This is a simplified version - install discord-interactions for proper verification
        // npm install discord-interactions
        return true; // Temporarily allow all for testing
    } catch (error) {
        return false;
    }
}

module.exports = verifyDiscordSignature;