// zsign IPA re-signer for Erosion
import zsign from 'zsign';
import path from 'path';

const IPA_PATH = 'C:\\Users\\xing\'ye\\Downloads\\Erosion_v0.6.2_zh-Hans.ipa';
const OUTPUT_PATH = 'C:\\Users\\xing\'ye\\Downloads\\Erosion-signed.ipa';

// Read credentials from environment or prompt
const APPLE_ID = process.env.APPLE_ID || process.argv[2];
const APPLE_PASSWORD = process.env.APPLE_PASSWORD || process.argv[3];

if (!APPLE_ID || !APPLE_PASSWORD) {
    console.error('Usage: node sign-erosion.mjs <apple_id> <apple_password>');
    process.exit(1);
}

console.log('=== Erosion IPA Re-signer ===');
console.log(`Input:  ${IPA_PATH}`);
console.log(`Output: ${OUTPUT_PATH}`);
console.log(`Apple ID: ${APPLE_ID}`);
console.log('');

try {
    const result = await zsign({
        ipa: IPA_PATH,
        out: OUTPUT_PATH,
        sign: {
            appleId: APPLE_ID,
            appleIdPassword: APPLE_PASSWORD,
            // Optional: specify app bundle id if we want to change it
            // bundleId: 'com.kianuni.erosion.signed',
        },
        // Use HTTP proxy if needed for China (optional)
        // proxyRequest: async (url, options = {}) => { ... }
    });
    
    console.log('');
    console.log('=== SUCCESS ===');
    console.log(`Signed IPA: ${OUTPUT_PATH}`);
    console.log(`Result:`, JSON.stringify(result, null, 2));
} catch (err) {
    console.error('');
    console.error('=== ERROR ===');
    console.error(err.message || err);
    if (err.stack) console.error(err.stack);
    process.exit(1);
}
