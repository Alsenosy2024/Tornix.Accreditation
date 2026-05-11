#!/usr/bin/env node
/**
 * Export every Firestore collection used by the app to JSON files in ./firebase-export/.
 *
 * Prereqs:
 *   1. `npm install firebase-admin --no-save` (or just have it in deps).
 *   2. Put the service-account JSON at ./serviceAccountKey.json (gitignored).
 *      Generate one at: Google Cloud Console -> IAM & Admin -> Service Accounts ->
 *      (your App Engine default SA) -> Keys -> Add Key -> JSON.
 *
 * Run:
 *   node scripts/export-firestore.js
 *
 * Output:
 *   firebase-export/
 *     settings.json       (branding doc + every branding_*_<i> chunk)
 *     courses.json
 *     assessments.json    (collectionGroup pull, owner uid included)
 *     admins.json         (admin allowlist uids)
 *     auth-users.json     (Firebase Auth users — for email -> uid linkage)
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const OUT_DIR = path.join(__dirname, '..', 'firebase-export');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`Missing ${SERVICE_ACCOUNT_PATH}.`);
  console.error('Download from Google Cloud Console -> IAM -> Service Accounts -> Keys -> Add JSON key.');
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const FIRESTORE_DB_ID = require('../firebase-applet-config.json').firestoreDatabaseId;

const db = admin.firestore();
if (FIRESTORE_DB_ID) {
  db.settings({ databaseId: FIRESTORE_DB_ID });
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// Convert Firestore Timestamp/GeoPoint/etc. to JSON-safe values.
function serialize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) return { __ts: value.toMillis() };
  if (value instanceof admin.firestore.GeoPoint) return { lat: value.latitude, lng: value.longitude };
  if (Buffer.isBuffer(value)) return { __bytes: value.toString('base64') };
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}

async function dumpCollection(collRef, label) {
  const snap = await collRef.get();
  const rows = snap.docs.map(doc => ({
    _id: doc.id,
    _path: doc.ref.path,
    ...serialize(doc.data()),
  }));
  const file = path.join(OUT_DIR, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  console.log(`✔ ${label}: ${rows.length} docs -> ${file}`);
  return rows;
}

async function main() {
  // 1. Branding settings (single doc + chunks)
  console.log('Exporting settings/* ...');
  await dumpCollection(db.collection('settings'), 'settings');

  // 2. Courses
  console.log('Exporting courses/* ...');
  await dumpCollection(db.collection('courses'), 'courses');

  // 3. Assessments — collectionGroup across all users
  console.log('Exporting assessments via collectionGroup ...');
  const assessSnap = await db.collectionGroup('assessments').get();
  const assessRows = assessSnap.docs.map(doc => ({
    _id: doc.id,
    _path: doc.ref.path,                              // users/<uid>/assessments/<id>
    _ownerUid: doc.ref.parent.parent?.id || null,     // pulls uid out of path
    ...serialize(doc.data()),
  }));
  fs.writeFileSync(path.join(OUT_DIR, 'assessments.json'), JSON.stringify(assessRows, null, 2));
  console.log(`✔ assessments: ${assessRows.length} docs`);

  // 4. Admins
  console.log('Exporting admins/* ...');
  await dumpCollection(db.collection('admins'), 'admins');

  // 5. Firebase Auth users — needed to map old uid -> email so legacy assessments
  // can be linked to the new users row when that email signs in via Google.
  console.log('Exporting Firebase Auth users ...');
  const authUsers = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      authUsers.push({
        uid: u.uid,
        email: u.email || null,
        emailVerified: u.emailVerified,
        displayName: u.displayName || null,
        photoURL: u.photoURL || null,
        providers: u.providerData.map(p => ({ providerId: p.providerId, email: p.email, uid: p.uid })),
        createdAt: u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : null,
        lastSignIn: u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : null,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  fs.writeFileSync(path.join(OUT_DIR, 'auth-users.json'), JSON.stringify(authUsers, null, 2));
  console.log(`✔ auth-users: ${authUsers.length} accounts`);

  console.log(`\nDone. Files in ${OUT_DIR}`);
}

main().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
