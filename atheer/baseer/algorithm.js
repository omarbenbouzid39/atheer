/**
 * algorithm.js — محرك خوارزمية التوصيات
 * بصير — by omar benbouzid dev
 *
 * الخوارزمية هجين من ثلاثة أنظمة:
 *  1. Hot Score  — يجازي المحتوى الجيد الحديث
 *  2. Personal   — يُقرّب المحتوى من اهتمامات المستخدم
 *  3. Diversity  — يُنوّع المصادر والفئات
 */

const { Video, Like, Save, Comment, Follow, User } = require('./database');

// ─── الثوابت ──────────────────────────────────────────────────────────────────
const W = {
  like:    4,    // وزن الإعجاب
  save:    6,    // وزن الحفظ (أقوى دليل على القيمة)
  comment: 3,    // وزن التعليق
  view:    0.3,  // وزن المشاهدة (منخفض لأنها أقل تكلفة)
  gravity: 1.6,  // معامل تقادم المحتوى (كلما كبر كلما تراجع القديم أسرع)
  follow_bonus: 0.35,   // bonus لمن تتابعه
  interest_bonus: 0.20, // bonus للفئة المفضلة
};

const MAX_HISTORY      = 200; // أقصى عدد فيديوهات في سجل المشاهدة
const AUTHOR_DIVERSITY = 2;   // أقصى فيديو لنفس الصاحب في batch واحد
const SCORE_TTL_HOURS  = 1;   // إعادة حساب الـ score كل ساعة

// ─── 1. حساب الـ Hot Score لفيديو واحد ──────────────────────────────────────
/**
 * معادلة مستوحاة من Reddit HackerNews مع تعديلات للمحتوى المرئي
 * score = (likes*4 + saves*6 + comments*3 + views*0.3) / (age_hours + 2)^1.6
 */
function calcHotScore(likes, saves, comments, views, createdAt) {
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / 3600000;
  const engagement = (likes * W.like) + (saves * W.save) + (comments * W.comment) + (views * W.view);
  return engagement / Math.pow(ageHours + 2, W.gravity);
}

// ─── 2. تحديث score لفيديو واحد في DB ───────────────────────────────────────
async function refreshVideoScore(videoId) {
  try {
    const [likesCount, savesCount, commentsCount, video] = await Promise.all([
      Like.countDocuments({ video_id: videoId }),
      Save.countDocuments({ video_id: videoId }),
      Comment.countDocuments({ video_id: videoId }),
      Video.findById(videoId).select('views createdAt').lean(),
    ]);

    if (!video) return;

    const score = calcHotScore(likesCount, savesCount, commentsCount, video.views, video.createdAt);

    await Video.findByIdAndUpdate(videoId, {
      score,
      likes_cache:    likesCount,
      saves_cache:    savesCount,
      comments_cache: commentsCount,
    });

    return score;
  } catch (err) {
    console.error('[algo] refreshVideoScore error:', err.message);
  }
}

