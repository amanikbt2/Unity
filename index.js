import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import fs from 'fs/promises';
import mongoose from 'mongoose';
import ImageKit from 'imagekit';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pushTokens = new Map();

async function sendPushNotification(expoPushToken, title, body, data = {}) {
  try {
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });
  } catch (error) {
    console.error('Error sending push notification:', error.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Initialize API Key Pool
let currentKeyIndex = 0;
const keyPoolStr = process.env.GEMINI_KEY_POOL || process.env.GEMINI_API_KEY || '';
const API_KEY_POOL = keyPoolStr.split(',').map(k => k.trim()).filter(Boolean);

async function callGeminiWithRotation(payload) {
  if (API_KEY_POOL.length === 0) {
    throw new Error('No Gemini API keys configured on the server.');
  }

  let attempt = 0;
  let lastError = null;

  // Try up to the total number of keys we have before failing entirely
  while (attempt < API_KEY_POOL.length) {
    const currentKey = API_KEY_POOL[currentKeyIndex];
    try {
      console.log(`[API Pool] Using key index ${currentKeyIndex}. Attempt ${attempt + 1}/${API_KEY_POOL.length}`);
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${currentKey}`,
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      );
      return response;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      // 429 Too Many Requests or 502/503/504 Bad Gateway often implies free tier rate limits
      if (status === 429 || status === 502 || status === 503 || status === 504) {
        console.warn(`[API Pool] Key index ${currentKeyIndex} failed with ${status}. Rotating to next key...`);
        currentKeyIndex = (currentKeyIndex + 1) % API_KEY_POOL.length;
        attempt++;
        continue;
      }
      
      // If it's a 400 Bad Request or other non-rate-limit error, throw immediately
      throw error;
    }
  }

  throw lastError; // All keys exhausted or failed
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const activeSessions = new Map();

// Middleware to track active client sessions for the currently online counter
app.use((req, res, next) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin')) {
    return next();
  }

  let userKey = null;
  if (req.body) {
    if (req.body.email) userKey = req.body.email;
    else if (req.body.uid) userKey = req.body.uid;
    else if (req.body.userLabel && req.body.userLabel !== 'guest') userKey = req.body.userLabel;
  }
  if (!userKey && req.query) {
    if (req.query.email) userKey = req.query.email;
  }
  if (!userKey) {
    const headerEmail = req.headers['x-user-email'];
    if (headerEmail) userKey = headerEmail;
  }

  if (userKey) {
    activeSessions.set(userKey, Date.now());
  }
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(express.static(path.join(__dirname, 'public')));

const INITIAL_POSTS = [
  {
    id: 'p1',
    authorName: 'Sarah Jenkins',
    authorId: 'sarah@example.com',
    authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
    authorFlag: '🇺🇸',
    authorNativeLang: 'en',
    flag: '🇺🇸',
    time: '2 hours ago',
    content: 'Just arrived in Tokyo! The translation app has been a lifesaver for ordering food and finding my hotel. Highly recommend it! 🗼🇯🇵',
    imageUrls: ['https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80'],
    likes: 24,
    likedBy: [],
    comments: [
      { id: 'c1_1', authorId: 'yuki@example.com', authorName: 'Yuki Tanaka', authorAvatar: '', content: 'Welcome to Japan! Let me know if you need any recommendations.', createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
      { id: 'c1_2', authorId: 'sarah@example.com', authorName: 'Sarah Jenkins', authorAvatar: '', content: 'Thank you Yuki! I would love to get some sushi recommendations.', createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString() },
    ],
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'p2',
    authorName: 'Carlos Gomez',
    authorId: 'carlos@example.com',
    authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80',
    authorFlag: '🇪🇸',
    authorNativeLang: 'es',
    flag: '🇪🇸',
    time: '4 hours ago',
    content: 'Preparando la presentación para la cumbre europea de mañana. Gracias a Dios por la traducción de documentos en tiempo real de Xaylite, me ahorró horas de trabajo duro. 💼🇪🇺',
    imageUrls: [],
    likes: 12,
    likedBy: [],
    comments: [
      { id: 'c2_1', authorId: 'lucas@example.com', authorName: 'Lucas Dupont', authorAvatar: '', content: 'Bonne chance Carlos! Everything will go well.', createdAt: new Date(Date.now() - 80 * 60 * 1000).toISOString() },
    ],
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
];

const EXPLORE_PEOPLE = [
  {
    id: 'e1',
    name: 'Amélie Dubois',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&h=300&q=80',
    flag: '🇫🇷',
    langName: 'French (France)',
    bio: 'Hi! I am a culinary chef in Paris. Let\'s exchange recipes!',
    isUnityUser: true,
  },
  {
    id: 'e2',
    name: 'Hiroshi Sato',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80',
    flag: '🇯🇵',
    langName: 'Japanese (Japan)',
    bio: 'Tech enthusiast and history buff. Happy to translate and chat!',
    isUnityUser: true,
  },
  {
    id: 'dev@gmail.com',
    name: 'Mr Man',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&h=300&q=80',
    flag: '🇺🇸',
    langName: 'English (US)',
    bio: 'System Administrator',
    isUnityUser: true,
  },
];

const memoryStore = {
  posts: structuredClone(INITIAL_POSTS),
  popups: [], // Memory fallback for popups
  popupReplies: [], // Memory fallback for replies
};

const hasMongo = Boolean(process.env.MONGODB_URI);
const hasImageKit = Boolean(
  process.env.IMAGEKIT_PUBLIC_KEY &&
    process.env.IMAGEKIT_PRIVATE_KEY &&
    process.env.IMAGEKIT_URL_ENDPOINT,
);

let useMongo = false;

const imagekit = hasImageKit
  ? new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    })
  : null;

setTimeout(() => {
  if (!useMongo) {
    console.warn('Post storage running in memory mode. Set MONGODB_URI and IMAGEKIT_* env vars for persistence and cloud uploads.');
  }
}, 5000);

const commentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    authorId: { type: String, default: '' },
    authorName: { type: String, default: '' },
    authorAvatar: { type: String, default: '' },
    content: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const postSchema = new mongoose.Schema(
  {
    postId: { type: String, unique: true, index: true },
    authorId: { type: String, default: '' },
    authorName: { type: String, default: '' },
    authorAvatar: { type: String, default: '' },
    authorFlag: { type: String, default: '🌍' },
    authorNativeLang: { type: String, default: '' },
    content: { type: String, default: '' },
    imageUrls: { type: [String], default: [] },
    imageFileIds: { type: [String], default: [] },
    likes: { type: Number, default: 0 },
    likedBy: { type: [String], default: [] },
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true },
);

const popupSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    title: { type: String, required: true },
    subtopic: { type: String, default: '' },
    text: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    isImportant: { type: Boolean, default: false },
    actions: { type: Array, default: [] }, // Array of { label: String, url: String }
    isAppUpdate: { type: Boolean, default: false },
    targetVersion: { type: String, default: '' },
    isInteractive: { type: Boolean, default: false },
    submitBtnText: { type: String, default: 'Submit' },
    formFields: { type: Array, default: [] }, // Array of { type, label, options, required }
    createdAt: { type: Date, default: Date.now },
  }
);

const popupReplySchema = new mongoose.Schema(
  {
    popupId: { type: String, required: true, index: true },
    userName: { type: String, default: 'xayLiteUser' },
    appVersion: { type: String, default: 'Unknown' },
    replyData: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  }
);

const activityLogSchema = new mongoose.Schema(
  {
    event: { type: String, required: true, index: true }, // e.g. 'app_open', 'login_click', 'login_success', 'login_fail'
    method: { type: String, default: '' },                 // 'google', 'email', 'saved_profile'
    userLabel: { type: String, default: 'unknown' },       // name if known, or 'guest'
    email: { type: String, default: '' },
    platform: { type: String, default: '' },               // 'android', 'ios', 'web'
    appVersion: { type: String, default: '' },
    error: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { _id: true }
);

const Post = mongoose.models.Post || mongoose.model('Post', postSchema);
const Popup = mongoose.models.Popup || mongoose.model('Popup', popupSchema);
const PopupReply = mongoose.models.PopupReply || mongoose.model('PopupReply', popupReplySchema);
const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);

const userProfileSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    avatar: { type: String, default: '' },
    flag: { type: String, default: '🇺🇸' },
    langName: { type: String, default: 'English' },
    bio: { type: String, default: 'Available on Xaylite' },
    email: { type: String, default: '' },
    authMethod: { type: String, default: 'email' },
    location: { type: String, default: 'Unknown' },
    appVersion: { type: String, default: '1.0.0' },
    platform: { type: String, default: 'unknown' },
    nativeLang: { type: String, default: 'en' },
    unityAILang: { type: String, default: 'es' },
    phone: { type: String, default: '' },
    nativeLangSelected: { type: Boolean, default: false },
    voiceAITrained: { type: Boolean, default: false },
    micTested: { type: Boolean, default: false },
    pushToken: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }
);
const UserProfile = mongoose.models.UserProfile || mongoose.model('UserProfile', userProfileSchema);

const notificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  type: { type: String, required: true }, // 'system' or 'chat'
  title: { type: String, default: '' },
  body: { type: String, default: '' },
  icon: { type: String, default: '' }, // 'info', 'warning', 'success', 'default'
  senderName: { type: String, default: '' },
  senderAvatar: { type: String, default: '' },
  targetEmail: { type: String, default: '' }, // '' = broadcast to all users
  createdAt: { type: Date, default: Date.now, index: true }
});
const NotificationModel = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

const memoryUserProfiles = new Map();
const memoryNotifications = [];

// Mock User Profiles for dashboard pre-population
const mockUser1 = {
  uid: 'user_google_1',
  name: 'Alex Rivera',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80',
  flag: '🇺🇸',
  langName: 'English (US)',
  bio: 'Learning Spanish and German!',
  email: 'alex.rivera@gmail.com',
  authMethod: 'google',
  location: 'San Francisco, USA',
  appVersion: '1.0.5',
  platform: 'android',
  createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
};

const mockUser2 = {
  uid: 'user_google_2',
  name: 'Sofia Müller',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
  flag: '🇩🇪',
  langName: 'German (Germany)',
  bio: 'Hallo! Let\'s practice speaking.',
  email: 'sofia.muller@gmail.com',
  authMethod: 'google',
  location: 'Berlin, Germany',
  appVersion: '1.0.5',
  platform: 'ios',
  createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
};

const mockUser3 = {
  uid: 'user_email_3',
  name: 'Jean Dupont',
  avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80',
  flag: '🇫🇷',
  langName: 'French (France)',
  bio: 'Passionate about culinary arts.',
  email: 'jean.dupont@outlook.com',
  authMethod: 'email',
  location: 'Paris, France',
  appVersion: '1.0.2',
  platform: 'web',
  createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
  updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
};

memoryUserProfiles.set(mockUser1.uid, mockUser1);
memoryUserProfiles.set(mockUser2.uid, mockUser2);
memoryUserProfiles.set(mockUser3.uid, mockUser3);

const mockUserMrMan = {
  uid: 'dev@gmail.com',
  name: 'Mr Man',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&h=300&q=80',
  flag: '🇺🇸',
  langName: 'English (US)',
  bio: 'System Administrator',
  email: 'dev@gmail.com',
  authMethod: 'email',
  location: 'United States',
  appVersion: '1.0.0',
  platform: 'android',
  nativeLang: 'en',
  unityAILang: 'es',
  phone: '+15550199',
  nativeLangSelected: true,
  voiceAITrained: true,
  micTested: true,
  createdAt: new Date(),
  updatedAt: new Date()
};
memoryUserProfiles.set(mockUserMrMan.uid, mockUserMrMan);

function flagToCountry(flag) {
  const map = {
    '🇺🇸': 'United States',
    '🇬🇧': 'United Kingdom',
    '🇫🇷': 'France',
    '🇩🇪': 'Germany',
    '🇪🇸': 'Spain',
    '🇯🇵': 'Japan',
    '🇮🇹': 'Italy',
    '🇨🇳': 'China',
    '🇰🇷': 'South Korea',
    '🇮🇳': 'India',
    '🇨🇦': 'Canada',
    '🇧🇷': 'Brazil',
    '🇲🇽': 'Mexico',
    '🌍': 'Unknown'
  };
  return map[flag] || 'Unknown';
}

async function seedUserProfiles() {
  try {
    const count = await UserProfile.countDocuments();
    if (count === 0) {
      const mockUsers = [
        mockUser1,
        mockUser2,
        mockUser3
      ];
      await UserProfile.create(mockUsers);
      console.log('[Seeding] Seeded database with mock user profiles.');
    }

    // Always ensure Mr Man account exists in database
    const mrManExists = await UserProfile.findOne({ uid: 'dev@gmail.com' });
    if (!mrManExists) {
      await UserProfile.create(mockUserMrMan);
      console.log('[Seeding] Seeded Mr Man user profile in MongoDB.');
    }
  } catch (err) {
    console.error('[Seeding] Failed to seed mock user profiles:', err.message);
  }
}

// Database connection and seeding initialization
if (hasMongo) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected.');
    useMongo = true;
    await seedUserProfiles();
  } catch (error) {
    console.error('MongoDB connection failed, falling back to memory store:', error.message);
  }
}

mongoose.connection.on('connected', async () => {
  console.log('Mongoose connection established/restored.');
  useMongo = true;
  await seedUserProfiles();
});

mongoose.connection.on('disconnected', () => {
  console.warn('Mongoose connection disconnected.');
  useMongo = false;
});


// In-memory fallback when MongoDB is unavailable
const memoryLogs = [];

function formatTimeAgo(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function normalizeComment(comment) {
  return {
    id: comment.id,
    authorId: comment.authorId || '',
    authorName: comment.authorName || '',
    authorAvatar: comment.authorAvatar || '',
    content: comment.content || '',
    createdAt: comment.createdAt ? new Date(comment.createdAt).toISOString() : new Date().toISOString(),
  };
}

function normalizePost(post, userKey = '') {
  const comments = Array.isArray(post.comments)
    ? post.comments.map((comment) => normalizeComment(comment))
    : [];
  const liked = userKey ? Boolean(post.likedBy?.includes(userKey)) : false;

  return {
    id: post.postId || post.id || post._id?.toString(),
    authorId: post.authorId || '',
    authorName: post.authorName || '',
    authorAvatar: post.authorAvatar || '',
    avatar: post.authorAvatar || '',
    authorFlag: post.authorFlag || '🌍',
    authorNativeLang: post.authorNativeLang || '',
    flag: post.authorFlag || '🌍',
    time: formatTimeAgo(post.createdAt || post.timestamp || Date.now()),
    content: post.content || '',
    images: post.imageUrls?.length > 0 ? post.imageUrls : (post.imageUrl ? [post.imageUrl] : []),
    likes: Number(post.likes || 0),
    liked,
    comments,
    createdAt: post.createdAt || new Date().toISOString(),
    updatedAt: post.updatedAt || new Date().toISOString(),
  };
}

async function uploadImageToImageKit(file) {
  if (!imagekit || !file) return '';
  const fileName = file.originalname || `post_${Date.now()}`;
  const data = file.buffer.toString('base64');
  const result = await imagekit.upload({
    file: data,
    fileName,
    folder: '/UnityApp/posts',
  });
  return result.url || '';
}

async function getPostsList(userKey = '') {
  if (useMongo) {
    const posts = await Post.find().sort({ createdAt: -1 }).lean();
    return posts.map((post) => normalizePost(post, userKey));
  }
  return memoryStore.posts.slice().sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).map((post) => normalizePost(post, userKey));
}

async function findPostById(postId) {
  if (useMongo) {
    return Post.findOne({ postId });
  }
  return memoryStore.posts.find((post) => post.postId === postId || post.id === postId) || null;
}

async function saveMemoryPost(nextPost) {
  const index = memoryStore.posts.findIndex((post) => post.postId === nextPost.postId || post.id === nextPost.postId);
  const normalized = { ...nextPost, createdAt: nextPost.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (index >= 0) {
    memoryStore.posts[index] = normalized;
  } else {
    memoryStore.posts.unshift(normalized);
  }
  return normalized;
}

async function deleteMemoryPost(postId) {
  const index = memoryStore.posts.findIndex((post) => post.postId === postId || post.id === postId);
  if (index >= 0) {
    const [removed] = memoryStore.posts.splice(index, 1);
    return removed;
  }
  return null;
}

app.post('/api/register-push', async (req, res) => {
  const { userKey, token } = req.body;
  if (!userKey || !token) return res.json({ success: false, error: 'Missing userKey or token' });

  // Always keep in-memory map for fast lookups in this process
  pushTokens.set(userKey, token);

  // Persist to MongoDB so the token survives server restarts / redeploys
  try {
    if (useMongo) {
      await UserProfile.findOneAndUpdate(
        { uid: userKey },
        { pushToken: token, updatedAt: new Date() },
        { upsert: false } // Only update existing profiles, don't create ghost profiles
      );
    } else {
      const profile = memoryUserProfiles.get(userKey);
      if (profile) memoryUserProfiles.set(userKey, { ...profile, pushToken: token });
    }
    console.log(`[Push] Token registered and persisted for: ${userKey}`);
  } catch (err) {
    console.warn('[Push] Failed to persist push token to DB:', err.message);
  }

  res.json({ success: true });
});

/**
 * Look up the Expo push token for a given user UID.
 * Checks in-memory map first (fastest), then falls back to MongoDB.
 */
async function getPushTokenForUser(uid) {
  if (!uid) return null;
  // 1. Check in-memory map (fastest — populated when user is online)
  const memToken = pushTokens.get(uid);
  if (memToken) return memToken;

  // 2. Fall back to MongoDB (user may be offline / server restarted)
  try {
    if (useMongo) {
      const profile = await UserProfile.findOne({ uid }).select('pushToken').lean();
      if (profile?.pushToken) {
        // Warm the in-memory cache so next lookup is instant
        pushTokens.set(uid, profile.pushToken);
        return profile.pushToken;
      }
    } else {
      const profile = memoryUserProfiles.get(uid);
      return profile?.pushToken || null;
    }
  } catch (err) {
    console.warn('[Push] getPushTokenForUser DB lookup failed:', err.message);
  }
  return null;
}

app.post('/api/simulate-notification', async (req, res) => {
  const { userKey, type, name } = req.body;
  const token = pushTokens.get(userKey);
  if (!token) return res.status(404).json({ error: 'No push token found' });
  
  let title = 'Notification';
  let body = 'You have a new notification';
  
  switch (type) {
    case 'missed_call':
      title = 'Missed Call';
      body = `Missed call from ${name || 'someone'}`;
      break;
    case 'call_request':
      title = 'Incoming Call';
      body = `You have a call request from ${name || 'someone'}`;
      break;
    case 'getting_online':
      title = 'Contact Online';
      body = `${name || 'Someone'} from your contacts is getting online`;
      break;
    case 'waiting_answer':
      title = 'Waiting for Answer';
      body = `${name || 'Someone'} is waiting for answer if you're online`;
      break;
  }
  
  await sendPushNotification(token, title, body);
  res.json({ success: true });
});

/**
 * POST /api/push-message
 * Called by a sender's device when they send a chat message to a partner.
 * The backend looks up the recipient's push token (from MongoDB or memory)
 * and forwards a push notification via the Expo Push API.
 * This fires even when the recipient app is completely closed.
 */
app.post('/api/push-message', async (req, res) => {
  try {
    const { recipientId, senderName, messageText, type = 'chat' } = req.body;
    if (!recipientId || !senderName) {
      return res.status(400).json({ error: 'recipientId and senderName are required' });
    }

    const token = await getPushTokenForUser(recipientId);
    if (!token) {
      console.log(`[Push] No push token found for recipient: ${recipientId}`);
      return res.json({ success: false, reason: 'no_token' });
    }

    const title = `💬 ${senderName}`;
    const body = messageText || 'Sent you a message';

    await sendPushNotification(token, title, body, {
      type,
      partnerId: recipientId,
      senderName,
    });

    console.log(`[Push] Sent message notification to ${recipientId} (${senderName})`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Push] push-message error:', err.message);
    res.status(500).json({ error: 'Failed to send push notification' });
  }
});

// Translate text endpoint
app.post('/api/translate', async (req, res) => {
  const { text, targetLang } = req.body;
  if (!text || !targetLang) {
    return res.status(400).json({ error: 'Missing text or targetLang' });
  }

  try {
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `You are a professional real-time chat translator. Translate the following user message into the target language "${targetLang}". Return ONLY the translated text. Do not include notes, explanations, or quotes: "${text}"`,
            },
          ],
        },
      ],
    };

    const response = await callGeminiWithRotation(payload);
    const translatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    res.json({ translatedText });
  } catch (error) {
    const upstreamStatus = error.response?.status || 500;
    const upstreamMessage = error.response?.data?.error?.message || error.message;
    console.error('Translation error:', error.response?.data || error.message);
    res.status(upstreamStatus >= 400 && upstreamStatus < 500 ? 502 : 500).json({
      error: 'Failed to translate text. All API keys may be exhausted.',
      details: upstreamMessage,
      model: GEMINI_MODEL,
    });
  }
});

