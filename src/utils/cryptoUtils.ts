import CryptoJS from 'crypto-js';

/**
 * Encrypts a raw bank password using the user's Webapp PIN.
 * @param rawPassword The actual PDF password (e.g., '123456')
 * @param pin The user's Webapp PIN used as the encryption key
 * @returns The scrambled ciphertext string to save to Supabase
 */
export const encryptPassword = (rawPassword: string, pin: string): string => {
  // We use AES (Advanced Encryption Standard), which is military-grade encryption
  const ciphertext = CryptoJS.AES.encrypt(rawPassword, pin).toString();
  return ciphertext;
};

/**
 * Decrypts the ciphertext from Supabase back into the raw bank password using the Webapp PIN.
 * @param encryptedPassword The scrambled string from Supabase
 * @param pin The user's Webapp PIN to unlock it
 * @returns The raw password, or null if the wrong PIN was used
 */
export const decryptPassword = (encryptedPassword: string, pin: string): string | null => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedPassword, pin);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    
    // If the PIN was wrong, originalText will be empty
    if (!originalText) {
      return null;
    }
    
    return originalText;
  } catch (error) {
    console.error('Failed to decrypt password. Incorrect PIN or corrupted data.', error);
    return null;
  }
};