// ─── 3. تحديث scores لكل الفيديوهات (يُشغَّل كل ساعة) ──────────────────────
async function refreshAllScores() {
  const start = Date.now();
  try {
    const videos = await Video.find({ visibility: { $in: ['public', 'followers'] } })
      .select('_id views createdAt')
      .lean();

    const videoIds = videos.map(v => v._id);

    // جلب الإحصائيات بـ aggregate واحد
    const [allLikes, allSaves, allComments] = await Promise.all([
      Like.aggregate([
        { $match: { video_id: { $in: videoIds } } },
        { $group: { _id: '$video_id', count: { $sum: 1 } } },
      ]),
      Save.aggregate([
        { $match: { video_id: { $in: videoIds } } },
        { $group: { _id: '$video_id', count: { $sum: 1 } } },
      ]),
      Comment.aggregate([
        { $match: { video_id: { $in: videoIds } } },
        { $group: { _id: '$video_id', count: { $sum: 1 } } },
      ]),
    ]);

    const likesMap    = Object.fromEntries(allLikes.map(l => [l._id.toString(), l.count]));
    const savesMap    = Object.fromEntries(allSaves.map(s => [s._id.toString(), s.count]));
    const commentsMap = Object.fromEntries(allComments.map(c => [c._id.toString(), c.count]));

    // تحديث batch بدل N queries
    const bulkOps = videos.map(v => {
      const id = v._id.toString();
      const score = calcHotScore(
        likesMap[id] || 0,
        savesMap[id] || 0,
        commentsMap[id] || 0,
        v.views,
        v.createdAt,
      );
      return {
        updateOne: {
          filter: { _id: v._id },
          update: {
            $set: {
              score,
              likes_cache:    likesMap[id]    || 0,
              saves_cache:    savesMap[id]    || 0,
              comments_cache: commentsMap[id] || 0,
            },
          },
        },
      };
    });

    if (bulkOps.length) await Video.bulkWrite(bulkOps);

    console.log(`[algo] refreshAllScores: ${videos.length} videos in ${Date.now() - start}ms`);
  } catch (err) {
    console.error('[algo] refreshAllScores error:', err.message);
  }
}

// ─── 4. تسجيل مشاهدة + تحديث اهتمامات المستخدم ──────────────────────────────
async function recordView(userId, videoId) {
  try {
    const video = await Video.findById(videoId).select('category user_id').lean();
    if (!video) return;

    const updates = { $inc: { views: 1 } };
    await Video.findByIdAndUpdate(videoId, updates);

    if (userId) {
      // تحديث سجل المشاهدة واهتمامات الفئة
      await User.findByIdAndUpdate(userId, {
        $push: {
          watch_history: {
            $each:  [videoId],
            $slice: -MAX_HISTORY, // نحتفظ فقط بآخر 200
          },
        },
        $inc: { [`category_interests.${video.category}`]: 1 },
      });
    }

    // تحديث score الفيديو في background
    refreshVideoScore(videoId).catch(() => {});
  } catch (err) {
    console.error('[algo] recordView error:', err.message);
  }
}

