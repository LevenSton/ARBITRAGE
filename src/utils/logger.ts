import winston from 'winston';
import path from 'path';
import fs from 'fs';

// 确保日志目录存在
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 创建自定义格式
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 创建 logger 实例
export const logger = winston.createLogger({
  level: 'info',
  format: customFormat,
  transports: [
    // 错误日志文件
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'),
      level: 'error'
    }),
    // 组合日志文件
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log')
    })
  ],
  // 处理异常和拒绝
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logDir, 'exceptions.log')
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logDir, 'rejections.log')
    })
  ]
});

// 如果不是生产环境，也输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    silent: true // 禁用控制台输出
  }));
}
