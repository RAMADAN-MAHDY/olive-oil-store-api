import express from 'express';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/user/register
// @desc    Register new user
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        // تحقق من صحة البريد
        const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
        if (!emailRegex.test(email)) return res.status(400).json({ message: 'البريد الإلكتروني غير صالح' });
        // تحقق من قوة كلمة المرور
        if (!password || password.length < 6) return res.status(400).json({ message: 'كلمة المرور يجب ألا تقل عن 6 أحرف' });
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: 'البريد الإلكتروني مستخدم بالفعل' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: 'تم إنشاء المستخدم بنجاح' });
    } catch (err) {
        res.status(500).json({ message: 'حدث خطأ بالخادم' });
    }
});

// @route   POST /api/user/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        // توليد JWT
        const token = jwt.sign({ id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });
        // إرسال التوكن في كوكيز httpOnly
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            // sameSite: 'lax', // يمكن تغييره إلى 'strict' حسب الحاجة
            sameSite: 'none', // إذا كنت تريد استخدام نفس الموقع فقط
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 أيام
        });
        res.json({ message: 'تم تسجيل الدخول بنجاح', user: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
    } catch (err) {
        res.status(500).json({ message: 'حدث خطأ بالخادم' });
    }
});

// راوتر التحقق من تسجيل الدخول
router.get('/check', protect, (req, res) => {
  res.json({ user: req.user });
});

export default router;
