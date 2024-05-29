import { webcrypto } from 'node:crypto';

async function main() {
    const key = await webcrypto.subtle.generateKey({
        name: 'HMAC',
        hash: 'SHA-512',
    }, true, ['sign', 'verify']);
    console.log(await webcrypto.subtle.exportKey('jwk', key));
}

main().then(() => process.exit(0)).catch(err => { throw err });
