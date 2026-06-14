import express from 'express';
import Order from '../models/Order.js';
import { protect, admin, sanitizeInput } from '../middleware/auth.js';

const router = express.Router();

// Helpers
const toNumber = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// Create new order (authenticated user)
router.post('/', protect, async (req, res) => {
  try {
    // Log body for debugging when needed
    console.log('Order POST body:', req.body);

    // Accept common frontend field names
    const name = req.body.name || req.body.fullName || '';
    const phone = req.body.phone || req.body.mobile || '';
    const address = req.body.address || req.body.addr || '';
    const city = req.body.city || req.body.province || '';

    // Try many variants for quantity/price to be robust
    const quantity = toNumber(req.body.quantity ?? req.body.selectedQuantity ?? req.body.qty ?? req.body.amount);
    const price = toNumber(req.body.price ?? req.body.selectedPrice ?? req.body.originalPrice ?? req.body.unitPrice ?? req.body.totalPrice ?? req.body.total ?? req.body.amountPrice);

    if (!name || !phone || !address || !city || !quantity || !price) {
      console.error('Order validation failed - missing fields', { name, phone, address, city, quantity, price });
      return res.status(400).json({ message: 'جميع الحقول مطلوبة: name, phone, address, city, quantity, price', received: { name, phone, address, city, quantity, price } });
    }

    // discount rate can come from env or default to 40
    const discountRate = toNumber(process.env.DEFAULT_DISCOUNT_RATE) ?? 40;

    const safeOrder = {
      user: req.user ? req.user._id : null,
      name: sanitizeInput(name),
      phone: sanitizeInput(phone),
      address: sanitizeInput(address),
      city: sanitizeInput(city),
      quantity,
      // keep compatibility with existing schema which expects `price`
      price: price,
      originalPrice: price,
      discountRate,
      finalPrice: +(price * (1 - discountRate / 100)).toFixed(2),
      status: 'pending'
    };

    const order = await Order.create(safeOrder);

    res.status(201).json(order);
  } catch (err) {
    console.error('Order POST error:', err);
    res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الطلب', error: err.message });
  }
});

// Create order for guest (no auth) - used by frontend when user isn't logged in
router.post('/guest', async (req, res) => {
  try {
    console.log('Guest Order POST body:', req.body);

    const name = req.body.name || '';
    const phone = req.body.phone || '';
    const address = req.body.address || '';
    const city = req.body.city || '';
    const quantity = toNumber(req.body.quantity ?? req.body.selectedQuantity ?? req.body.qty ?? req.body.amount);
    const price = toNumber(req.body.price ?? req.body.selectedPrice ?? req.body.originalPrice ?? req.body.unitPrice ?? req.body.totalPrice ?? req.body.total ?? req.body.amountPrice);

    if (!name || !phone || !address || !city || !quantity || !price) {
      console.error('Guest Order validation failed - missing fields', { name, phone, address, city, quantity, price });
      return res.status(400).json({ message: 'جميع الحقول مطلوبة للطلب كزائر', received: { name, phone, address, city, quantity, price } });
    }

    const discountRate = toNumber(process.env.DEFAULT_DISCOUNT_RATE) ?? 40;

    const order = await Order.create({
      user: null,
      name: sanitizeInput(name),
      phone: sanitizeInput(phone),
      address: sanitizeInput(address),
      city: sanitizeInput(city),
      quantity,
      // include `price` to satisfy existing schema
      price: price,
      originalPrice: price,
      discountRate,
      finalPrice: +(price * (1 - discountRate / 100)).toFixed(2),
      status: 'pending'
    });

    res.status(201).json(order);
  } catch (err) {
    console.error('Guest Order POST error:', err);
    res.status(500).json({ message: 'حدث خطأ أثناء إنشاء طلب الضيف', error: err.message });
  }
});

// Get current user's orders
router.get('/myorders', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error('Get my orders error:', err);
    res.status(500).json({ message: 'حدث خطأ في جلب الطلبات' });
  }
});

// Get all orders (admin only)
router.get('/', protect, admin, async (req, res) => {
  try {
    const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error('Get all orders error:', err);
    res.status(500).json({ message: 'حدث خطأ في جلب الطلبات' });
  }
});

// Update order status (admin only)
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

// Get order by ID (owner or admin)
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return res.status(404).json({ message: 'لم يتم العثور على الطلب' });

    // Ensure owner or admin
    if (order.user && order.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: 'غير مصرح' });
    }

    res.json(order);
  } catch (err) {
    console.error('Get order by id error:', err);
    res.status(500).json({ message: 'حدث خطأ في جلب الطلب' });
  }
});

// Public endpoint to check basic order status by ID (useful for guest tracking)
router.get('/track/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).select('status name createdAt finalPrice');
    if (!order) return res.status(404).json({ message: 'لم يتم العثور على الطلب' });
    res.json(order);
  } catch (err) {
    console.error('Track order error:', err);
    res.status(500).json({ message: 'حدث خطأ في تتبع الطلب' });
  }
});

export default router;