// Translate voice endpoint (STT + Translation in single pass)
app.post('/api/translate-voice', upload.single('audio'), async (req, res) => {
  const { targetLang } = req.body;
  if (!req.file) {
    return res.status(400).json({ error: 'Missing audio file' });
  }
  if (!targetLang) {
    return res.status(400).json({ error: 'Missing targetLang' });
  }

  try {
    const base64Audio = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'audio/m4a';

    const payload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
            {
              text: `Transcribe this audio clip and translate it into the target language "${targetLang}". You MUST return only a raw JSON object in this format: { "transcription": "exact transcription in original language", "translation": "translated text" }. Do not wrap the JSON object in markdown blocks (e.g. do not use \`\`\`json).`,
            },
          ],
        },
      ],
    };

    const response = await callGeminiWithRotation(payload);

    let rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const result = JSON.parse(rawText);
    res.json(result);
  } catch (error) {
    const upstreamStatus = error.response?.status || 500;
    const upstreamMessage = error.response?.data?.error?.message || error.message;
    console.error('Voice translation error:', error.response?.data || error.message);
    res.status(upstreamStatus >= 400 && upstreamStatus < 500 ? 502 : 500).json({
      error: 'Failed to process voice translation. All API keys may be exhausted.',
      details: upstreamMessage,
      model: GEMINI_MODEL,
    });
  }
});

