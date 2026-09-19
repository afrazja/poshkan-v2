import pg from 'pg';
import { createDecipheriv } from 'node:crypto';
const db=new pg.Client({connectionString:process.env.NEON_PREVIEW_DATABASE_URL});
let stage='database connection';
try {
 await db.connect();
 stage='encryption key format';
 const key=Buffer.from(process.env.ENCRYPTION_KEY||'', 'base64');
 if(key.length!==32)throw new Error('Invalid encryption key');
 stage='saved account API key lookup';
 const result=await db.query('SELECT p.anthropic_api_key FROM poshkan_trade_test.profiles p JOIN poshkan_trade_test.auth_links l ON p.id=l.legacy_user_id WHERE l.neon_user_id=$1 AND l.application_access_enabled',[process.env.NEON_PREVIEW_USER_ID]);
 const stored=result.rows[0]?.anthropic_api_key;
 if(!stored)throw new Error('No saved API key');
 stage='authenticated decryption';
 const [iv,tag,ciphertext]=stored.split('.').map(v=>Buffer.from(v,'base64'));
 const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
 const clear=Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
 if(!clear.startsWith('sk-ant-'))throw new Error('Unexpected saved credential');
 console.log('Original encryption key verified against the mapped account. No API request was sent.');
} catch {console.error('Credential verification failed at '+stage+'. No secret was printed.');process.exitCode=1;}
finally{await db.end();}
