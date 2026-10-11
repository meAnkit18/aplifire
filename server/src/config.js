export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@local',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  tokenKey: process.env.TOKEN_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
};
