import express from 'express';
import Order from '../models/Order.js';
import { protect, admin, sanitizeInput } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/order
// @desc    Create new order (linked to user)
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    // تعقيم جميع المدخلات النصية
    const name = sanitizeInput(req.body.name);
    const phone = sanitizeInput(req.body.phone);
    const address = sanitizeInput(req.body.address);
    const city = sanitizeInput(req.body.city);
    const selectedQuantity = sanitizeInput(req.body.selectedQuantity);
    const selectedPrice = sanitizeInput(req.body.selectedPrice);
    const orderData = { name, phone, address, city, quantity: selectedQuantity, price: selectedPrice, user: req.user.id };
    const order = new Order(orderData);
    await order.save();
    res.status(201).json({ message: 'Order created successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// جلب الطلبات الخاصة بالمستخدم الحالي
router.get('/myorders', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'حدث خطأ أثناء جلب الطلبات' });
  }
});

// جلب كل الطلبات (للأدمن فقط)
router.get('/all', protect, admin, async (req, res) => {
  try {
    const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'حدث خطأ أثناء جلب كل الطلبات' });
  }
});

// جلب كل المستخدمين مع طلباتهم (للأدمن)
router.get('/admin/users', protect, admin, async (req, res) => {
  try {
    // جلب كل المستخدمين
    const users = await (await import('../models/User.js')).default.find({}, 'name email');
    // جلب كل الطلبات مع user
    const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 });
    // ربط الطلبات بالمستخدمين
    const usersWithOrders = users.map(user => {
      const userOrders = orders.filter(order => order.user && order.user._id.toString() === user._id.toString());
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        orders: userOrders
      };
    });
    res.json(usersWithOrders);
  } catch (err) {
    res.status(500).json({ message: 'حدث خطأ أثناء جلب بيانات المستخدمين والطلبات' });
  }
});

// تعديل حالة الطلب (للأدمن فقط)
router.patch('/:id/status', protect, admin, async (req, res) => {
  try {
    const { status } = req.body;
    // تحقق من أن الحالة من القيم المسموحة فقط
    const allowed = ['تم القبول', 'جاري التجهيز', 'جاري التوصيل', 'تم التسليم', 'تم التوصيل'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'قيمة الحالة غير مسموحة' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
    order.status = status;
    await order.save();
    res.json({ message: 'تم تحديث حالة الطلب بنجاح', order });
  } catch (err) {
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث الحالة' });
  }
});

export default router;
