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

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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
    imageUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80',
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
    imageUrl: '',
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
};

const hasMongo = Boolean(process.env.MONGODB_URI);
const hasImageKit = Boolean(
  process.env.IMAGEKIT_PUBLIC_KEY &&
    process.env.IMAGEKIT_PRIVATE_KEY &&
    process.env.IMAGEKIT_URL_ENDPOINT,
);

if (hasMongo) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected.');
  } catch (error) {
    console.error('MongoDB connection failed, falling back to memory store:', error.message);
  }
}

const useMongo = mongoose.connection.readyState === 1;

const imagekit = hasImageKit
  ? new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    })
  : null;

if (!useMongo) {
  console.warn('Post storage running in memory mode. Set MONGODB_URI and IMAGEKIT_* env vars for persistence and cloud uploads.');
}

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
    imageUrl: { type: String, default: '' },
    imageFileId: { type: String, default: '' },
    likes: { type: Number, default: 0 },
    likedBy: { type: [String], default: [] },
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true },
);

const Post = mongoose.models.Post || mongoose.model('Post', postSchema);

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
    imageUrl: post.imageUrl || '',
    image: post.imageUrl || '',
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

// Translate text endpoint
app.post('/api/translate', async (req, res) => {
  const { text, targetLang } = req.body;
  if (!text || !targetLang) {
    return res.status(400).json({ error: 'Missing text or targetLang' });
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(500).json({ error: 'Gemini API Key is not configured on the server.' });
  }

  try {
    console.log("Using API KEY:", apiKey);
    console.log("Using MODEL:", GEMINI_MODEL);
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            parts: [
              {
                text: `You are a professional real-time chat translator. Translate the following user message into the target language "${targetLang}". Return ONLY the translated text. Do not include notes, explanations, or quotes: "${text}"`,
              },
            ],
          },
        ],
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    const translatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    res.json({ translatedText });
  } catch (error) {
    const upstreamStatus = error.response?.status || 500;
    const upstreamMessage = error.response?.data?.error?.message || error.message;
    console.error('Translation error:', error.response?.data || error.message);
    res.status(upstreamStatus >= 400 && upstreamStatus < 500 ? 502 : 500).json({
      error: 'Failed to translate text.',
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

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(500).json({ error: 'Gemini API Key is not configured on the server.' });
  }

  try {
    const base64Audio = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'audio/m4a';

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
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
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

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
      error: 'Failed to process voice translation.',
      details: upstreamMessage,
      model: GEMINI_MODEL,
    });
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

app.post('/api/posts', upload.single('image'), async (req, res) => {
  try {
    const {
      content,
      authorId = '',
      authorName = '',
      authorAvatar = '',
      authorFlag = '🌍',
      authorNativeLang = '',
      imageUrl = '',
    } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Missing content' });
    }

    let finalImageUrl = imageUrl || '';
    let imageFileId = '';
    if (req.file) {
      if (!imagekit) {
        return res.status(503).json({ error: 'ImageKit is not configured on the server.' });
      }
      finalImageUrl = await uploadImageToImageKit(req.file);
      imageFileId = finalImageUrl;
    }

    const newDoc = {
      postId: `post_${Date.now()}`,
      authorId,
      authorName,
      authorAvatar,
      authorFlag,
      authorNativeLang,
      content: content.trim(),
      imageUrl: finalImageUrl,
      imageFileId,
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

app.listen(PORT, () => {
  console.log(`🚀 Amani AI server running on http://localhost:${PORT}`);
});
