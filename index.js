const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');

// ১. Firebase সেটআপ (নিশ্চিত করুন serviceAccountKey.json ফাইলটি একই ফোল্ডারে আছে)
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase সফলভাবে কানেক্ট হয়েছে।");
} catch (err) {
    console.error("Firebase Key ফাইলটি পাওয়া যায়নি! নিশ্চিত করুন নাম ঠিক আছে।", err);
}

const db = admin.firestore();
let userSessions = {}; 

// ২. ক্লায়েন্ট সেটআপ (Termux ও লিনাক্স ফ্রেন্ডলি কনফিগারেশন)
const client = new Client({
    authStrategy: new LocalAuth(), // সেশন সেভ রাখবে
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
    }
});

client.on('qr', (qr) => {
    console.log('নিচের QR কোডটি স্ক্যান করুন:');
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('বট এখন পুরোপুরি প্রস্তুত এবং অনলাইনে আছে! ✅');
});

// ৩. মেসেজ হ্যান্ডলিং
client.on('message', async (msg) => {
    // গ্রুপ মেসেজ ইগনোর করার জন্য (শুধুমাত্র পার্সোনাল চ্যাট)
    if (msg.from.includes('@g.us')) return;

    const userId = msg.from;
    const text = msg.body.trim();
    const lowerText = text.toLowerCase();

    // শুরু করার লজিক
    if (lowerText === 'hi' || lowerText === 'start' || lowerText === 'হ্যালো') {
        userSessions[userId] = { step: 'collecting_name' };
        await client.sendMessage(userId, 'আসসালামু আলাইকুম! আমাদের অটো-বটে স্বাগতম। 😊\n\nআপনার **পুরো নাম** লিখুন:');
    }

    // নাম সংগ্রহ (সেশন চেক করে)
    else if (userSessions[userId] && userSessions[userId].step === 'collecting_name') {
        userSessions[userId].name = text;
        userSessions[userId].step = 'collecting_phone';
        await client.sendMessage(userId, `ধন্যবাদ *${text}*! এবার আপনার **মোবাইল নম্বরটি** দিন:`);
    }

    // নম্বর সংগ্রহ এবং Firebase-এ সেভ
    else if (userSessions[userId] && userSessions[userId].step === 'collecting_phone') {
        const userName = userSessions[userId].name;
        const userPhone = text;

        // নম্বর ভ্যালিডেশন (ঐচ্ছিক: শুধু চেক করবে ইনপুট খালি কি না)
        if (userPhone.length < 10) {
            return await client.sendMessage(userId, 'দয়া করে একটি সঠিক মোবাইল নম্বর দিন।');
        }

        try {
            // Firestore-এ ডেটা সেভ
            await db.collection('whatsapp_users').doc(userId).set({
                name: userName,
                phone: userPhone,
                whatsapp_id: userId,
                status: 'pending',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            await client.sendMessage(userId, `অভিনন্দন *${userName}*! আপনার তথ্য সফলভাবে সেভ করা হয়েছে। ✅\n\nআমাদের প্রতিনিধি শীঘ্রই আপনার সাথে যোগাযোগ করবে।`);
            
            // সেশন ক্লিয়ার করা
            delete userSessions[userId];
        } catch (error) {
            console.error('Firebase Error:', error);
            await client.sendMessage(userId, 'দুঃখিত, সার্ভার সমস্যার কারণে তথ্য সেভ করা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।');
        }
    }
});

// ৪. ডিসকানেক্ট হ্যান্ডলিং (নাম্বার লগআউট হয়ে গেলে জানাবে)
client.on('disconnected', (reason) => {
    console.log('বটটি ডিসকানেক্ট হয়েছে:', reason);
    client.initialize(); // পুনরায় চেষ্টা করবে
});

client.initialize();
