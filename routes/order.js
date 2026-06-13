import express from 'express';
import Order from '../models/Order.js';
import { protect, admin, sanitizeInput } from '../middleware/auth.js';

const router = express.Router();

// إنشاء طلب جديد (مستخدم مسجل)
router.post('/', protect, async (req, res) => {
  try {
    const { name, phone, address, city, quantity, price } = req.body;
    if (!name || !phone || !address || !city || !quantity || !price) {
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    }

    const safeAddress = sanitizeInput(address);
    const order = await Order.create({
      user: req.user._id,
      name: sanitizeInput(name),
      phone: sanitizeInput(phone),
      address: safeAddress,
      city: sanitizeInput(city),
      quantity: sanitizeInput(quantity),
      price: sanitizeInput(price)
    });

    res.status(201).json(order);
  } catch (err) {
    console.error('Order POST error:', err);
    res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الطلب', error: err.message });
  }
});

// جلب طلبات المستخدم الحالي
router.get('/myorders', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error('Get my orders error:', err);
    res.status(500).json({ message: 'حدث خطأ في جلب الطلبات' });
  }
});

// جلب كل الطلبات (أدمن فقط)
router.get('/', protect, admin, async (req, res) => {
  try {
    const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error('Get all orders error:', err);
    res.status(500).json({ message: 'حدث خطأ في جلب الطلبات' });
  }
});

// تحديث حالة الطلب (أدمن فقط)
router.put('/:id/status', protect, admin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'حالة الطلب مطلوبة' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'لم يتم العثور على الطلب' });

    order.status = sanitizeInput(status);
    await order.save();

    res.json(order);
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ message: 'حدث خطأ في تحديث حالة الطلب' });
  }
});

// جلب طلب بالـ ID (صاحب الطلب أو أدمن)
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return res.status(404).json({ message: 'لم يتم العثور على الطلب' });

    // تأكد أن صاحب الطلب أو أدمن
    if (order.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: 'غير مصرح' });
    }

    res.json(order);
  } catch (err) {
    console.error('Get order by id error:', err);
    res.status(500).json({ message: 'حدث خطأ في جلب الطلب' });
  }
});

export default router;
