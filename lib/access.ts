import { createRemoteJWKSet, jwtVerify } from 'jose';
const issuer = 'https://autumn-sound-95dd.cloudflareaccess.com';
const audience = 'a3cd639150ba6e78448adfc3c57820ce8a010588c33043aacdaced2f16af2337';
const keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
export async function operator(req: Request, mode?: string) {
    if (mode === 'local') return 'Local operator';
    const token = req.headers.get('cf-access-jwt-assertion');
    if (!token) throw new Error('Sign in again to access saved records.');
    const { payload } = await jwtVerify(token, keys, { issuer, audience, algorithms: ['RS256'] });
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    if (email !== 'eliascolon23@gmail.com') throw new Error('This account is not approved.');
    return email;
}
