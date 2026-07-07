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
    content: 'Preparando la presentación para la cumbre europea de mañana. Gracias a Dios por la traducción de documentos en tiempo real de Unity, me ahorró horas de trabajo duro. 💼🇪🇺',
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
  },
  {
    id: 'e2',
    name: 'Hiroshi Sato',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80',
    flag: '🇯🇵',
    langName: 'Japanese (Japan)',
    bio: 'Tech enthusiast and history buff. Happy to translate and chat!',
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

if (hasMongo) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected.');
    useMongo = true;
  } catch (error) {
    console.error('MongoDB connection failed, falling back to memory store:', error.message);
  }
}

mongoose.connection.on('connected', () => {
  console.log('Mongoose connection established/restored.');
  useMongo = true;
});

mongoose.connection.on('disconnected', () => {
  console.warn('Mongoose connection disconnected.');
  useMongo = false;
});

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

app.post('/api/register-push', (req, res) => {
  const { userKey, token } = req.body;
  if (userKey && token) {
    pushTokens.set(userKey, token);
  }
  res.json({ success: true });
});

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

// Explore feed stays as a lightweight directory of people.
app.get('/api/explore', (req, res) => {
  res.json(EXPLORE_PEOPLE);
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
    const { event, user, details } = req.body;
    const logEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      event: event || 'unknown',
      user: user || 'Anonymous',
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

app.get('/api/admin/stats', (req, res) => {
  // Simple mock metrics for now, or you could count unique users seen today
  res.json({
    totalRegistered: 1248, // Or however you track this
    totalOnline: Math.floor(Math.random() * 50) + 10 // Mock dynamic number
  });
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

    console.log(`[ActivityLog] ${entry.createdAt.toISOString()} | ${event} | ${userLabel} | ${platform} | ${error || 'ok'}`);
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
