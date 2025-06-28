import jwt from 'jsonwebtoken';

export const protect = (req, res, next) => {
  // ابحث عن التوكن في الكوكيز أولاً، ثم في الهيدر
  let token = req.cookies?.token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      // دعم req.user._id حتى لو كان التوكن فيه id فقط
      if (decoded.id && !decoded._id) req.user._id = decoded.id;
      next();
    } catch (err) {
      return res.status(401).json({ message: 'غير مصرح' });
    }
  } else {
    return res.status(401).json({ message: 'غير مصرح' });
  }
};

export const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(403).json({ message: 'غير مصرح (أدمن فقط)' });
  }
};

// sanitize inputs util
export function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>"'`]/g, '');
}