// AI Chat companion endpoint
app.post('/api/chat', async (req, res) => {
  const { message, language, history = [], userKey } = req.body;
  
  // Also accept text/targetLang for backward compatibility
  const text = message || req.body.text;
  const targetLang = language || req.body.targetLang;

  if (!text || !targetLang) {
    return res.status(400).json({ error: 'Missing text/message or targetLang/language' });
  }

  try {
    // Convert history format to Gemini format if provided
    const formattedHistory = history.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const payload = {
      contents: [
        ...formattedHistory,
        {
          role: 'user',
          parts: [
            {
              text: `You are a friendly, conversational AI companion in a language learning and translation app. Respond naturally to the user's message in "${targetLang}". Do NOT translate the user's message, just reply to it as a chat partner would. User message: "${text}"`,
            },
          ],
        },
      ],
    };

    const response = await callGeminiWithRotation(payload);
    const replyText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    // Send push notification if token exists
    if (userKey) {
      const token = pushTokens.get(userKey);
      if (token) {
        await sendPushNotification(token, 'New Message', `Incoming message from ${targetLang} partner`);
      }
    }

    res.json({ replyText });
  } catch (error) {
    const upstreamStatus = error.response?.status || 500;
    const upstreamMessage = error.response?.data?.error?.message || error.message;
    console.error('Chat error:', error.response?.data || error.message);
    res.status(upstreamStatus >= 400 && upstreamStatus < 500 ? 502 : 500).json({
      error: 'Failed to generate chat response. All API keys may be exhausted.',
      details: upstreamMessage,
    });
  }
});

