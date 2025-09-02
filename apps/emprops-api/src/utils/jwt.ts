import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const client = jwksClient({
  jwksUri: `https://app.dynamic.xyz/api/v0/sdk/${process.env.DYNAMIC_ENVIRONMENT_ID}/.well-known/jwks`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err: any, key: any) => {
    if (err) {
      callback(err);
    } else {
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    }
  });
}

// JWT verification cache to prevent repeated verification of the same token
const jwtCache = new Map<string, { data: any; expires: number }>();
const JWT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function verifyJwt(token: string): Promise<any> {
  // Check cache first
  const cached = jwtCache.get(token);
  if (cached && cached.expires > Date.now()) {
    console.log("🔑 JWT Cache Hit - skipping verification");
    return Promise.resolve(cached.data);
  }

  console.log("🔑 JWT Verification Starting");
  
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      { algorithms: ["RS256"] },
      (err: any, data: any) => {
        if (!err) {
          console.log("🔑 JWT Verification SUCCESS");
          console.log("🔑 User:", data.email || data.sub);
          
          // Cache the verified token
          jwtCache.set(token, {
            data,
            expires: Date.now() + JWT_CACHE_TTL
          });
          
          // Clean up expired cache entries periodically
          if (jwtCache.size > 100) {
            const now = Date.now();
            for (const [key, value] of jwtCache.entries()) {
              if (value.expires < now) {
                jwtCache.delete(key);
              }
            }
          }
          
          resolve(data);
        } else {
          console.log("🔑 JWT Verification FAILED:", err.message);
          reject(err);
        }
      },
    );
  });
}
