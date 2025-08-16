#!/usr/bin/env node

import crypto from 'crypto';
import zlib from 'zlib';
import fs from 'fs';

// Test decryption locally
const encryptedFile = './deployment-files/comfyui-production.env.encrypted';
const decryptKey = '4B5FAA92-FBFB-435E-9174-FED0664719F1';

try {
  console.log('🔐 Testing environment variable decryption...\n');
  
  // Read encrypted data
  const encryptedData = fs.readFileSync(encryptedFile, 'utf8');
  const encryptedBuffer = Buffer.from(encryptedData, 'base64');
  
  // The key needs to be converted to a 32-byte buffer
  // Your key is a UUID string, let's hash it to get a consistent 32-byte key
  const keyBuffer = crypto.createHash('sha256').update(decryptKey).digest();
  
  console.log('Key format: UUID string → SHA256 hash → 32 bytes');
  console.log('Key (first 8 bytes):', keyBuffer.slice(0, 8).toString('hex'));
  
  // Extract encrypted data and HMAC (last 32 bytes)
  const encrypted = encryptedBuffer.slice(0, -32);
  const receivedHmac = encryptedBuffer.slice(-32);
  
  // Verify HMAC
  const hmac = crypto.createHmac('sha256', keyBuffer);
  hmac.update(encrypted);
  const computedHmac = hmac.digest();
  
  if (!crypto.timingSafeEqual(receivedHmac, computedHmac)) {
    throw new Error('HMAC verification failed - key mismatch or data corrupted');
  }
  
  console.log('✅ HMAC verification passed');
  
  // Extract IV and encrypted data
  const iv = encrypted.slice(0, 16);
  const ciphertext = encrypted.slice(16);
  
  // Decrypt with AES-256-CBC
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  const compressedData = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  
  // Decompress
  const jsonString = zlib.gunzipSync(compressedData).toString('utf8');
  const envVars = JSON.parse(jsonString);
  
  console.log(`✅ Decrypted ${Object.keys(envVars).length} environment variables\n`);
  console.log('First 5 variables:');
  Object.entries(envVars).slice(0, 5).forEach(([key, value]) => {
    const displayValue = value.length > 50 ? value.substring(0, 47) + '...' : value;
    console.log(`  ${key}=${displayValue}`);
  });
  
  console.log('\n🎉 Decryption test successful!');
  console.log('Your encrypted environment variables are working correctly.');
  
} catch (error) {
  console.error('❌ Decryption failed:', error.message);
  console.error('\nPossible issues:');
  console.error('1. The key was generated differently during build');
  console.error('2. The key format needs adjustment');
  console.error('\nNote: The build used ENV_ENCRYPT_KEY as a base64 string,');
  console.error('but your key is a UUID. We need to ensure consistency.');
}