// Contacts endpoints
app.post('/api/check-contacts', (req, res) => {
  try {
    const { phoneNumbers = [] } = req.body;
    
    if (!Array.isArray(phoneNumbers)) {
      return res.status(400).json({ error: 'phoneNumbers must be an array' });
    }

    // Mock implementation for prototype:
    // Determine if a user exists deterministically based on their phone number string length or characters
    // E.g., if phone number contains a '5' or ends in an even digit, we say they exist.
    const results = phoneNumbers.map((phone) => {
      // Remove all non-numeric characters for check
      const digits = phone.replace(/\D/g, '');
      const lastDigit = parseInt(digits.slice(-1) || '0', 10);
      
      const hasAccount = lastDigit % 2 === 0;

      return {
        phone,
        hasUnityAccount: hasAccount
      };
    });

    res.json({ contacts: results });
  } catch (error) {
    console.error('Check contacts error:', error);
    res.status(500).json({ error: 'Failed to check contacts.' });
  }
});

// Post feed endpoints
app.get('/api/posts', async (req, res) => {
  try {
    const userKey = req.query.userKey || req.header('x-user-key') || '';
    const posts = await getPostsList(userKey);
    res.json(posts);
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Failed to load posts.' });
  }
});

app.post('/api/posts', upload.array('images', 10), async (req, res) => {
  try {
    const {
      content,
      authorId = '',
      authorName = '',
      authorAvatar = '',
      authorFlag = '🌍',
      authorNativeLang = '',
      imageUrls = '[]',
    } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Missing content' });
    }

    let parsedImageUrls = [];
    try {
      parsedImageUrls = JSON.parse(imageUrls);
    } catch (e) {
      if (typeof imageUrls === 'string' && imageUrls.trim()) {
        parsedImageUrls = [imageUrls];
      }
    }

    let finalImageUrls = [...parsedImageUrls];
    let imageFileIds = [];
    
    if (req.files && req.files.length > 0) {
      if (!imagekit) {
        return res.status(503).json({ error: 'ImageKit is not configured on the server.' });
      }
      for (const file of req.files) {
        const url = await uploadImageToImageKit(file);
        if (url) {
          finalImageUrls.push(url);
          imageFileIds.push(url); // simplified
        }
      }
    }

    const newDoc = {
      postId: `post_${Date.now()}`,
      authorId,
      authorName,
      authorAvatar,
      authorFlag,
      authorNativeLang,
      content: content.trim(),
      imageUrls: finalImageUrls,
      imageFileIds: imageFileIds,
      likes: 0,
      likedBy: [],
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let saved;
    if (useMongo) {
      saved = await Post.create(newDoc);
    } else {
      saved = await saveMemoryPost(newDoc);
    }

    res.status(201).json(normalizePost(saved));
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: error.message || 'Failed to create post.' });
  }
});

