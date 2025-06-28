import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import orderRoutes from './routes/order.js';
import userRoutes from './routes/user.js';
import reviewRoutes from './routes/review.js';
import productSettingsRoutes from './routes/productSettings.js';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

dotenv.config();
connectDB();

const app = express();

// Rate limiting: 100 requests لكل 15 دقيقة لكل IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: 'تم تجاوز الحد المسموح من الطلبات، حاول لاحقاً.' }
});
app.use(limiter);

// CORS أكثر أماناً
const allowedOrigins = [
    'https://olive-oil-store-tau.vercel.app',
    // 'http://localhost:3000'
];
app.use(cors({
    origin: function (origin, callback) {
        // السماح بعدم وجود origin (مثل Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Example route
app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use('/api/order', orderRoutes);
app.use('/api/user', userRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/product', productSettingsRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));