// ─── 5. الخوارزمية الرئيسية — جلب الـ Feed المخصص ────────────────────────────
async function getPersonalizedFeed({ userId, category, page, limit }) {
  const skip = (page - 1) * limit;

  // ── بناء filter الرؤية ────────────────────────────────────────────────────
  let visFilter;
  if (userId) {
    const followingIds = await Follow.find({ follower_id: userId })
      .distinct('following_id');
    visFilter = {
      $or: [
        { visibility: 'public' },
        { user_id: userId },
        { visibility: 'followers', user_id: { $in: followingIds } },
      ],
    };
  } else {
    visFilter = { visibility: 'public' };
  }

  const baseFilter = { ...visFilter };
  if (category && category !== 'all') baseFilter.category = category;

  // ── جلب المستخدم لبيانات التخصيص ────────────────────────────────────────
  let watchedSet   = new Set();
  let followingSet = new Set();
  let interests    = {};

  if (userId) {
    const user = await User.findById(userId)
      .select('watch_history category_interests')
      .lean();

    if (user) {
      watchedSet   = new Set((user.watch_history || []).map(id => id.toString()));
      interests    = user.category_interests || {};
    }

    const follows = await Follow.find({ follower_id: userId }).distinct('following_id');
    followingSet  = new Set(follows.map(id => id.toString()));
  }

  // ── جلب مجموعة أكبر من المطلوب ثم نرتبها ─────────────────────────────────
  // نجلب limit*4 لأننا سنفلتر ونرتب
  const fetchLimit = limit * 4;

  const videos = await Video.find(baseFilter)
    .populate('user_id', 'name handle avatar_url verified')
    .sort({ score: -1, createdAt: -1 }) // الأفضل score أولاً
    .skip(skip)
    .limit(fetchLimit)
    .lean();

  const total = await Video.countDocuments(baseFilter);

  // ── حساب الـ personal score لكل فيديو ───────────────────────────────────
  const scored = videos.map(v => {
    let personalScore = v.score || 0;
    const vid = v._id.toString();
    const authorId = v.user_id?._id?.toString();

    // 1. bonus إذا شاهده المستخدم من قبل → عقوبة لا مكافأة (نُقلّل ظهوره)
    if (watchedSet.has(vid)) personalScore *= 0.1;

    // 2. bonus إذا الصاحب ممن يتابعهم
    if (authorId && followingSet.has(authorId)) personalScore *= (1 + W.follow_bonus);

    // 3. bonus بناءً على اهتمامات الفئة
    const catInterest = interests[v.category] || 0;
    const totalInterest = Object.values(interests).reduce((a, b) => a + b, 0) || 1;
    const catRatio = catInterest / totalInterest; // نسبة من 0 إلى 1
    personalScore *= (1 + catRatio * W.interest_bonus);

    return { ...v, personalScore };
  });

  // ── ترتيب بالـ personal score ─────────────────────────────────────────────
  scored.sort((a, b) => b.personalScore - a.personalScore);

  // ── تطبيق Diversity: لا أكثر من AUTHOR_DIVERSITY لنفس الصاحب ───────────
  const authorCount = {};
  const categoryCount = {};
  const diverse = [];

  for (const v of scored) {
    const authorId = v.user_id?._id?.toString() || 'unknown';
    const cat      = v.category || 'general';

    authorCount[authorId]  = (authorCount[authorId]  || 0);
    categoryCount[cat]     = (categoryCount[cat]     || 0);

    if (authorCount[authorId] >= AUTHOR_DIVERSITY) continue; // تخطّ هذا الفيديو

    authorCount[authorId]++;
    categoryCount[cat]++;
    diverse.push(v);

    if (diverse.length >= limit) break;
  }

  // إذا لم يكفِ بعد التنويع، أضف الباقي بدون قيد
  if (diverse.length < limit) {
    const diverseIds = new Set(diverse.map(v => v._id.toString()));
    for (const v of scored) {
      if (!diverseIds.has(v._id.toString())) {
        diverse.push(v);
        if (diverse.length >= limit) break;
      }
    }
  }

  return { videos: diverse, total };
}

// ─── 6. Trending المتقدم ─────────────────────────────────────────────────────
async function getTrending(limit = 10) {
  // نأخذ أفضل 50 بالـ score ثم نُعيد ترتيبها بـ score حقيقي
  const videos = await Video.find({ visibility: 'public' })
    .populate('user_id', 'name handle verified')
    .sort({ score: -1 })
    .limit(50)
    .lean();

  // إضافة تنوع في trending (لا يكون كله من نفس الشخص)
  const authorCount = {};
  const result = [];
  for (const v of videos) {
    const aid = v.user_id?._id?.toString() || 'x';
    authorCount[aid] = (authorCount[aid] || 0);
    if (authorCount[aid] >= 3) continue;
    authorCount[aid]++;
    result.push(v);
    if (result.length >= limit) break;
  }

  return result.map(v => ({
    id:            v._id,
    title:         v.title,
    category:      v.category,
    video_url:     v.video_url,
    thumbnail_url: v.thumbnail_url,
    views:         v.views,
    author_name:   v.user_id?.name,
    author_handle: v.user_id?.handle,
    verified:      v.user_id?.verified,
    likes_count:   v.likes_cache   || 0,
    saves_count:   v.saves_cache   || 0,
    score:         v.score         || 0,
  }));
}

// ─── 7. جدولة تحديث الـ scores كل ساعة ─────────────────────────────────────
function startScoreScheduler() {
  // تحديث فوري عند البدء
  setTimeout(refreshAllScores, 5000);
  // ثم كل ساعة
  setInterval(refreshAllScores, SCORE_TTL_HOURS * 3600 * 1000);
  console.log('[algo] Score scheduler started — updates every', SCORE_TTL_HOURS, 'hour(s)');
}

module.exports = {
  getPersonalizedFeed,
  getTrending,
  recordView,
  refreshVideoScore,
  refreshAllScores,
  startScoreScheduler,
  calcHotScore,
};
