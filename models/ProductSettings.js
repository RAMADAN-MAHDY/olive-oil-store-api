import mongoose from 'mongoose';

const productSettingsSchema = new mongoose.Schema({
  price: {
    type: Number,
    required: true,
    default: 120
  },
  quantityOptions: {
    type: [
      {
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        discount: { type: Number, default: 0 } // نسبة الخصم أو قيمة الخصم
      }
    ],
    default: [
      { quantity: 1, price: 120, discount: 0 },
      { quantity: 2, price: 200, discount: 40 },
      { quantity: 3, price: 270, discount: 90 },
      { quantity: 4, price: 320, discount: 160 }
    ]
  },
  mainDiscount: {
    type: Number,
    default: 40 // خصم افتراضي
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const ProductSettings = mongoose.model('ProductSettings', productSettingsSchema);
export default ProductSettings;
