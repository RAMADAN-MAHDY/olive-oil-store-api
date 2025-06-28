import express from 'express';
import Review from '../models/Review.js';
import { protect, sanitizeInput } from '../middleware/auth.js';

const router = express.Router();

// إضافة تقييم جديد (يرتبط باليوزر)
router.post('/', protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating) return res.status(400).json({ message: 'يرجى اختيار التقييم' });
    // تأكد من وجود req.user._id
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'مستخدم غير مصرح' });
    }
    // تعقيم التعليق
    const safeComment = sanitizeInput(comment);
    const review = await Review.create({
      user: req.user._id,
      rating,
      comment: safeComment
    });
    res.status(201).json(review);
  } catch (err) {
    console.error('Review POST error:', err);
    res.status(500).json({ message: 'حدث خطأ أثناء إضافة التقييم', error: err.message });
  }
});

// جلب كل التقييمات مع اسم المستخدم
router.get('/', async (req, res) => {
  try {
    const reviews = await Review.find().populate('user', 'name');
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: 'حدث خطأ أثناء جلب التقييمات' });
  }
});

export default router;
