const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function setClaims() {
  // whitecross user - aerulas@gmail.com
  await admin.auth().setCustomUserClaims('CsktIKNC0wRaP2eK8DECVMtam_uid_buraya', {
    tenantId: 'whitecross'
  });
  
  // eekurt user - eekurtbookings@gmail.com
  await admin.auth().setCustomUserClaims('L6wsBgQmBYXIVBt3RYHS2LAatam_uid_buraya', {
    tenantId: 'eekurt'
  });
  
  console.log('Claims set successfully!');
  process.exit(0);
}

setClaims().catch(console.error);