app.post('/api/posts/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userKey = '' } = req.body;
    if (!userKey) {
      return res.status(400).json({ error: 'Missing userKey' });
    }

    if (useMongo) {
      const post = await Post.findOne({ postId });
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      const alreadyLiked = post.likedBy.includes(userKey);
      if (alreadyLiked) {
        post.likedBy = post.likedBy.filter((key) => key !== userKey);
        post.likes = Math.max(0, post.likes - 1);
      } else {
        post.likedBy.push(userKey);
        post.likes += 1;
      }
      post.updatedAt = new Date();
      await post.save();
      return res.json(normalizePost(post, userKey));
    }

    const post = memoryStore.posts.find((item) => item.postId === postId || item.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    post.likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
    const alreadyLiked = post.likedBy.includes(userKey);
    if (alreadyLiked) {
      post.likedBy = post.likedBy.filter((key) => key !== userKey);
      post.likes = Math.max(0, (post.likes || 0) - 1);
    } else {
      post.likedBy.push(userKey);
      post.likes = (post.likes || 0) + 1;
    }
    post.updatedAt = new Date().toISOString();
    await saveMemoryPost(post);
    return res.json(normalizePost(post, userKey));
  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({ error: 'Failed to update like.' });
  }
});

app.post('/api/posts/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const {
      id = `comment_${Date.now()}`,
      authorId = '',
      authorName = '',
      authorAvatar = '',
      content = '',
    } = req.body;

    if (!content.trim()) {
      return res.status(400).json({ error: 'Missing comment content' });
    }

    const comment = {
      id,
      authorId,
      authorName,
      authorAvatar,
      content: content.trim(),
      createdAt: new Date(),
    };

    if (useMongo) {
      const post = await Post.findOne({ postId });
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      post.comments.push(comment);
      post.updatedAt = new Date();
      await post.save();
      return res.json(normalizePost(post));
    }

    const post = memoryStore.posts.find((item) => item.postId === postId || item.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    post.comments = Array.isArray(post.comments) ? post.comments : [];
    post.comments.push(comment);
    post.updatedAt = new Date().toISOString();
    await saveMemoryPost(post);
    return res.json(normalizePost(post));
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment.' });
  }
});

app.delete('/api/posts/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userKey = '' } = req.body;

    if (useMongo) {
      const post = await Post.findOne({ postId });
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      if (userKey && userKey !== post.authorId && userKey !== post.authorName) {
        return res.status(403).json({ error: 'Not allowed to delete this post' });
      }
      await Post.deleteOne({ postId });
      return res.json({ success: true });
    }

    const post = await findPostById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (userKey && userKey !== post.authorId && userKey !== post.authorName) {
      return res.status(403).json({ error: 'Not allowed to delete this post' });
    }
    await deleteMemoryPost(postId);
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post.' });
  }
});

// Explore feed combines registered user profiles from DB/memory with presets
app.get('/api/explore', async (req, res) => {
  try {
    let registeredProfiles = [];
    if (useMongo) {
      const dbProfiles = await UserProfile.find().sort({ updatedAt: -1 }).lean();
      registeredProfiles = dbProfiles.map(p => ({
        id: p.uid,
        name: p.name,
        avatar: p.avatar,
        flag: p.flag,
        langName: p.langName,
        bio: p.bio,
        isUnityUser: true
      }));
    } else {
      registeredProfiles = Array.from(memoryUserProfiles.values()).map(p => ({
        id: p.uid,
        name: p.name,
        avatar: p.avatar,
        flag: p.flag,
        langName: p.langName,
        bio: p.bio,
        isUnityUser: true
      }));
    }

    // De-duplicate if any UID has same ID as preset, though not likely
    const allProfiles = [...registeredProfiles, ...EXPLORE_PEOPLE];
    const uniqueProfiles = [];
    const seenIds = new Set();
    for (const profile of allProfiles) {
      if (!seenIds.has(profile.id)) {
        seenIds.add(profile.id);
        uniqueProfiles.push(profile);
      }
    }

    res.json(uniqueProfiles);
  } catch (err) {
    console.error('Explore fetch error:', err);
    res.json(EXPLORE_PEOPLE); // fallback
  }
});

// POST /api/users - Create or update a user profile globally
app.post('/api/users', async (req, res) => {
  try {
    const { 
      uid, 
      name, 
      avatar = '', 
      flag = '🇺🇸', 
      langName = 'English', 
      bio = 'Available on Xaylite',
      email,
      authMethod,
      location,
      appVersion,
      platform,
      nativeLang = 'en',
      unityAILang = 'es',
      phone = '',
      nativeLangSelected = false,
      voiceAITrained = false,
      micTested = false
    } = req.body;
    
    if (!uid || !name) {
      return res.status(400).json({ error: 'uid and name are required' });
    }

    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const derivedEmail = email || `${cleanName || uid}@example.com`;
    
    let derivedAuthMethod = authMethod || 'email';
    if (uid.toLowerCase().includes('google')) derivedAuthMethod = 'google';
    else if (uid.toLowerCase().includes('apple')) derivedAuthMethod = 'apple';
    
    const derivedLocation = location || flagToCountry(flag);
    const derivedAppVersion = appVersion || '1.0.0';
    const derivedPlatform = platform || 'unknown';

    // Query existing to maintain original createdAt timestamp
    let existingUser = null;
    if (useMongo) {
      existingUser = await UserProfile.findOne({ uid }).lean();
    } else {
      existingUser = memoryUserProfiles.get(uid);
    }
    
    const derivedCreatedAt = existingUser ? (existingUser.createdAt || existingUser.createdAtDate || new Date()) : new Date();

    const profileData = {
      uid,
      name,
      avatar,
      flag,
      langName,
      bio,
      email: derivedEmail,
      authMethod: derivedAuthMethod,
      location: derivedLocation,
      appVersion: derivedAppVersion,
      platform: derivedPlatform,
      nativeLang,
      unityAILang,
      phone,
      nativeLangSelected,
      voiceAITrained,
      micTested,
      createdAt: derivedCreatedAt,
      updatedAt: new Date()
    };

    if (useMongo) {
      await UserProfile.findOneAndUpdate({ uid }, profileData, { upsert: true, new: true });
    } else {
      memoryUserProfiles.set(uid, profileData);
    }

    console.log(`[UserProfile] Synced profile globally for user: ${name} (${uid})`);
    res.json({ success: true, profile: profileData });
  } catch (err) {
    console.error('[UserProfile] Sync error:', err.message);
    res.status(500).json({ error: 'Failed to sync user profile' });
  }
});

// GET /api/users/email/:email - Check if user exists by email and return their profile
app.get('/api/users/email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(400).json({ error: 'email parameter is required' });
    }
    const targetEmail = email.trim().toLowerCase();
    
    let user = null;
    if (useMongo) {
      // Escape regex special characters
      const escapedEmail = targetEmail.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      user = await UserProfile.findOne({ email: new RegExp('^' + escapedEmail + '$', 'i') }).lean();
    } else {
      user = Array.from(memoryUserProfiles.values()).find(
        u => u.email && u.email.trim().toLowerCase() === targetEmail
      );
    }
    
    if (user) {
      console.log(`[UserProfile] Found existing profile by email: ${user.name} (${user.email})`);
      res.json({ success: true, exists: true, user });
    } else {
      console.log(`[UserProfile] No profile found for email: ${targetEmail}`);
      res.json({ success: true, exists: false });
    }
  } catch (err) {
    console.error('[UserProfile] Get by email error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve user profile by email' });
  }
});

