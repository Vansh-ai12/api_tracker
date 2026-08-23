import { encryptToken, decryptToken } from "./encryption";

// Test 32-byte key in hex format (64 hex characters)
const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const WRONG_KEY = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

function runTests() {
  console.log("--- Running Encryption Tests ---");

  // Test 1: Encrypt -> Decrypt roundtrip
  const originalSecret = "1//04_abcdef1234567890_sample_refresh_token_xyz";
  const encrypted = encryptToken(originalSecret, TEST_KEY);
  console.log("Encrypted token format:", encrypted);
  
  if (!encrypted.startsWith("v1:")) {
    throw new Error("FAIL: Encrypted token missing version header");
  }

  const decrypted = decryptToken(encrypted, TEST_KEY);
  if (decrypted !== originalSecret) {
    throw new Error(`FAIL: Expected ${originalSecret}, got ${decrypted}`);
  }
  console.log("✅ PASS: Encrypt -> Decrypt roundtrip successful");

  // Test 2: Decryption with wrong key -> Failure
  try {
    decryptToken(encrypted, WRONG_KEY);
    throw new Error("FAIL: Decryption with wrong key should have thrown an error");
  } catch (err: any) {
    if (err.message.includes("FAIL:")) throw err;
    console.log("✅ PASS: Wrong key correctly rejected by auth tag check");
  }

  // Test 3: Tampered ciphertext -> Authentication failure
  const parts = encrypted.split(":");
  const tamperedCiphertext = parts[3].substring(0, parts[3].length - 2) + (parts[3].endsWith("a") ? "b" : "a");
  const tamperedToken = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCiphertext}`;

  try {
    decryptToken(tamperedToken, TEST_KEY);
    throw new Error("FAIL: Tampered ciphertext should have thrown an error");
  } catch (err: any) {
    if (err.message.includes("FAIL:")) throw err;
    console.log("✅ PASS: Tampered ciphertext correctly rejected by GCM auth tag check");
  }

  console.log("--- All Encryption Tests Passed ---");
}

runTests();
