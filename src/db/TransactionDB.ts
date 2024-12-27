import { Level } from 'level';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

// Transaction 接口定义
export interface Transaction {
  transactionHash: string;
  tokenAddress: string;
  pairAddress: string;
  buyCostVirtualAmount: string;
  buyTime: string;
  purchasedToken: string;
  sellTime?: string;
  soldVirtualAmount?: string;
  profit?: string;
  status: 'BOUGHT' | 'SOLD' | 'FAILED';
}

class TransactionDB {
  private db: Level<string, Transaction>;
  private static instance: TransactionDB;
  private isInitialized: boolean = false;

  private constructor() {
    const dbPath = path.join(__dirname, '../../data');
    
    // 确保数据库目录存在
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
    }
    
    this.db = new Level(dbPath, {
      valueEncoding: 'json'
    });
  }

  public static getInstance(): TransactionDB {
    if (!TransactionDB.instance) {
      TransactionDB.instance = new TransactionDB();
    }
    return TransactionDB.instance;
  }

  public async init(): Promise<void> {
    try {
      if (this.isInitialized) {
        logger.info('数据库已经初始化');
        return;
      }

      logger.info('正在打开 LevelDB 数据库...');
      await this.db.open();
      this.isInitialized = true;
      logger.info('LevelDB 数据库已打开');
    } catch (error: any) {
      if (error.code === 'LEVEL_LOCKED') {
        logger.warn('数据库被锁定，尝试重新打开...');
        try {
          // 等待一会儿再试
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.db.open();
          this.isInitialized = true;
          logger.info('数据库重新打开成功');
        } catch (retryError) {
          logger.error('重试打开数据库失败:', retryError);
          throw retryError;
        }
      } else {
        logger.error('打开 LevelDB 数据库时出错:', error);
        throw error;
      }
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.isInitialized) {
        await this.db.close();
        this.isInitialized = false;
        logger.info('数据库已关闭');
      }
    } catch (error) {
      logger.error('关闭数据库时出错:', error);
      throw error;
    }
  }

  public async saveTransaction(transaction: Transaction): Promise<void> {
    try {
      await this.db.put(transaction.transactionHash, transaction);
    } catch (error) {
      logger.error('保存交易记录时出错:', error);
      throw error;
    }
  }

  public async updateTransaction(hash: string, updates: Partial<Transaction>): Promise<void> {
    try {
      const transaction = await this.db.get(hash);
      const updatedTransaction = { ...transaction, ...updates };
      await this.db.put(hash, updatedTransaction);
    } catch (error) {
      logger.error('更新交易记录时出错:', error);
      throw error;
    }
  }

  public async getAllTransactions(): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    try {
      // 确保数据库已初始化
      if (!this.isInitialized) {
        await this.init();
      }

      // 使用新的迭代器
      const iterator = this.db.iterator();
      try {
        for await (const [key, value] of iterator) {
          transactions.push(value);
        }
      } finally {
        // 确保迭代器被正确关闭
        await iterator.close();
      }
      
      return transactions;
    } catch (error) {
      logger.error('获取所有交易记录时出错:', error);
      throw error;
    }
  }

  public async getAllBoughtTransactions(): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    try {
      // 确保数据库已初始化
      if (!this.isInitialized) {
        await this.init();
      }

      // 使用新的迭代器
      const iterator = this.db.iterator();
      try {
        for await (const [key, value] of iterator) {
          if (value.status === 'BOUGHT') {
            transactions.push(value);
          }
        }
      } finally {
        // 确保迭代器被正确关闭
        await iterator.close();
      }
      
      return transactions;
    } catch (error) {
      logger.error('获取已买入交易记录时出错:', error);
      throw error;
    }
  }

  public async getTransaction(hash: string): Promise<Transaction | null> {
    try {
      const transaction = await this.db.get(hash);
      return transaction;
    } catch (error: any) {
      if (error.notFound) {
        return null;
      }
      logger.error('获取交易记录时出错:', error);
      throw error;
    }
  }
}

// 导出单例实例
export const transactionDB = TransactionDB.getInstance();