// Active calling sessions store
const activeCalls = new Map();
const callAudioBuffers = new Map();
const callSubtitles = new Map();

// POST /api/calls/initiate - Initiate a call and send call request push notification
app.post('/api/calls/initiate', async (req, res) => {
  try {
    const { callerId, partnerId, callerName, callerAvatar } = req.body;
    if (!callerId || !partnerId) {
      return res.status(400).json({ error: 'callerId and partnerId are required' });
    }

    const callId = `call_${Date.now()}`;
    const callSession = {
      id: callId,
      callerId,
      partnerId,
      callerName,
      callerAvatar,
      status: 'ringing',
      createdAt: Date.now()
    };
    activeCalls.set(callId, callSession);
    callAudioBuffers.set(callId, []);

    // Dispatch incoming call push notification to the partner
    const token = await getPushTokenForUser(partnerId);
    if (token) {
      console.log(`[Calls] Sending incoming call push notification to ${partnerId}...`);
      sendPushNotification(token, '📞 Incoming Voice Call', `${callerName || 'Someone'} is calling you...`, {
        type: 'incoming_call',
        callId,
        callerId,
        callerName: callerName || 'Unknown Caller',
        callerAvatar: callerAvatar || ''
      }).catch(err => console.warn('[Calls] Push notification warning:', err.message));
    } else {
      console.log(`[Calls] No push token registered for target partner: ${partnerId}`);
    }

    res.json({ success: true, callId, status: 'ringing' });
  } catch (err) {
    console.error('[Calls] Initiate error:', err.message);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// POST /api/calls/accept - Accept the call
app.post('/api/calls/accept', (req, res) => {
  const { callId } = req.body;
  const session = activeCalls.get(callId);
  if (!session) {
    return res.status(404).json({ error: 'Call session not found' });
  }
  session.status = 'connected';
  console.log(`[Calls] Call ${callId} accepted and connected`);
  res.json({ success: true, status: 'connected' });
});

// POST /api/calls/reject - Reject the call
app.post('/api/calls/reject', (req, res) => {
  const { callId } = req.body;
  const session = activeCalls.get(callId);
  if (!session) {
    return res.status(404).json({ error: 'Call session not found' });
  }
  session.status = 'rejected';
  console.log(`[Calls] Call ${callId} rejected`);
  res.json({ success: true, status: 'rejected' });
});

// POST /api/calls/end - End the call
app.post('/api/calls/end', (req, res) => {
  const { callId } = req.body;
  const session = activeCalls.get(callId);
  if (session) {
    session.status = 'ended';
    console.log(`[Calls] Call ${callId} ended`);
  }
  res.json({ success: true, status: 'ended' });
});

// GET /api/calls/status/:callId - Get current status of call
app.get('/api/calls/status/:callId', (req, res) => {
  const { callId } = req.params;
  const session = activeCalls.get(callId);
  if (!session) {
    return res.json({ success: true, status: 'ended' });
  }
  res.json({ success: true, status: session.status, callerId: session.callerId, partnerId: session.partnerId });
});

// GET /api/calls/poll-active/:userId - Poll for any incoming call targeting this user
app.get('/api/calls/poll-active/:userId', (req, res) => {
  const { userId } = req.params;
  // Search active call sessions for any ringing call targeting this user
  const incoming = Array.from(activeCalls.values()).find(
    c => c.partnerId === userId && c.status === 'ringing'
  );
  if (incoming) {
    res.json({ success: true, incomingCall: incoming });
  } else {
    res.json({ success: true, incomingCall: null });
  }
});

// POST /api/calls/stream - Upload audio chunk
app.post('/api/calls/stream', (req, res) => {
  const { callId, senderId, audio } = req.body;
  if (!callId || !senderId || !audio) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const buffers = callAudioBuffers.get(callId) || [];
  buffers.push({
    senderId,
    audio,
    timestamp: Date.now()
  });

  // Keep last 25 chunks
  if (buffers.length > 25) {
    buffers.shift();
  }
  callAudioBuffers.set(callId, buffers);
  res.json({ success: true });
});

// GET /api/calls/poll-audio/:callId/:receiverId/:lastTimestamp - Poll new audio chunks
app.get('/api/calls/poll-audio/:callId/:receiverId/:lastTimestamp', (req, res) => {
  const { callId, receiverId, lastTimestamp } = req.params;
  const buffers = callAudioBuffers.get(callId) || [];
  const ts = parseInt(lastTimestamp) || 0;
  
  const newChunks = buffers.filter(
    chunk => chunk.senderId !== receiverId && chunk.timestamp > ts
  );
  
  res.json({ success: true, chunks: newChunks });
});

// POST /api/calls/subtitles - Submit a subtitle segment (transcription + translation)
app.post('/api/calls/subtitles', (req, res) => {
  const { callId, senderId, text, translation } = req.body;
  if (!callId || !senderId || !text) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const list = callSubtitles.get(callId) || [];
  list.push({
    senderId,
    text,
    translation: translation || '',
    timestamp: Date.now()
  });

  // Keep last 50 subtitle items
  if (list.length > 50) {
    list.shift();
  }
  callSubtitles.set(callId, list);
  res.json({ success: true });
});

// GET /api/calls/subtitles/:callId/:lastTimestamp - Poll new subtitles
app.get('/api/calls/subtitles/:callId/:lastTimestamp', (req, res) => {
  const { callId, lastTimestamp } = req.params;
  const list = callSubtitles.get(callId) || [];
  const ts = parseInt(lastTimestamp) || 0;

  const newSubtitles = list.filter(item => item.timestamp > ts);
  res.json({ success: true, subtitles: newSubtitles });
});

// POST /api/users/avatar - Upload profile avatar slot image to ImageKit using clean email-based filename
app.post('/api/users/avatar', upload.single('avatar'), async (req, res) => {
  try {
    const { uid, email = 'unknown', slotIndex = 0 } = req.body;
    if (!uid) {
      return res.status(400).json({ error: 'uid is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    if (!imagekit) {
      return res.status(503).json({ error: 'ImageKit is not configured' });
    }

    // Clean email to form a clean filename
    const cleanEmail = email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const fileName = `profile_${cleanEmail}_slot_${slotIndex}`;
    const data = req.file.buffer.toString('base64');

    // Upload to ImageKit (useUniqueFileName: false ensures overwriting old slots)
    const result = await imagekit.upload({
      file: data,
      fileName,
      folder: '/UnityApp/profiles',
      useUniqueFileName: false
    });

    console.log(`[ImageKit] Uploaded profile picture: ${fileName} -> ${result.url}`);
    res.json({ success: true, url: result.url });
  } catch (err) {
    console.error('[ImageKit] Profile upload error:', err.message);
    res.status(500).json({ error: 'Failed to upload profile picture to ImageKit' });
  }
});

// DELETE /api/users/:uid - Delete user profile globally on account deletion
app.delete('/api/users/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) {
      return res.status(400).json({ error: 'uid is required' });
    }

    if (useMongo) {
      await UserProfile.deleteOne({ uid });
    } else {
      memoryUserProfiles.delete(uid);
    }

    console.log(`[UserProfile] Deleted profile globally for user UID: ${uid}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[UserProfile] Delete profile error:', err.message);
    res.status(500).json({ error: 'Failed to delete user profile' });
  }
});

// Backup Endpoint (Weekly Sync backup)
app.post('/api/backup', async (req, res) => {
  try {
    const backupData = req.body;
    await fs.writeFile(
      path.join(__dirname, 'backup_store.json'),
      JSON.stringify(backupData, null, 2),
    );
    console.log('☁️ Backup successfully stored on server.');
    res.json({ success: true, message: 'Backup stored successfully' });
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'Failed to write backup data' });
  }
});
// --- Admin Analytics & Tracking ---
let adminLogQueue = [];
let adminClients = [];

app.post('/api/track', (req, res) => {
  try {
    const { event, user, details, platform } = req.body;
    let derivedPlatform = platform || 'server';
    if (event) {
      if (event.includes('(web)') || event.toLowerCase().includes('web')) {
        derivedPlatform = 'web';
      } else {
        derivedPlatform = 'app';
      }
    }
    const logEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      event: event || 'unknown',
      user: user || 'Anonymous',
      platform: derivedPlatform,
      details: details || {}
    };
    
    adminLogQueue.unshift(logEntry);
    if (adminLogQueue.length > 500) {
      adminLogQueue.pop(); // Keep only last 500
    }

    // Broadcast to SSE clients
    adminClients.forEach(client => {
      client.write(`data: ${JSON.stringify(logEntry)}\n\n`);
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to track event' });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    let totalRegistered = 0;
    if (useMongo) {
      totalRegistered = await UserProfile.countDocuments();
    } else {
      totalRegistered = memoryUserProfiles.size;
    }

    // Clean up active sessions older than 5 minutes
    const now = Date.now();
    for (const [userId, ts] of activeSessions.entries()) {
      if (now - ts > 300000) {
        activeSessions.delete(userId);
      }
    }
    const totalOnline = totalRegistered > 0 ? Math.max(1, activeSessions.size) : 0;

    let totalLogs = adminLogQueue.length;
    if (useMongo) {
      totalLogs = await ActivityLog.countDocuments();
    }
    let totalPopups = memoryStore.popups.length;
    if (useMongo) {
      totalPopups = await Popup.countDocuments();
    }
    res.json({
      totalRegistered,
      totalOnline,
      totalLogs,
      totalPopups
    });
  } catch (err) {
    let totalRegistered = 0;
    try {
      totalRegistered = useMongo ? await UserProfile.countDocuments() : memoryUserProfiles.size;
    } catch (_) {}

    res.json({
      totalRegistered: totalRegistered || 0,
      totalOnline: activeSessions.size,
      totalLogs: adminLogQueue.length,
      totalPopups: memoryStore.popups.length
    });
  }
});

app.delete('/api/admin/logs/clear', async (req, res) => {
  try {
    adminLogQueue.length = 0;
    memoryLogs.length = 0;
    if (useMongo) {
      await ActivityLog.deleteMany({});
    }
    
    // Broadcast clear event to all SSE clients
    adminClients.forEach(client => {
      client.write(`data: ${JSON.stringify({ type: 'clear' })}\n\n`);
    });

    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (err) {
    console.error('Failed to clear logs:', err);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    let users = [];
    if (useMongo) {
      users = await UserProfile.find().sort({ createdAt: -1 }).lean();
    } else {
      users = Array.from(memoryUserProfiles.values()).sort((a, b) => b.createdAt - a.createdAt);
    }
    
    const formattedUsers = users.map(user => ({
      uid: user.uid,
      name: user.name,
      avatar: user.avatar,
      flag: user.flag,
      langName: user.langName,
      bio: user.bio,
      email: user.email || `${user.name.toLowerCase().replace(/[^a-z0-9]/g, '') || user.uid}@example.com`,
      authMethod: user.authMethod || (user.uid.toLowerCase().includes('google') ? 'google' : (user.uid.toLowerCase().includes('apple') ? 'apple' : 'email')),
      location: user.location || flagToCountry(user.flag),
      appVersion: user.appVersion || '1.0.0',
      platform: user.platform || 'unknown',
      createdAt: user.createdAt || user.createdAtDate || user.updatedAt || new Date()
    }));

    res.json({ success: true, count: formattedUsers.length, users: formattedUsers });
  } catch (err) {
    console.error('Failed to fetch admin users:', err);
    res.status(500).json({ error: 'Failed to fetch user profiles' });
  }
});

app.post('/api/admin/notifications', async (req, res) => {
  try {
    const { type, title, body, icon, senderName, senderAvatar, targetEmail } = req.body;
    if (!type || !body) {
      return res.status(400).json({ error: 'type and body are required' });
    }

    const newNotif = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type,
      title: title || '',
      body,
      icon: icon || 'default',
      senderName: senderName || '',
      senderAvatar: senderAvatar || '',
      targetEmail: (targetEmail || '').trim().toLowerCase(),
      createdAt: new Date()
    };

    if (useMongo) {
      await NotificationModel.create(newNotif);
    } else {
      memoryNotifications.unshift(newNotif);
      if (memoryNotifications.length > 50) memoryNotifications.length = 50;
    }

    const target = newNotif.targetEmail ? `→ ${newNotif.targetEmail}` : '→ all users';
    console.log(`[Notification] Created campaign: type=${type}, target=${target}, body="${body}"`);
    res.json({ success: true, notification: newNotif });
  } catch (err) {
    console.error('Failed to create notification campaign:', err);
    res.status(500).json({ error: 'Failed to create notification campaign' });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const userEmail = (req.query.email || '').trim().toLowerCase();
    let latest = null;

    if (useMongo) {
      // Match broadcast (empty targetEmail) OR targeted to this specific user
      const query = userEmail
        ? { $or: [{ targetEmail: '' }, { targetEmail: userEmail }] }
        : { targetEmail: '' };
      latest = await NotificationModel.findOne(query).sort({ createdAt: -1 }).lean();
    } else {
      // In-memory: find latest notification that is broadcast or targeted at this user
      const candidates = memoryNotifications.filter(n =>
        !n.targetEmail || n.targetEmail === userEmail
      );
      latest = candidates[0] || null;
    }

    res.json({ success: true, latest });
  } catch (err) {
    console.error('Failed to poll latest notification:', err);
    res.status(500).json({ error: 'Failed to fetch latest notification' });
  }
});




app.get('/api/admin/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send recent history upon connect
  const history = [...adminLogQueue].reverse(); // send oldest first to newest
  res.write(`data: ${JSON.stringify({ type: 'history', logs: history })}\n\n`);

  adminClients.push(res);

  req.on('close', () => {
    adminClients = adminClients.filter(client => client !== res);
  });
});

// --- Popup Advert APIs ---

app.get('/api/admin/popups', async (req, res) => {
  try {
    const { appVersion } = req.query;
    let popups = [];

    if (useMongo) {
      popups = await Popup.find().sort({ createdAt: -1 }).lean();
    } else {
      popups = memoryStore.popups.slice().sort((a, b) => b.createdAt - a.createdAt);
    }

    if (appVersion) {
      popups = popups.filter(p => {
        if (p.isAppUpdate && p.targetVersion) {
          return p.targetVersion !== appVersion;
        }
        return true;
      });
    }

    return res.json({ success: true, popups });
  } catch (error) {
    console.error('Error fetching popups:', error);
    res.status(500).json({ error: 'Failed to fetch popups' });
  }
});

app.post('/api/admin/popups', upload.single('image'), async (req, res) => {
  try {
    const { title, subtopic, text, isImportant, actions, isAppUpdate, targetVersion, isInteractive, submitBtnText, formFields } = req.body;
    let imageUrl = '';

    if (req.file && imagekit) {
      const fileName = `popup_${Date.now()}`;
      const data = req.file.buffer.toString('base64');
      const result = await imagekit.upload({
        file: data,
        fileName,
        folder: '/UnityApp/popups',
      });
      imageUrl = result.url;
    }

    // Parse actions from string if it came as form-data
    let parsedActions = [];
    if (actions) {
      try { parsedActions = JSON.parse(actions); } catch(e) {}
    }

    let parsedFormFields = [];
    if (formFields) {
      try { parsedFormFields = JSON.parse(formFields); } catch(e) {}
    }

    let popupCount = 0;
    if (useMongo) {
      popupCount = await Popup.countDocuments();
    } else {
      popupCount = memoryStore.popups.length;
    }
    const newId = `pp${popupCount + 1}`;

    const newPopup = {
      id: newId,
      title,
      subtopic,
      text,
      isImportant: isImportant === 'true' || isImportant === true,
      isAppUpdate: isAppUpdate === 'true' || isAppUpdate === true,
      targetVersion: targetVersion || '',
      isInteractive: isInteractive === 'true' || isInteractive === true,
      submitBtnText: submitBtnText || 'Submit',
      formFields: parsedFormFields,
      actions: parsedActions,
      imageUrl,
      createdAt: new Date()
    };

    if (useMongo) {
      await Popup.create(newPopup);
    } else {
      memoryStore.popups.unshift(newPopup);
    }

    res.json({ success: true, popup: newPopup });
  } catch (error) {
    console.error('Error creating popup:', error);
    res.status(500).json({ error: 'Failed to create popup' });
  }
});

app.delete('/api/admin/popups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (useMongo) {
      await Popup.findOneAndDelete({ id });
    } else {
      memoryStore.popups = memoryStore.popups.filter(p => p.id !== id);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting popup:', error);
    res.status(500).json({ error: 'Failed to delete popup' });
  }
});

// Interactive Popup Replies Endpoints

app.post('/api/popups/:id/reply', async (req, res) => {
  try {
    const { id } = req.params;
    const { userName, appVersion, replyData } = req.body;

    const replyDoc = {
      popupId: id,
      userName: userName || 'xayLiteUser',
      appVersion: appVersion || 'Unknown',
      replyData: replyData || {},
      createdAt: new Date()
    };

    if (useMongo) {
      await PopupReply.create(replyDoc);
    } else {
      memoryStore.popupReplies.unshift(replyDoc);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving reply:', error);
    res.status(500).json({ error: 'Failed to save reply' });
  }
});

app.get('/api/admin/popups/:id/replies', async (req, res) => {
  try {
    const { id } = req.params;
    let replies = [];

    if (useMongo) {
      replies = await PopupReply.find({ popupId: id }).sort({ createdAt: -1 }).lean();
    } else {
      replies = memoryStore.popupReplies.filter(r => r.popupId === id);
    }

    res.json({ success: true, replies });
  } catch (error) {
    console.error('Error fetching replies:', error);
    res.status(500).json({ error: 'Failed to fetch replies' });
  }
});

/* ============================================================
   ACTIVITY LOGGING
   ============================================================ */

// POST /api/logs — receive a client-side activity log entry
app.post('/api/logs', async (req, res) => {
  try {
    const {
      event,
      method = '',
      userLabel = 'guest',
      email = '',
      platform = '',
      appVersion = '',
      error = '',
      meta = {},
    } = req.body;

    if (!event) {
      return res.status(400).json({ error: 'event is required' });
    }

    const entry = {
      event,
      method,
      userLabel,
      email,
      platform,
      appVersion,
      error,
      meta,
      createdAt: new Date(),
    };

    if (useMongo) {
      await ActivityLog.create(entry);
    } else {
      memoryLogs.unshift(entry);
      if (memoryLogs.length > 1000) memoryLogs.length = 1000; // cap in-memory
    }

    // Auto-enrich corresponding UserProfile with client log details on login_success
    if (event === 'login_success' && email) {
      const updates = {
        email,
        authMethod: method || 'email',
        appVersion,
        platform
      };
      try {
        if (useMongo) {
          await UserProfile.findOneAndUpdate(
            { email: email },
            { $set: updates },
            { new: true }
          );
        } else {
          for (const [uid, profile] of memoryUserProfiles.entries()) {
            if (profile.email === email || profile.uid === userLabel) {
              memoryUserProfiles.set(uid, { ...profile, ...updates });
              break;
            }
          }
        }
      } catch (err) {
        console.warn('[ActivityLog] Failed to auto-enrich user profile:', err.message);
      }
    }

    console.log(`[ActivityLog] ${entry.createdAt.toISOString()} | ${event} | ${userLabel} | ${platform} | ${error || 'ok'}`);
    
    // Broadcast to SSE clients and update live queue
    const sseEntry = {
      id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: entry.createdAt.toISOString(),
      event: entry.event || 'unknown',
      user: entry.userLabel || 'guest',
      platform: entry.platform || 'web',
      details: {
        method: entry.method,
        email: entry.email,
        appVersion: entry.appVersion,
        error: entry.error,
        meta: entry.meta
      }
    };
    adminLogQueue.unshift(sseEntry);
    if (adminLogQueue.length > 500) {
      adminLogQueue.pop();
    }
    adminClients.forEach(client => {
      client.write(`data: ${JSON.stringify(sseEntry)}\n\n`);
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[ActivityLog] Failed to save log:', err.message);
    res.status(500).json({ error: 'Failed to save log' });
  }
});

// GET /api/logs — retrieve recent logs (for admin/debugging)
app.get('/api/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const event = req.query.event || null;

    let logs;
    if (useMongo) {
      const query = event ? { event } : {};
      logs = await ActivityLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    } else {
      logs = event
        ? memoryLogs.filter(l => l.event === event).slice(0, limit)
        : memoryLogs.slice(0, limit);
    }

    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    console.error('[ActivityLog] Failed to fetch logs:', err.message);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Serve admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Amani AI server running on http://localhost:${PORT}`);
});
