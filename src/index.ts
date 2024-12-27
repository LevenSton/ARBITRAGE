import dotenv from 'dotenv';
import { MonitorService } from './services/MonitorService';
import { logger } from './utils/logger';

// 加载环境变量
dotenv.config();

async function main() {
  try {
    // 启动监控服务
    const monitorService = new MonitorService();
    await monitorService.start();
    
    logger.info('监控服务已启动');

    // 处理进程退出
    process.on('SIGINT', async () => {
      logger.info('正在关闭服务...');
      await monitorService.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('启动服务时出错:', error);
    process.exit(1);
  }
}

main();
