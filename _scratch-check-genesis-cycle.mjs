import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBz89GtOjx7c__t1pu9yD2ata9-4ITZilk',
  authDomain: 'meter-app-36307.firebaseapp.com',
  projectId: 'meter-app-36307',
  storageBucket: 'meter-app-36307.firebasestorage.app',
  messagingSenderId: '185231576035',
  appId: '1:185231576035:web:5da1b1cf690d6cceda2ed6'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const schemesSnap = await getDocs(collection(db, 'schemes'));
const schemes = schemesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const genesis = schemes.find(s => /gen(e|i)sis/i.test(String(s.name || '')));
console.log('Schemes found:', schemes.map(s => `${s.name} (${s.id})`).join(' | '));
if (!genesis) {
  console.log('NO GENESIS SCHEME FOUND');
  process.exit(0);
}
console.log('Genesis scheme:', genesis.id, genesis.name);

const cyclesSnap = await getDocs(query(collection(db, 'cycles'), where('scheme_id', '==', genesis.id)));
const cycles = cyclesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
console.log('Cycles for Genesis:', cycles.length);
cycles.forEach(c => console.log(` - ${c.id} status=${c.status} start=${c.start_date} end=${c.end_date}`));

const metersSnap = await getDocs(query(collection(db, 'meters'), where('scheme_id', '==', genesis.id)));
console.log('Meters registered for Genesis:', metersSnap.docs.length);
