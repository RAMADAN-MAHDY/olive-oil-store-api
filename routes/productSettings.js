import express from 'express';
import ProductSettings from '../models/ProductSettings.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// جلب إعدادات المنتج (عام)
router.get('/settings', async (req, res) => {
    try {
        let settings = await ProductSettings.findOne();
        if (!settings) {
            // إذا لم توجد إعدادات، أنشئ إعدادات افتراضية
            settings = await ProductSettings.create({
                price: 120,
                mainDiscount: 40,
                quantityOptions: [
                    { quantity: 1, price: 120, discount: 0 },
                    { quantity: 2, price: 200, discount: 40 },
                    { quantity: 3, price: 270, discount: 90 },
                    { quantity: 4, price: 320, discount: 160 }
                ]
            });
        }
        // تحويل البيانات إلى نفس شكل الواجهة القديمة (للتوافق)
        res.json({
            originalPrice: settings.price,
            discountedPrice: settings.quantityOptions[0] ? settings.quantityOptions[0].price : settings.price,
            discountPercent: settings.mainDiscount,
            quantities: (settings.quantityOptions || []).map(q => ({
                label: (q.quantity > 1 ? q.quantity + ' عبوات' : 'عبوة واحدة'),
                quantity: q.quantity,
                price: q.price,
                save: q.discount || 0
            }))
        });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في جلب إعدادات المنتج' });
    }
});

// تعديل إعدادات المنتج (أدمن فقط)
router.put('/settings', protect, admin, async (req, res) => {
    try {
        let settings = await ProductSettings.findOne();
        if (!settings) {
            // تحويل body إلى الحقول الصحيحة
            settings = new ProductSettings({
                price: req.body.originalPrice,
                mainDiscount: req.body.discountPercent,
                quantityOptions: (req.body.quantities || []).map(q => ({
                    quantity: q.quantity,
                    price: q.price,
                    discount: q.save || 0
                }))
            });
        } else {
            settings.price = req.body.originalPrice;
            settings.mainDiscount = req.body.discountPercent;
            settings.quantityOptions = (req.body.quantities || []).map(q => ({
                quantity: q.quantity,
                price: q.price,
                discount: q.save || 0
            }));
        }
        settings.updatedAt = new Date();
        await settings.save();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: 'خطأ في تحديث إعدادات المنتج' });
    }
});

export default router;
