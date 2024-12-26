import winston from 'winston';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// 确保日志目录存在
const logDir = join(__dirname, '../../logs');
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.json()
  ),
  transports: [
    // 错误日志
    new winston.transports.File({ 
      filename: join(logDir, 'error.log'),
      level: 'error'
    }),
    // 所有日志
    new winston.transports.File({ 
      filename: join(logDir, 'combined.log')
    }),
    // 只在开发环境下输出到控制台
    ...(process.env.NODE_ENV === 'development' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});
